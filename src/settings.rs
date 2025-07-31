use crate::error::configuration_error;
use napi_derive::napi;
use postgresql_embedded::Settings;
use std::path::PathBuf;

/**
 * PostgreSQL configuration settings
 *
 * This object defines all the configuration options for a PostgreSQL embedded instance.
 * All fields are optional and will use sensible defaults if not provided.
 *
 * @example
 * ```typescript
 * const settings: PostgresSettings = {
 *   port: 5432,
 *   username: 'postgres',
 *   password: 'mypassword',
 *   persistent: false
 * };
 * ```
 */
#[napi(object)]
pub struct PostgresSettings {
  /** PostgreSQL version (e.g., "15.0", ">=14.0") */
  pub version: Option<String>,
  /** Host address for database connection (default: "localhost") */
  pub host: Option<String>,
  /** Port number (0-65535, default: 5432, 0 for random) */
  pub port: Option<u32>,
  /** Username for database connection (default: "postgres") */
  pub username: Option<String>,
  /** Password for database connection (default: "postgres") */
  pub password: Option<String>,
  /** Default database name (default: "postgres") */
  pub database_name: Option<String>,
  /** Custom data directory path */
  pub data_dir: Option<String>,
  /** Custom installation directory path */
  pub installation_dir: Option<String>,
  /** Timeout in seconds for database operations (default: 30) */
  pub timeout: Option<u32>,
  /** Setup timeout in seconds for PostgreSQL initialization (default: 300 on Windows, 30 on other platforms) */
  pub setup_timeout: Option<u32>,
  /** Whether to persist data between runs (default: false) */
  pub persistent: Option<bool>,
}

impl Default for PostgresSettings {
  fn default() -> Self {
    Self {
      version: None,
      host: Some("localhost".to_string()),
      port: Some(5432),
      username: Some("postgres".to_string()),
      password: Some("postgres".to_string()),
      database_name: Some("postgres".to_string()),
      data_dir: None,
      installation_dir: None,
      timeout: Some(30),
      setup_timeout: None,
      persistent: Some(false),
    }
  }
}

impl PostgresSettings {
  /// Validate configuration parameters
  pub fn validate(&self) -> napi::Result<()> {
    // Validate port number
    if let Some(port) = self.port {
      if port > 65535 {
        return Err(configuration_error("Port must be between 0 and 65535"));
      }
    }

    // Validate timeout
    if let Some(timeout) = self.timeout {
      if timeout == 0 {
        return Err(configuration_error("Timeout must be greater than 0"));
      }
    }

    // Validate username
    if let Some(ref username) = self.username {
      if username.is_empty() {
        return Err(configuration_error("Username cannot be empty"));
      }
    }

    // Validate database name
    if let Some(ref database_name) = self.database_name {
      if database_name.is_empty() {
        return Err(configuration_error("Database name cannot be empty"));
      }
    }

    Ok(())
  }

  /// Convert to postgresql_embedded::Settings
  pub fn to_embedded_settings(&self) -> napi::Result<Settings> {
    self.validate()?;

    let mut settings = Settings::default();

    // 设置setup超时时间
    if let Some(setup_timeout) = self.setup_timeout {
      settings.timeout = Some(std::time::Duration::from_secs(setup_timeout as u64));
    } else {
      // Windows需要更长的超时时间，因为PostgreSQL初始化较慢
      #[cfg(target_os = "windows")]
      {
        settings.timeout = Some(std::time::Duration::from_secs(300)); // 5分钟
      }
      #[cfg(not(target_os = "windows"))]
      {
        settings.timeout = Some(std::time::Duration::from_secs(30)); // 30秒
      }
    }

    // Set version
    if let Some(ref version) = self.version {
      let version_req = postgresql_embedded::VersionReq::parse(version)
        .map_err(|e| configuration_error(&format!("Invalid version format: {e}")))?;
      settings.version = version_req;
    }

    // Set host
    if let Some(host) = self.host.clone() {
      settings.host = host;
    }

    // Set port
    if let Some(port) = self.port {
      settings.port = port as u16;
    }

    // Set username
    if let Some(ref username) = self.username {
      settings.username = username.clone();
    }

    // Set password
    if let Some(ref password) = self.password {
      settings.password = password.clone();
    }

    // Note: postgresql_embedded doesn't support setting database name directly, uses default "postgres"

    // Set data directory
    if let Some(ref data_dir) = self.data_dir {
      settings.data_dir = PathBuf::from(data_dir);
    }

    // Set installation directory
    if let Some(ref installation_dir) = self.installation_dir {
      settings.installation_dir = PathBuf::from(installation_dir);
    }

    // Note: postgresql_embedded doesn't support setting timeout directly

    // Set temporary flag (opposite of persistent)
    if let Some(persistent) = self.persistent {
      settings.temporary = !persistent;
    }

    Ok(settings)
  }
}
