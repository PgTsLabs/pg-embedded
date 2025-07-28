use napi_derive::napi;
use postgresql_embedded::Settings;
use crate::error::configuration_error;
use std::path::PathBuf;

/// PostgreSQL 配置结构体
#[napi(object)]
pub struct PostgresSettings {
    /// PostgreSQL 版本
    pub version: Option<String>,
    /// 端口号
    pub port: Option<u32>,
    /// 用户名
    pub username: Option<String>,
    /// 密码
    pub password: Option<String>,
    /// 数据库名
    pub database_name: Option<String>,
    /// 数据目录
    pub data_dir: Option<String>,
    /// 安装目录
    pub installation_dir: Option<String>,
    /// 超时时间（秒）
    pub timeout: Option<u32>,
    /// 是否持久化
    pub persistent: Option<bool>,
}

impl Default for PostgresSettings {
    fn default() -> Self {
        Self {
            version: None,
            port: Some(5432),
            username: Some("postgres".to_string()),
            password: Some("postgres".to_string()),
            database_name: Some("postgres".to_string()),
            data_dir: None,
            installation_dir: None,
            timeout: Some(30),
            persistent: Some(false),
        }
    }
}

impl PostgresSettings {
    /// 验证配置参数
    pub fn validate(&self) -> napi::Result<()> {
        // 验证端口号
        if let Some(port) = self.port {
            if port == 0 || port > 65535 {
                return Err(configuration_error("Port must be between 1 and 65535"));
            }
        }

        // 验证超时时间
        if let Some(timeout) = self.timeout {
            if timeout == 0 {
                return Err(configuration_error("Timeout must be greater than 0"));
            }
        }

        // 验证用户名
        if let Some(ref username) = self.username {
            if username.is_empty() {
                return Err(configuration_error("Username cannot be empty"));
            }
        }

        // 验证数据库名
        if let Some(ref database_name) = self.database_name {
            if database_name.is_empty() {
                return Err(configuration_error("Database name cannot be empty"));
            }
        }

        Ok(())
    }

    /// 转换为 postgresql_embedded::Settings
    pub fn to_embedded_settings(&self) -> napi::Result<Settings> {
        self.validate()?;

        let mut settings = Settings::default();

        // 设置版本
        if let Some(ref version) = self.version {
            let version_req = postgresql_embedded::VersionReq::parse(version)
                .map_err(|e| configuration_error(&format!("Invalid version format: {}", e)))?;
            settings.version = version_req;
        }

        // 设置端口
        if let Some(port) = self.port {
            settings.port = port as u16;
        }

        // 设置用户名
        if let Some(ref username) = self.username {
            settings.username = username.clone();
        }

        // 设置密码
        if let Some(ref password) = self.password {
            settings.password = password.clone();
        }

        // 注意：postgresql_embedded 不支持直接设置数据库名，使用默认的 "postgres"

        // 设置数据目录
        if let Some(ref data_dir) = self.data_dir {
            settings.data_dir = PathBuf::from(data_dir);
        }

        // 设置安装目录
        if let Some(ref installation_dir) = self.installation_dir {
            settings.installation_dir = PathBuf::from(installation_dir);
        }

        // 注意：postgresql_embedded 不支持直接设置超时时间

        // 设置是否为临时数据库（与持久化相反）
        if let Some(persistent) = self.persistent {
            settings.temporary = !persistent;
        }

        Ok(settings)
    }
}