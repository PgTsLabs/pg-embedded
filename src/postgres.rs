use napi_derive::napi;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use crate::{
    error::{setup_error, start_error, stop_error, database_error, convert_postgresql_error, timeout_error},
    logger::pg_log,
    settings::PostgresSettings,
    types::{ConnectionInfo, InstanceState},
};

/// PostgreSQL 实例管理器
#[napi]
pub struct PostgresInstance {
    /// 异步实例
    async_instance: Option<postgresql_embedded::PostgreSQL>,
    /// 同步实例
    blocking_instance: Option<postgresql_embedded::blocking::PostgreSQL>,
    /// 配置设置
    settings: postgresql_embedded::Settings,
    /// 实例状态
    state: Arc<Mutex<InstanceState>>,
    /// 实例ID，用于跟踪和调试
    instance_id: String,
}

impl Drop for PostgresInstance {
    fn drop(&mut self) {
        pg_log!(info, "Dropping PostgresInstance {} - cleaning up resources", self.instance_id);
        
        // 尝试停止异步实例
        if let Some(_instance) = self.async_instance.take() {
            pg_log!(debug, "Cleaning up async PostgreSQL instance for {}", self.instance_id);
            // 注意：在 Drop 中我们不能使用 async，所以这里只是记录日志
            // 实际的清理会由 postgresql_embedded 库的 Drop 实现处理
        }
        
        // 尝试停止同步实例
        if let Some(mut instance) = self.blocking_instance.take() {
            pg_log!(debug, "Cleaning up blocking PostgreSQL instance for {}", self.instance_id);
            // 尝试同步停止
            if let Err(e) = instance.stop() {
                pg_log!(warn, "Failed to stop PostgreSQL instance {} during cleanup: {}", self.instance_id, e);
            }
        }
        
        // 更新状态为已停止
        if let Ok(mut state) = self.state.lock() {
            *state = InstanceState::Stopped;
        }
        
        pg_log!(info, "PostgresInstance {} cleanup completed", self.instance_id);
    }
}

#[napi]
impl PostgresInstance {
    /// 构造函数
    #[napi(constructor)]
    pub fn new(settings: Option<PostgresSettings>) -> napi::Result<Self> {
        let postgres_settings = settings.unwrap_or_default();
        let embedded_settings = postgres_settings.to_embedded_settings()?;
        let instance_id = uuid::Uuid::new_v4().to_string();

        pg_log!(info, "Creating new PostgresInstance with ID: {}", instance_id);

        Ok(Self {
            async_instance: None,
            blocking_instance: None,
            settings: embedded_settings,
            state: Arc::new(Mutex::new(InstanceState::Stopped)),
            instance_id,
        })
    }

    /// 获取实例ID
    #[napi(getter)]
    pub fn get_instance_id(&self) -> String {
        self.instance_id.clone()
    }

    /// 获取当前状态
    #[napi(getter)]
    pub fn get_state(&self) -> napi::Result<InstanceState> {
        let state = self.state.lock()
            .map_err(|_| setup_error("Failed to acquire state lock"))?;
        Ok(match *state {
            InstanceState::Stopped => InstanceState::Stopped,
            InstanceState::Starting => InstanceState::Starting,
            InstanceState::Running => InstanceState::Running,
            InstanceState::Stopping => InstanceState::Stopping,
        })
    }

    /// 获取连接信息
    #[napi(getter)]
    pub fn get_connection_info(&self) -> napi::Result<ConnectionInfo> {
        let state = self.state.lock()
            .map_err(|_| setup_error("Failed to acquire state lock"))?;
        
        match *state {
            InstanceState::Running => {
                // 从设置中提取连接信息
                let host = self.settings.host.clone();
                let port = self.settings.port;
                let username = self.settings.username.clone();
                let password = self.settings.password.clone();
                let database_name = "postgres".to_string(); // postgresql_embedded 默认数据库名

                Ok(ConnectionInfo::new(host, port, username, password, database_name))
            }
            _ => Err(setup_error("PostgreSQL instance is not running")),
        }
    }

    /// 设置状态
    fn set_state(&self, new_state: InstanceState) -> napi::Result<()> {
        let mut state = self.state.lock()
            .map_err(|_| setup_error("Failed to acquire state lock"))?;
        
        // 记录状态变化
        pg_log!(debug, "State transition: {:?} -> {:?}", *state, new_state);
        *state = new_state;
        Ok(())
    }

