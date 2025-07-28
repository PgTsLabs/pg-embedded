use napi_derive::napi;

/// PostgreSQL 实例状态枚举
#[napi]
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum InstanceState {
    /// 已停止
    Stopped,
    /// 启动中
    Starting,
    /// 运行中
    Running,
    /// 停止中
    Stopping,
}

/// 连接信息结构体
#[napi]
#[derive(Clone)]
pub struct ConnectionInfo {
    /// 主机地址
    pub host: String,
    /// 端口号
    pub port: u16,
    /// 用户名
    pub username: String,
    /// 密码
    pub password: String,
    /// 数据库名
    pub database_name: String,
    /// 连接字符串
    pub connection_string: String,
}

#[napi]
impl ConnectionInfo {
    /// 生成不包含密码的安全连接字符串（用于日志记录）
    #[napi]
    pub fn safe_connection_string(&self) -> String {
        format!(
            "postgresql://{}:***@{}:{}/{}",
            self.username, self.host, self.port, self.database_name
        )
    }

    /// 生成 JDBC 格式的连接字符串
    #[napi]
    pub fn jdbc_url(&self) -> String {
        format!(
            "jdbc:postgresql://{}:{}/{}?user={}&password={}",
            self.host, self.port, self.database_name, self.username, self.password
        )
    }
}

impl ConnectionInfo {
    /// 创建新的连接信息
    pub fn new(
        host: String,
        port: u16,
        username: String,
        password: String,
        database_name: String,
    ) -> Self {
        let connection_string = format!(
            "postgresql://{}:{}@{}:{}/{}",
            username, password, host, port, database_name
        );
        
        Self {
            host,
            port,
            username,
            password,
            database_name,
            connection_string,
        }
    }

    /// 生成连接配置对象（用于某些数据库客户端）
    pub fn to_config_object(&self) -> std::collections::HashMap<String, String> {
        let mut config = std::collections::HashMap::new();
        config.insert("host".to_string(), self.host.clone());
        config.insert("port".to_string(), self.port.to_string());
        config.insert("user".to_string(), self.username.clone());
        config.insert("password".to_string(), self.password.clone());
        config.insert("database".to_string(), self.database_name.clone());
        config
    }
}