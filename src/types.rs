use napi_derive::napi;

/// PostgreSQL instance state enumeration
#[napi]
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum InstanceState {
  /// Stopped
  Stopped,
  /// Starting
  Starting,
  /// Running
  Running,
  /// Stopping
  Stopping,
}

/// Connection information structure
#[napi]
#[derive(Clone)]
pub struct ConnectionInfo {
  /// Host address
  pub host: String,
  /// Port number
  pub port: u16,
  /// Username
  pub username: String,
  /// Password
  pub password: String,
  /// Database name
  pub database_name: String,
  /// Connection string
  pub connection_string: String,
}

#[napi]
impl ConnectionInfo {
  /// Generate a safe connection string without password (for logging)
  #[napi]
  pub fn safe_connection_string(&self) -> String {
    format!(
      "postgresql://{}:***@{}:{}/{}",
      self.username, self.host, self.port, self.database_name
    )
  }

  /// Generate JDBC format connection string
  #[napi]
  pub fn jdbc_url(&self) -> String {
    format!(
      "jdbc:postgresql://{}:{}/{}?user={}&password={}",
      self.host, self.port, self.database_name, self.username, self.password
    )
  }
}

impl ConnectionInfo {
  /// Create new connection information
  pub fn new(
    host: String,
    port: u16,
    username: String,
    password: String,
    database_name: String,
  ) -> Self {
    let connection_string =
      format!("postgresql://{username}:{password}@{host}:{port}/{database_name}");

    Self {
      host,
      port,
      username,
      password,
      database_name,
      connection_string,
    }
  }

  /// Generate connection configuration object (for some database clients)
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

/// SQL execution result structure
#[napi]
#[derive(Clone)]
pub struct SqlResult {
  /// Standard output from the SQL command
  pub stdout: String,
  /// Standard error from the SQL command
  pub stderr: String,
  /// Whether the execution was successful
  pub success: bool,
}

/// Structured SQL execution result with parsed JSON data
#[napi]
#[derive(Clone)]
pub struct StructuredSqlResult {
  /// Parsed JSON data from the SQL query result
  pub data: Option<String>,
  /// Raw standard output from the SQL command
  pub stdout: String,
  /// Standard error from the SQL command
  pub stderr: String,
  /// Whether the execution was successful
  pub success: bool,
  /// Number of rows returned (0 if not applicable)
  pub row_count: u32,
}