    /// 安全地检查是否可以执行操作
    fn can_perform_operation(&self, required_state: InstanceState) -> napi::Result<bool> {
        let state = self.state.lock()
            .map_err(|_| setup_error("Failed to acquire state lock"))?;
        
        Ok(matches!(*state, state if state == required_state))
    }

    /// 检查实例是否健康
    #[napi]
    pub fn is_healthy(&self) -> napi::Result<bool> {
        let state = self.get_state()?;
        
        match state {
            InstanceState::Running => {
                // 检查实例是否真的在运行
                let has_async = self.async_instance.is_some();
                let has_blocking = self.blocking_instance.is_some();
                
                Ok(has_async || has_blocking)
            }
            _ => Ok(false)
        }
    }

    /// 异步设置方法
    #[napi]
    pub async unsafe fn setup(&mut self) -> napi::Result<()> {
        pg_log!(info, "Starting PostgreSQL setup on port {}", self.settings.port);
        self.set_state(InstanceState::Starting)?;
        
        let mut instance = postgresql_embedded::PostgreSQL::new(self.settings.clone());
        match instance.setup().await {
            Ok(_) => {
                pg_log!(info, "PostgreSQL setup completed successfully");
                self.async_instance = Some(instance);
                Ok(())
            }
            Err(e) => {
                pg_log!(error, "PostgreSQL setup failed: {}", e);
                self.set_state(InstanceState::Stopped)?;
                Err(convert_postgresql_error(e))
            }
        }
    }

    /// 异步启动方法
    #[napi]
    pub async unsafe fn start(&mut self) -> napi::Result<()> {
        let current_state = self.get_state()?;
        match current_state {
            InstanceState::Running => {
                pg_log!(warn, "Attempted to start already running PostgreSQL instance");
                return Err(start_error("PostgreSQL instance is already running"));
            }
            InstanceState::Starting => {
                pg_log!(warn, "Attempted to start already starting PostgreSQL instance");
                return Err(start_error("PostgreSQL instance is already starting"));
            }
            _ => {}
        }

        pg_log!(info, "Starting PostgreSQL instance on port {}", self.settings.port);
        self.set_state(InstanceState::Starting)?;

        if self.async_instance.is_none() {
            self.setup().await?;
        }

        if let Some(ref mut instance) = self.async_instance {
            match instance.start().await {
                Ok(_) => {
                    pg_log!(info, "PostgreSQL instance started successfully on port {}", self.settings.port);
                    self.set_state(InstanceState::Running)?;
                    Ok(())
                }
                Err(e) => {
                    pg_log!(error, "Failed to start PostgreSQL instance: {}", e);
                    self.set_state(InstanceState::Stopped)?;
                    Err(convert_postgresql_error(e))
                }
            }
        } else {
            pg_log!(error, "PostgreSQL instance not initialized");
            self.set_state(InstanceState::Stopped)?;
            Err(start_error("PostgreSQL instance not initialized"))
        }
    }

    /// 异步停止方法
    #[napi]
    pub async unsafe fn stop(&mut self) -> napi::Result<()> {
        let current_state = self.get_state()?;
        match current_state {
            InstanceState::Stopped => {
                pg_log!(warn, "Attempted to stop already stopped PostgreSQL instance");
                return Err(stop_error("PostgreSQL instance is already stopped"));
            }
            InstanceState::Stopping => {
                pg_log!(warn, "Attempted to stop already stopping PostgreSQL instance");
                return Err(stop_error("PostgreSQL instance is already stopping"));
            }
            _ => {}
        }

        pg_log!(info, "Stopping PostgreSQL instance");
        self.set_state(InstanceState::Stopping)?;

        if let Some(ref mut instance) = self.async_instance {
            match instance.stop().await {
                Ok(_) => {
                    pg_log!(info, "PostgreSQL instance stopped successfully");
                    self.set_state(InstanceState::Stopped)?;
                    Ok(())
                }
                Err(e) => {
                    pg_log!(error, "Failed to stop PostgreSQL instance: {}", e);
                    self.set_state(InstanceState::Running)?;
                    Err(convert_postgresql_error(e))
                }
            }
        } else {
            pg_log!(error, "PostgreSQL instance not initialized");
            self.set_state(InstanceState::Stopped)?;
            Err(stop_error("PostgreSQL instance not initialized"))
        }
    }

