use napi_derive::napi;

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
pub fn convert_postgresql_error(err: postgresql_embedded::Error) -> napi::Error {
  let message = format!("PostgreSQL error: {err}");
  napi::Error::new(napi::Status::GenericFailure, message)
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
