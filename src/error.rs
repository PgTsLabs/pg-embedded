use napi::Status;
use napi_derive::napi;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, PgEmbedError>;

#[napi]
#[derive(Debug, Error)]
pub enum PgEmbedError {
  #[error("Database setup failed: {0}")]
  SetupError(String),
  #[error("Database start failed: {0}")]
  StartError(String),
  #[error("Database stop failed: {0}")]
  StopError(String),
  #[error("Database operation failed: {0}")]
  DatabaseError(String),
  #[error("Configuration error: {0}")]
  ConfigurationError(String),
  #[error("Connection error: {0}")]
  ConnectionError(String),
  #[error("Operation timeout: {0}")]
  TimeoutError(String),
  #[error("Tool execution failed: {0}")]
  ToolError(String),
  #[error("Internal error: {0}")]
  InternalError(String),
}

impl From<PgEmbedError> for napi::Error {
  fn from(e: PgEmbedError) -> Self {
    napi::Error::new(Status::GenericFailure, e.to_string())
  }
}

impl From<std::io::Error> for PgEmbedError {
  fn from(e: std::io::Error) -> Self {
    PgEmbedError::InternalError(e.to_string())
  }
}

/// PostgreSQL error type enumeration
#[napi]
pub enum PostgresError {
  /// Setup error
  SetupError,
  /// Start error
  StartError,
  /// Stop error
  StopError,
  /// Database operation error
  DatabaseError,
  /// Configuration error
  ConfigurationError,
  /// Connection error
  ConnectionError,
  /// Timeout error
  TimeoutError,
  /// Tool error
  ToolError,
}

/// PostgreSQL error information structure
#[napi(object)]
pub struct PostgresErrorInfo {
  /// Error type
  pub error_type: PostgresError,
  /// Error message
  pub message: String,
  /// Error details
  pub details: Option<String>,
}

impl PostgresErrorInfo {
  /// Create new error information
  pub fn new(error_type: PostgresError, message: String, details: Option<String>) -> Self {
    Self {
      error_type,
      message,
      details,
    }
  }
}

/// Convert postgresql_embedded::Error to napi::Error
pub fn convert_postgresql_error(err: postgresql_embedded::Error) -> PgEmbedError {
  PgEmbedError::InternalError(err.to_string())
}

/// Create setup error
pub fn setup_error(message: &str) -> napi::Error {
  napi::Error::new(
    napi::Status::GenericFailure,
    format!("Setup failed: {message}"),
  )
}

/// Create start error
pub fn start_error(message: &str) -> napi::Error {
  napi::Error::new(
    napi::Status::GenericFailure,
    format!("Start failed: {message}"),
  )
}

/// Create stop error
pub fn stop_error(message: &str) -> napi::Error {
  napi::Error::new(
    napi::Status::GenericFailure,
    format!("Stop failed: {message}"),
  )
}

/// Create database operation error
pub fn database_error(message: &str) -> napi::Error {
  napi::Error::new(
    napi::Status::GenericFailure,
    format!("Database operation failed: {message}"),
  )
}

/// Create configuration error
pub fn configuration_error(message: &str) -> napi::Error {
  napi::Error::new(
    napi::Status::GenericFailure,
    format!("Configuration error: {message}"),
  )
}

/// Create connection error
pub fn connection_error(message: &str) -> napi::Error {
  napi::Error::new(
    napi::Status::GenericFailure,
    format!("Connection error: {message}"),
  )
}

/// Create timeout error
pub fn timeout_error(message: &str) -> napi::Error {
  napi::Error::new(
    napi::Status::GenericFailure,
    format!("Operation timeout: {message}"),
  )
}

/// Create tool error
pub fn tool_error(message: &str) -> PgEmbedError {
  PgEmbedError::ToolError(message.to_string())
}

/// Convert postgresql_commands::error::Error to napi::Error
pub fn convert_command_error(err: postgresql_commands::error::Error) -> PgEmbedError {
  PgEmbedError::ToolError(err.to_string())
}