    /// 异步创建数据库
    #[napi]
    pub async unsafe fn create_database(&mut self, name: String) -> napi::Result<()> {
        let current_state = self.get_state()?;
        if !matches!(current_state, InstanceState::Running) {
            return Err(database_error("PostgreSQL instance is not running"));
        }

        if name.is_empty() {
            return Err(database_error("Database name cannot be empty"));
        }

        if let Some(ref mut instance) = self.async_instance {
            match instance.create_database(&name).await {
                Ok(_) => Ok(()),
                Err(e) => Err(convert_postgresql_error(e)),
            }
        } else {
            Err(database_error("PostgreSQL instance not initialized"))
        }
    }

    /// 异步删除数据库
    #[napi]
    pub async unsafe fn drop_database(&mut self, name: String) -> napi::Result<()> {
        let current_state = self.get_state()?;
        if !matches!(current_state, InstanceState::Running) {
            return Err(database_error("PostgreSQL instance is not running"));
        }

        if name.is_empty() {
            return Err(database_error("Database name cannot be empty"));
        }

        if let Some(ref mut instance) = self.async_instance {
            match instance.drop_database(&name).await {
                Ok(_) => Ok(()),
                Err(e) => Err(convert_postgresql_error(e)),
            }
        } else {
            Err(database_error("PostgreSQL instance not initialized"))
        }
    }

    /// 异步检查数据库是否存在
    #[napi]
    pub async fn database_exists(&self, name: String) -> napi::Result<bool> {
        let current_state = self.get_state()?;
        if !matches!(current_state, InstanceState::Running) {
            return Err(database_error("PostgreSQL instance is not running"));
        }

        if name.is_empty() {
            return Err(database_error("Database name cannot be empty"));
        }

        if let Some(ref instance) = self.async_instance {
            match instance.database_exists(&name).await {
                Ok(exists) => Ok(exists),
                Err(e) => Err(convert_postgresql_error(e)),
            }
        } else {
            Err(database_error("PostgreSQL instance not initialized"))
        }
    }

    // 同步方法
    
    /// 同步设置方法
    #[napi]
    pub fn setup_sync(&mut self) -> napi::Result<()> {
        self.set_state(InstanceState::Starting)?;
        
        let mut instance = postgresql_embedded::blocking::PostgreSQL::new(self.settings.clone());
        match instance.setup() {
            Ok(_) => {
                self.blocking_instance = Some(instance);
                Ok(())
            }
            Err(e) => {
                self.set_state(InstanceState::Stopped)?;
                Err(convert_postgresql_error(e))
            }
        }
    }

    /// 同步启动方法
    #[napi]
    pub fn start_sync(&mut self) -> napi::Result<()> {
        let current_state = self.get_state()?;
        match current_state {
            InstanceState::Running => {
                return Err(start_error("PostgreSQL instance is already running"));
            }
            InstanceState::Starting => {
                return Err(start_error("PostgreSQL instance is already starting"));
            }
            _ => {}
        }

        self.set_state(InstanceState::Starting)?;

        if self.blocking_instance.is_none() {
            self.setup_sync()?;
        }

        if let Some(ref mut instance) = self.blocking_instance {
            match instance.start() {
                Ok(_) => {
                    self.set_state(InstanceState::Running)?;
                    Ok(())
                }
                Err(e) => {
                    self.set_state(InstanceState::Stopped)?;
                    Err(convert_postgresql_error(e))
                }
            }
        } else {
            self.set_state(InstanceState::Stopped)?;
            Err(start_error("PostgreSQL instance not initialized"))
        }
    }

    /// 同步停止方法
    #[napi]
    pub fn stop_sync(&mut self) -> napi::Result<()> {
        let current_state = self.get_state()?;
        match current_state {
            InstanceState::Stopped => {
                return Err(stop_error("PostgreSQL instance is already stopped"));
            }
            InstanceState::Stopping => {
                return Err(stop_error("PostgreSQL instance is already stopping"));
            }
            _ => {}
        }

        self.set_state(InstanceState::Stopping)?;

        if let Some(ref mut instance) = self.blocking_instance {
            match instance.stop() {
                Ok(_) => {
                    self.set_state(InstanceState::Stopped)?;
                    Ok(())
                }
                Err(e) => {
                    self.set_state(InstanceState::Running)?;
                    Err(convert_postgresql_error(e))
                }
            }
        } else {
            self.set_state(InstanceState::Stopped)?;
            Err(stop_error("PostgreSQL instance not initialized"))
        }
    }

