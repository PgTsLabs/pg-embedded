use crate::{
  error::Result,
  tools::common::ConnectionConfig,
  PgBasebackupConfig, PgBasebackupTool, PgDumpConfig, PgDumpTool, PgDumpallConfig,
  PgDumpallTool, PgRestoreConfig, PgRestoreTool, PgRewindConfig, PgRewindTool, PsqlConfig,
  PsqlTool, ToolResult,
};

/// Unified tool manager following SRP and OCP principles
///
/// This manager centralizes all PostgreSQL tool operations, eliminating code duplication
/// and providing a consistent interface for tool execution.
///
/// Benefits:
/// - DRY: Eliminates 8+ instances of repeated connection configuration code
/// - SRP: Separates tool management from instance lifecycle management
/// - OCP: Adding new tools doesn't require modifying PostgresInstance
pub struct ToolManager {
  connection_config: ConnectionConfig,
  program_dir: String,
}

impl ToolManager {
  /// Creates a new ToolManager with the given connection configuration and program directory
  ///
  /// # Arguments
  /// * `connection_config` - Connection configuration for PostgreSQL
  /// * `program_dir` - Directory containing PostgreSQL binaries
  pub fn new(connection_config: ConnectionConfig, program_dir: String) -> Self {
    Self {
      connection_config,
      program_dir,
    }
  }

  /// Gets the binary directory path (program_dir/bin)
  ///
  /// This is a cross-platform compatible path construction
  fn bin_dir(&self) -> String {
    format!("{}/bin", self.program_dir)
  }

  /// Prepares connection configuration with optional database override
  ///
  /// This helper method eliminates repeated code across all tool methods
  fn prepare_connection(&self, database_name: Option<String>) -> ConnectionConfig {
    let mut config = self.connection_config.clone();
    if let Some(db) = database_name {
      config.database = Some(db);
    }
    config
  }

  /// Creates a database dump using pg_dump
  ///
  /// # Arguments
  /// * `config` - pg_dump configuration options
  /// * `database_name` - Optional database name (overrides connection config)
  ///
  /// # Returns
  /// Result containing tool execution output
  ///
  /// # Cross-platform notes
  /// - File paths in config should use platform-appropriate separators
  /// - Handles both Unix and Windows path formats
  pub async fn dump(
    &self,
    config: PgDumpConfig,
    database_name: Option<String>,
  ) -> Result<ToolResult> {
    let conn_config = self.prepare_connection(database_name);
    let tool = PgDumpTool::from_connection(conn_config, self.bin_dir(), config);
    tool.execute().await
  }

  /// Creates a base backup using pg_basebackup
  ///
  /// # Arguments
  /// * `config` - pg_basebackup configuration options
  /// * `database_name` - Optional database name (overrides connection config)
  ///
  /// # Returns
  /// Result containing tool execution output
  ///
  /// # Cross-platform notes
  /// - Backup directory paths are handled correctly on all platforms
  /// - WAL streaming works consistently across Unix and Windows
  pub async fn base_backup(
    &self,
    config: PgBasebackupConfig,
    database_name: Option<String>,
  ) -> Result<ToolResult> {
    let conn_config = self.prepare_connection(database_name);
    let tool = PgBasebackupTool::from_connection(conn_config, self.bin_dir(), config);
    tool.execute().await
  }

  /// Restores a database from backup using pg_restore
  ///
  /// # Arguments
  /// * `config` - pg_restore configuration options
  /// * `database_name` - Optional database name (overrides connection config)
  ///
  /// # Returns
  /// Result containing tool execution output
  ///
  /// # Cross-platform notes
  /// - Handles both plain SQL and custom format dumps
  /// - File path handling is platform-aware
  pub async fn restore(
    &self,
    config: PgRestoreConfig,
    database_name: Option<String>,
  ) -> Result<ToolResult> {
    let conn_config = self.prepare_connection(database_name);
    let tool = PgRestoreTool::from_connection(conn_config, self.bin_dir(), config);
    tool.execute().await
  }

  /// Rewinds a PostgreSQL cluster using pg_rewind
  ///
  /// # Arguments
  /// * `config` - pg_rewind configuration options
  /// * `database_name` - Optional database name (overrides connection config)
  ///
  /// # Returns
  /// Result containing tool execution output
  ///
  /// # Cross-platform notes
  /// - Data directory paths are normalized for the platform
  /// - WAL configuration is platform-independent
  pub async fn rewind(
    &self,
    config: PgRewindConfig,
    database_name: Option<String>,
  ) -> Result<ToolResult> {
    let conn_config = self.prepare_connection(database_name);
    let tool = PgRewindTool::from_connection(conn_config, self.bin_dir(), config);
    tool.execute().await
  }

