use napi_derive::napi;

/// PostgreSQL 错误类型枚举
#[napi]
pub enum PostgresError {
    /// 设置错误
    SetupError,
    /// 启动错误
    StartError,
    /// 停止错误
    StopError,
    /// 数据库操作错误
    DatabaseError,
    /// 配置错误
    ConfigurationError,
    /// 连接错误
    ConnectionError,
    /// 超时错误
    TimeoutError,
}

/// PostgreSQL 错误信息结构体
#[napi(object)]
pub struct PostgresErrorInfo {
    /// 错误类型
    pub error_type: PostgresError,
    /// 错误消息
    pub message: String,
    /// 错误详情
    pub details: Option<String>,
}

impl PostgresErrorInfo {
    /// 创建新的错误信息
    pub fn new(error_type: PostgresError, message: String, details: Option<String>) -> Self {
        Self {
            error_type,
            message,
            details,
        }
    }
}

/// 将 postgresql_embedded::Error 转换为 napi::Error
pub fn convert_postgresql_error(err: postgresql_embedded::Error) -> napi::Error {
    let message = format!("PostgreSQL error: {}", err);
    napi::Error::new(napi::Status::GenericFailure, message)
}

/// 创建设置错误
pub fn setup_error(message: &str) -> napi::Error {
    napi::Error::new(napi::Status::GenericFailure, format!("Setup failed: {}", message))
}

/// 创建启动错误
pub fn start_error(message: &str) -> napi::Error {
    napi::Error::new(napi::Status::GenericFailure, format!("Start failed: {}", message))
}

/// 创建停止错误
pub fn stop_error(message: &str) -> napi::Error {
    napi::Error::new(napi::Status::GenericFailure, format!("Stop failed: {}", message))
}

/// 创建数据库操作错误
pub fn database_error(message: &str) -> napi::Error {
    napi::Error::new(napi::Status::GenericFailure, format!("Database operation failed: {}", message))
}

/// 创建配置错误
pub fn configuration_error(message: &str) -> napi::Error {
    napi::Error::new(napi::Status::GenericFailure, format!("Configuration error: {}", message))
}

/// 创建连接错误
pub fn connection_error(message: &str) -> napi::Error {
    napi::Error::new(napi::Status::GenericFailure, format!("Connection error: {}", message))
}

/// 创建超时错误
pub fn timeout_error(message: &str) -> napi::Error {
    napi::Error::new(napi::Status::GenericFailure, format!("Operation timeout: {}", message))
}