    /// 同步创建数据库
    #[napi]
    pub fn create_database_sync(&mut self, name: String) -> napi::Result<()> {
        let current_state = self.get_state()?;
        if !matches!(current_state, InstanceState::Running) {
            return Err(database_error("PostgreSQL instance is not running"));
        }

        if name.is_empty() {
            return Err(database_error("Database name cannot be empty"));
        }

        if let Some(ref mut instance) = self.blocking_instance {
            match instance.create_database(&name) {
                Ok(_) => Ok(()),
                Err(e) => Err(convert_postgresql_error(e)),
            }
        } else {
            Err(database_error("PostgreSQL instance not initialized"))
        }
    }

    /// 同步删除数据库
    #[napi]
    pub fn drop_database_sync(&mut self, name: String) -> napi::Result<()> {
        let current_state = self.get_state()?;
        if !matches!(current_state, InstanceState::Running) {
            return Err(database_error("PostgreSQL instance is not running"));
        }

        if name.is_empty() {
            return Err(database_error("Database name cannot be empty"));
        }

        if let Some(ref mut instance) = self.blocking_instance {
            match instance.drop_database(&name) {
                Ok(_) => Ok(()),
                Err(e) => Err(convert_postgresql_error(e)),
            }
        } else {
            Err(database_error("PostgreSQL instance not initialized"))
        }
    }

    /// 同步检查数据库是否存在
    #[napi]
    pub fn database_exists_sync(&self, name: String) -> napi::Result<bool> {
        let current_state = self.get_state()?;
        if !matches!(current_state, InstanceState::Running) {
            return Err(database_error("PostgreSQL instance is not running"));
        }

        if name.is_empty() {
            return Err(database_error("Database name cannot be empty"));
        }

        if let Some(ref instance) = self.blocking_instance {
            match instance.database_exists(&name) {
                Ok(exists) => Ok(exists),
                Err(e) => Err(convert_postgresql_error(e)),
            }
        } else {
            Err(database_error("PostgreSQL instance not initialized"))
        }
    }

    /// 带超时的异步启动方法
    #[napi]
    pub async unsafe fn start_with_timeout(&mut self, timeout_seconds: u32) -> napi::Result<()> {
        let timeout_duration = Duration::from_secs(timeout_seconds as u64);
        
        pg_log!(info, "Starting PostgreSQL instance with timeout of {} seconds", timeout_seconds);
        
        // 使用 tokio::time::timeout 来包装启动操作
        match tokio::time::timeout(timeout_duration, self.start()).await {
            Ok(result) => result,
            Err(_) => {
                pg_log!(error, "PostgreSQL start operation timed out after {} seconds", timeout_seconds);
                self.set_state(InstanceState::Stopped)?;
                Err(timeout_error(&format!("Start operation timed out after {} seconds", timeout_seconds)))
            }
        }
    }

    /// 带超时的异步停止方法
    #[napi]
    pub async unsafe fn stop_with_timeout(&mut self, timeout_seconds: u32) -> napi::Result<()> {
        let timeout_duration = Duration::from_secs(timeout_seconds as u64);
        
        pg_log!(info, "Stopping PostgreSQL instance with timeout of {} seconds", timeout_seconds);
        
        // 使用 tokio::time::timeout 来包装停止操作
        match tokio::time::timeout(timeout_duration, self.stop()).await {
            Ok(result) => result,
            Err(_) => {
                pg_log!(error, "PostgreSQL stop operation timed out after {} seconds", timeout_seconds);
                // 在超时情况下，我们不确定实际状态，保持当前状态
                Err(timeout_error(&format!("Stop operation timed out after {} seconds", timeout_seconds)))
            }
        }
    }

    /// 清理资源的方法
    #[napi]
    pub fn cleanup(&mut self) -> napi::Result<()> {
        pg_log!(info, "Manually cleaning up PostgreSQL instance resources");
        
        // 清理异步实例
        if let Some(_) = self.async_instance.take() {
            pg_log!(debug, "Cleaned up async PostgreSQL instance");
        }
        
        // 清理同步实例
        if let Some(mut instance) = self.blocking_instance.take() {
            pg_log!(debug, "Stopping and cleaning up blocking PostgreSQL instance");
            if let Err(e) = instance.stop() {
                pg_log!(warn, "Failed to stop PostgreSQL instance during cleanup: {}", e);
            }
        }
        
        // 更新状态
        self.set_state(InstanceState::Stopped)?;
        
        pg_log!(info, "Manual cleanup completed");
        Ok(())
    }
}