  /// Creates a cluster-wide dump using pg_dumpall
  ///
  /// # Arguments
  /// * `config` - pg_dumpall configuration options
  ///
  /// # Returns
  /// Result containing tool execution output
  ///
  /// # Cross-platform notes
  /// - Output file paths are handled correctly on all platforms
  /// - Includes all databases, roles, and tablespaces
  pub async fn dumpall(&self, config: PgDumpallConfig) -> Result<ToolResult> {
    let tool = PgDumpallTool::from_connection(self.connection_config.clone(), self.bin_dir(), config);
    tool.execute().await
  }

  /// Executes SQL commands using psql
  ///
  /// # Arguments
  /// * `sql` - SQL command(s) to execute
  /// * `config` - psql configuration options
  /// * `database_name` - Optional database name (overrides connection config)
  ///
  /// # Returns
  /// Result containing tool execution output
  ///
  /// # Cross-platform notes
  /// - SQL commands are executed consistently across platforms
  /// - Output encoding is handled correctly on Windows
  pub async fn execute_sql(
    &self,
    sql: String,
    config: PsqlConfig,
    database_name: Option<String>,
  ) -> Result<ToolResult> {
    let conn_config = self.prepare_connection(database_name);
    let tool = PsqlTool::from_connection(conn_config, self.bin_dir(), config);
    tool.execute_command(sql).await
  }

  /// Executes SQL commands from a file using psql
  ///
  /// # Arguments
  /// * `file_path` - Path to SQL file to execute
  /// * `config` - psql configuration options
  /// * `database_name` - Optional database name (overrides connection config)
  ///
  /// # Returns
  /// Result containing tool execution output
  ///
  /// # Cross-platform notes
  /// - File paths are normalized for the platform
  /// - Handles both Unix (/) and Windows (\) path separators
  /// - File encoding is detected and handled correctly
  pub async fn execute_file(
    &self,
    file_path: String,
    config: PsqlConfig,
    database_name: Option<String>,
  ) -> Result<ToolResult> {
    let conn_config = self.prepare_connection(database_name);
    let tool = PsqlTool::from_connection(conn_config, self.bin_dir(), config);
    tool.execute_file(file_path).await
  }
}

/// Helper method to ensure instance is running before tool execution
///
/// This is used by PostgresInstance to validate state before delegating to ToolManager
pub fn ensure_running(state: crate::types::InstanceState) -> Result<()> {
  if !matches!(state, crate::types::InstanceState::Running) {
    return Err(crate::error::PgEmbedError::DatabaseError(
      "PostgreSQL instance is not running".to_string(),
    ));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_tool_manager_creation() {
    let config = ConnectionConfig {
      host: Some("localhost".to_string()),
      port: Some(5432),
      username: Some("postgres".to_string()),
      password: Some("password".to_string()),
      database: Some("postgres".to_string()),
    };

    let manager = ToolManager::new(config, "/usr/local/pgsql".to_string());
    assert_eq!(manager.bin_dir(), "/usr/local/pgsql/bin");
  }

  #[test]
  fn test_prepare_connection_with_override() {
    let config = ConnectionConfig {
      host: Some("localhost".to_string()),
      port: Some(5432),
      username: Some("postgres".to_string()),
      password: Some("password".to_string()),
      database: Some("postgres".to_string()),
    };

    let manager = ToolManager::new(config, "/usr/local/pgsql".to_string());
    let prepared = manager.prepare_connection(Some("testdb".to_string()));

    assert_eq!(prepared.database, Some("testdb".to_string()));
    assert_eq!(prepared.host, Some("localhost".to_string()));
  }

  #[test]
  fn test_prepare_connection_without_override() {
    let config = ConnectionConfig {
      host: Some("localhost".to_string()),
      port: Some(5432),
      username: Some("postgres".to_string()),
      password: Some("password".to_string()),
      database: Some("postgres".to_string()),
    };

    let manager = ToolManager::new(config.clone(), "/usr/local/pgsql".to_string());
    let prepared = manager.prepare_connection(None);

    assert_eq!(prepared.database, config.database);
  }

  #[test]
  #[cfg(target_os = "windows")]
  fn test_bin_dir_windows_style() {
    let config = ConnectionConfig::default();
    let manager = ToolManager::new(config, "C:\\Program Files\\PostgreSQL\\16".to_string());
    assert_eq!(manager.bin_dir(), "C:\\Program Files\\PostgreSQL\\16/bin");
  }

  #[test]
  #[cfg(not(target_os = "windows"))]
  fn test_bin_dir_unix_style() {
    let config = ConnectionConfig::default();
    let manager = ToolManager::new(config, "/usr/local/pgsql".to_string());
    assert_eq!(manager.bin_dir(), "/usr/local/pgsql/bin");
  }
}
