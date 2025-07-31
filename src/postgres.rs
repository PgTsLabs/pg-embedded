use crate::{
  error::{
    convert_postgresql_error, database_error, setup_error, start_error, stop_error, timeout_error,
  },
  logger::pg_log,
  settings::PostgresSettings,
  types::{ConnectionInfo, InstanceState, SqlResult, StructuredSqlResult},
};
use napi_derive::napi;
use postgresql_commands::{psql::PsqlBuilder, CommandBuilder, CommandExecutor};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Connection information cache
#[derive(Clone)]
struct ConnectionInfoCache {
  info: ConnectionInfo,
  created_at: Instant,
}

/**
 * PostgreSQL embedded instance manager
 *
 * This class provides a high-level interface for managing embedded PostgreSQL instances.
 * It supports both synchronous and asynchronous operations, automatic resource management,
 * and connection caching for optimal performance.
 *
 * @example
 * ```typescript
 * import { PostgresInstance } from 'pg-embedded';
 *
 * const instance = new PostgresInstance({
 *   port: 5432,
 *   username: 'postgres',
 *   password: 'password'
 * });
 *
 * await instance.start();
 * await instance.createDatabase('mydb');
 * await instance.stop();
 * ```
 */
#[napi]
pub struct PostgresInstance {
  /// Async instance (lazy initialized)
  async_instance: Option<postgresql_embedded::PostgreSQL>,
  /// Configuration settings
  settings: postgresql_embedded::Settings,
  /// Instance state
  state: Arc<Mutex<InstanceState>>,
  /// Instance ID for tracking and debugging
  instance_id: String,
  /// Connection information cache
  connection_cache: Arc<Mutex<Option<ConnectionInfoCache>>>,
  /// Configuration hash for caching key
  config_hash: String,
  /// Startup time recording
  startup_time: Arc<Mutex<Option<Duration>>>,
  /// Flag to track if cleanup has been called explicitly
  cleaned_up: bool,
}

impl Drop for PostgresInstance {
  fn drop(&mut self) {
    // If cleanup was already called, do nothing.
    if self.cleaned_up {
      return;
    }

    pg_log!(
      info,
      "Dropping PostgresInstance {} - cleaning up resources",
      self.instance_id
    );

    // Try to stop async instance
    if let Some(_instance) = self.async_instance.take() {
      pg_log!(
        debug,
        "Cleaning up async PostgreSQL instance for {}",
        self.instance_id
      );
      // Note: We can't use async in Drop, so we just log here
      // Actual cleanup will be handled by postgresql_embedded library's Drop implementation
    }

    // Update state to stopped
    if let Ok(mut state) = self.state.lock() {
      *state = InstanceState::Stopped;
    }

    pg_log!(
      info,
      "PostgresInstance {} cleanup completed",
      self.instance_id
    );
  }
}

#[napi]
impl PostgresInstance {
  /**
   * Creates a new PostgreSQL instance with the specified settings
   *
   * @param settings - Configuration settings for the PostgreSQL instance
   * @returns A new PostgresInstance
   *
   * @example
   * ```typescript
   * const instance = new PostgresInstance({
   *   port: 5432,
   *   username: 'postgres',
   *   password: 'password',
   *   persistent: false
   * });
   * ```
   */
  #[napi(constructor)]
  pub fn new(settings: Option<PostgresSettings>) -> napi::Result<Self> {
    let postgres_settings = settings.unwrap_or_default();
    let embedded_settings = postgres_settings.to_embedded_settings()?;
    let ts = uuid::Timestamp::now(uuid::NoContext);
    let instance_id = uuid::Uuid::new_v7(ts).to_string();

    // Generate configuration hash for caching
    let config_hash = Self::generate_config_hash(&embedded_settings);

    pg_log!(
      info,
      "Creating new PostgresInstance with ID: {} (config hash: {})",
      instance_id,
      config_hash
    );

    Ok(Self {
      async_instance: None,
      settings: embedded_settings,
      state: Arc::new(Mutex::new(InstanceState::Stopped)),
      instance_id,
      connection_cache: Arc::new(Mutex::new(None)),
      config_hash,
      startup_time: Arc::new(Mutex::new(None)),
      cleaned_up: false,
    })
  }

  /// Generate configuration hash for caching
  fn generate_config_hash(settings: &postgresql_embedded::Settings) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    settings.port.hash(&mut hasher);
    settings.username.hash(&mut hasher);
    settings.password.hash(&mut hasher);
    settings.host.hash(&mut hasher);
    format!("{:x}", hasher.finish())
  }

  /**
   * Gets the unique instance ID
   *
   * @returns The unique identifier for this PostgreSQL instance
   */
  #[napi(getter)]
  pub fn get_instance_id(&self) -> String {
    self.instance_id.clone()
  }

  /**
   * Gets the current state of the PostgreSQL instance
   *
   * @returns The current instance state (Stopped, Starting, Running, or Stopping)
   */
  #[napi(getter)]
  pub fn get_state(&self) -> napi::Result<InstanceState> {
    let state = self
      .state
      .lock()
      .map_err(|_| setup_error("Failed to acquire state lock"))?;
    Ok(match *state {
      InstanceState::Stopped => InstanceState::Stopped,
      InstanceState::Starting => InstanceState::Starting,
      InstanceState::Running => InstanceState::Running,
      InstanceState::Stopping => InstanceState::Stopping,
    })
  }

  /**
   * Gets the connection information for the PostgreSQL instance
   *
   * This method returns cached connection information when available for better performance.
   * The cache is automatically invalidated after 5 minutes.
   *
   * @returns Connection information including host, port, username, and connection string
   * @throws Error if the instance is not running
   */
  #[napi(getter)]
  pub fn get_connection_info(&self) -> napi::Result<ConnectionInfo> {
    let state = self
      .state
      .lock()
      .map_err(|_| setup_error("Failed to acquire state lock"))?;

    match *state {
      InstanceState::Running => {
        // Check cache
        if let Ok(mut cache) = self.connection_cache.lock() {
          if let Some(cached) = cache.as_ref() {
            // Cache valid for 5 minutes
            if cached.created_at.elapsed() < Duration::from_secs(300) {
              pg_log!(
                debug,
                "Using cached connection info for instance {}",
                self.instance_id
              );
              return Ok(cached.info.clone());
            }
          }

          // Create new connection info
          let host = self.settings.host.clone();
          let port = self.settings.port;
          let username = self.settings.username.clone();
          let password = self.settings.password.clone();
          let database_name = "postgres".to_string();

          let connection_info = ConnectionInfo::new(host, port, username, password, database_name);

          // Update cache
          *cache = Some(ConnectionInfoCache {
            info: connection_info.clone(),
            created_at: Instant::now(),
          });

          pg_log!(
            debug,
            "Created and cached new connection info for instance {}",
            self.instance_id
          );
          Ok(connection_info)
        } else {
          // Cache lock failed, create connection info directly
          let host = self.settings.host.clone();
          let port = self.settings.port;
          let username = self.settings.username.clone();
          let password = self.settings.password.clone();
          let database_name = "postgres".to_string();

          Ok(ConnectionInfo::new(
            host,
            port,
            username,
            password,
            database_name,
          ))
        }
      }
      _ => Err(setup_error("PostgreSQL instance is not running")),
    }
  }

  /// Set instance state
  fn set_state(&self, new_state: InstanceState) -> napi::Result<()> {
    let mut state = self
      .state
      .lock()
      .map_err(|_| setup_error("Failed to acquire state lock"))?;

    // Log state transition
    pg_log!(debug, "State transition: {:?} -> {:?}", *state, new_state);
    *state = new_state;
    Ok(())
  }

  /**
   * Checks if the PostgreSQL instance is healthy and running
   *
   * @returns true if the instance is running and healthy, false otherwise
   */
  #[napi]
  pub fn is_healthy(&self) -> napi::Result<bool> {
    let state = self.get_state()?;

    match state {
      InstanceState::Running => {
        // Check if instance is actually running
        let has_async = self.async_instance.is_some();

        Ok(has_async)
      }
      _ => Ok(false),
    }
  }

  /**
   * # Safety
   * Sets up the PostgreSQL instance asynchronously
   *
   * This method initializes the PostgreSQL instance but does not start it.
   * It's automatically called by start() if needed.
   *
   * @returns Promise that resolves when setup is complete
   * @throws Error if setup fails
   */
  #[napi]
  pub async unsafe fn setup(&mut self) -> napi::Result<()> {
    pg_log!(
      info,
      "Starting PostgreSQL setup on port {}",
      self.settings.port
    );
    self.set_state(InstanceState::Starting)?;

    let mut instance = postgresql_embedded::PostgreSQL::new(self.settings.clone());
    match instance.setup().await {
      Ok(_) => {
        pg_log!(info, "PostgreSQL setup completed successfully");
        self.async_instance = Some(instance);
        self.set_state(InstanceState::Stopped)?; // Setup完成后设置为Stopped状态，等待start
        Ok(())
      }
      Err(e) => {
        pg_log!(error, "PostgreSQL setup failed: {}", e);
        self.set_state(InstanceState::Stopped)?;
        Err(convert_postgresql_error(e))
      }
    }
  }

  /**
   * # Safety
   * Starts the PostgreSQL instance asynchronously
   *
   * This method starts the PostgreSQL server and makes it ready to accept connections.
   * It includes automatic setup if the instance hasn't been set up yet.
   *
   * @returns Promise that resolves when the instance is started and ready
   * @throws Error if the instance is already running or if startup fails
   *
   * @example
   * ```typescript
   * await instance.start();
   * console.log('PostgreSQL is ready!');
   * ```
   */
  #[napi]
  pub async unsafe fn start(&mut self) -> napi::Result<()> {
    let start_time = Instant::now();

    let current_state = self.get_state()?;
    match current_state {
      InstanceState::Running => {
        pg_log!(
          warn,
          "Attempted to start already running PostgreSQL instance"
        );
        return Err(start_error("PostgreSQL instance is already running"));
      }
      InstanceState::Starting => {
        pg_log!(
          warn,
          "Attempted to start already starting PostgreSQL instance"
        );
        return Err(start_error("PostgreSQL instance is already starting"));
      }
      _ => {}
    }

    pg_log!(
      info,
      "Starting PostgreSQL instance on port {}",
      self.settings.port
    );
    self.set_state(InstanceState::Starting)?;

    // Lazy initialization: create instance only when needed
    if self.async_instance.is_none() {
      self.setup().await?;
    }

    if let Some(ref mut instance) = self.async_instance {
      match instance.start().await {
        Ok(_) => {
          let startup_duration = start_time.elapsed();

          // Record startup time
          if let Ok(mut startup_time) = self.startup_time.lock() {
            *startup_time = Some(startup_duration);
          }

          let db_settings = instance.settings();
          self.settings.port = db_settings.port;
          pg_log!(
            info,
            "PostgreSQL instance started successfully on port {} in {:?}",
            self.settings.port,
            startup_duration
          );
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

  /**
   * # Safety
   * Stops the PostgreSQL instance asynchronously
   *
   * This method gracefully shuts down the PostgreSQL server.
   *
   * @returns Promise that resolves when the instance is stopped
   * @throws Error if the instance is already stopped or if stopping fails
   *
   * @example
   * ```typescript
   * await instance.stop();
   * console.log('PostgreSQL stopped');
   * ```
   */
  #[napi]
  pub async unsafe fn stop(&mut self) -> napi::Result<()> {
    self.internal_stop(false).await
  }

  /// Internal stop implementation with cleanup flag
  async unsafe fn internal_stop(&mut self, is_cleanup: bool) -> napi::Result<()> {
    let current_state = self.get_state()?;
    match current_state {
      InstanceState::Stopped => {
        if !is_cleanup {
          pg_log!(
            warn,
            "Attempted to stop already stopped PostgreSQL instance"
          );
          return Err(stop_error("PostgreSQL instance is already stopped"));
        } else {
          // During cleanup, already stopped is OK
          return Ok(());
        }
      }
      InstanceState::Stopping => {
        if !is_cleanup {
          pg_log!(
            warn,
            "Attempted to stop already stopping PostgreSQL instance"
          );
          return Err(stop_error("PostgreSQL instance is already stopping"));
        } else {
          // During cleanup, wait for stopping to complete
          pg_log!(debug, "Instance is stopping, waiting during cleanup");
          return Ok(());
        }
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
          if !is_cleanup {
            self.set_state(InstanceState::Running)?;
            Err(convert_postgresql_error(e))
          } else {
            // During cleanup, force state to stopped even if stop failed
            self.set_state(InstanceState::Stopped)?;
            pg_log!(warn, "Forced state to stopped during cleanup despite error");
            Ok(())
          }
        }
      }
    } else {
      pg_log!(
        debug,
        "PostgreSQL instance not initialized, setting to stopped"
      );
      self.set_state(InstanceState::Stopped)?;
      if !is_cleanup {
        Err(stop_error("PostgreSQL instance not initialized"))
      } else {
        Ok(())
      }
    }
  }

  /**
   * # Safety
   * Creates a new database asynchronously
   *
   * @param name - The name of the database to create
   * @returns Promise that resolves when the database is created
   * @throws Error if the instance is not running or if database creation fails
   *
   * @example
   * ```typescript
   * await instance.createDatabase('myapp');
   * ```
   */
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

  /**
   * # Safety
   * Drops (deletes) a database asynchronously
   *
   * @param name - The name of the database to drop
   * @returns Promise that resolves when the database is dropped
   * @throws Error if the instance is not running or if database deletion fails
   *
   * @example
   * ```typescript
   * await instance.dropDatabase('myapp');
   * ```
   */
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

  /**
   * Checks if a database exists asynchronously
   *
   * @param name - The name of the database to check
   * @returns Promise that resolves to true if the database exists, false otherwise
   * @throws Error if the instance is not running or if the check fails
   *
   * @example
   * ```typescript
   * const exists = await instance.databaseExists('myapp');
   * if (exists) {
   *   console.log('Database exists');
   * }
   * ```
   */
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

  /**
   * # Safety
   * Starts the PostgreSQL instance asynchronously with a timeout
   *
   * @param timeout_seconds - Maximum time to wait for startup in seconds
   * @returns Promise that resolves when the instance is started and ready
   * @throws Error if the instance is already running, if startup fails, or if timeout is exceeded
   *
   * @example
   * ```typescript
   * await instance.startWithTimeout(30); // 30 second timeout
   * ```
   */
  #[napi]
  pub async unsafe fn start_with_timeout(&mut self, timeout_seconds: u32) -> napi::Result<()> {
    let timeout_duration = Duration::from_secs(timeout_seconds as u64);

    pg_log!(
      info,
      "Starting PostgreSQL instance with timeout of {} seconds",
      timeout_seconds
    );

    // Use tokio::time::timeout to wrap the start operation
    match tokio::time::timeout(timeout_duration, self.start()).await {
      Ok(result) => result,
      Err(_) => {
        pg_log!(
          error,
          "PostgreSQL start operation timed out after {} seconds",
          timeout_seconds
        );
        self.set_state(InstanceState::Stopped)?;
        Err(timeout_error(&format!(
          "Start operation timed out after {timeout_seconds} seconds"
        )))
      }
    }
  }

  /**
   * # Safety
   * Stops the PostgreSQL instance asynchronously with a timeout
   *
   * @param timeout_seconds - Maximum time to wait for shutdown in seconds
   * @returns Promise that resolves when the instance is stopped
   * @throws Error if the instance is already stopped, if stopping fails, or if timeout is exceeded
   *
   * @example
   * ```typescript
   * await instance.stopWithTimeout(10); // 10 second timeout
   * ```
   */
  #[napi]
  pub async unsafe fn stop_with_timeout(&mut self, timeout_seconds: u32) -> napi::Result<()> {
    let timeout_duration = Duration::from_secs(timeout_seconds as u64);

    pg_log!(
      info,
      "Stopping PostgreSQL instance with timeout of {} seconds",
      timeout_seconds
    );

    // Use tokio::time::timeout to wrap the stop operation
    match tokio::time::timeout(timeout_duration, self.stop()).await {
      Ok(result) => result,
      Err(_) => {
        pg_log!(
          error,
          "PostgreSQL stop operation timed out after {} seconds",
          timeout_seconds
        );
        // In timeout case, we're not sure of actual state, keep current state
        Err(timeout_error(&format!(
          "Stop operation timed out after {timeout_seconds} seconds"
        )))
      }
    }
  }

  /**
   * Gets the startup time of the PostgreSQL instance in seconds
   *
   * This method returns the time it took for the last successful start operation.
   *
   * @returns The startup time in seconds, or null if the instance hasn't been started yet
   *
   * @example
   * ```typescript
   * await instance.start();
   * const startupTime = instance.getStartupTime();
   * console.log(`Started in ${startupTime} seconds`);
   * ```
   */
  #[napi]
  pub fn get_startup_time(&self) -> Option<f64> {
    if let Ok(startup_time) = self.startup_time.lock() {
      startup_time.map(|duration| duration.as_secs_f64())
    } else {
      None
    }
  }

  /**
   * Gets the configuration hash for this instance
   *
   * This hash is used internally for caching and can be useful for debugging.
   *
   * @returns A string hash of the instance configuration
   */
  #[napi]
  pub fn get_config_hash(&self) -> String {
    self.config_hash.clone()
  }

  /**
   * Clears the connection information cache
   *
   * This forces the next call to connectionInfo to regenerate the connection information.
   *
   * @returns void
   */
  #[napi]
  pub fn clear_connection_cache(&self) -> napi::Result<()> {
    if let Ok(mut cache) = self.connection_cache.lock() {
      *cache = None;
      pg_log!(
        debug,
        "Connection cache cleared for instance {}",
        self.instance_id
      );
    }
    Ok(())
  }

  /**
   * Checks if the connection information cache is valid
   *
   * The cache is considered valid if it exists and is less than 5 minutes old.
   *
   * @returns true if the cache is valid, false otherwise
   */
  #[napi]
  pub fn is_connection_cache_valid(&self) -> bool {
    if let Ok(cache) = self.connection_cache.lock() {
      if let Some(cached) = cache.as_ref() {
        return cached.created_at.elapsed() < Duration::from_secs(300);
      }
    }
    false
  }

  /**
   * Gets the PostgreSQL version used by this instance
   *
   * @returns PostgreSQL version string (e.g., "15.4")
   *
   * @example
   * ```typescript
   * const version = instance.getPostgreSQLVersion();
   * console.log(`Using PostgreSQL ${version}`);
   * ```
   */
  #[napi]
  pub fn get_postgre_sql_version(&self) -> String {
    crate::version::get_postgre_sql_version()
  }

  /**
   * # Safety
   * Manually cleans up all resources associated with this instance
   *
   * This method stops the PostgreSQL instance (if running) and cleans up all resources.
   * It's automatically called when the instance is dropped, but can be called manually
   * for immediate cleanup.
   *
   * @returns void
   *
   * @example
   * ```typescript
   * await instance.cleanup();
   * console.log('Resources cleaned up');
   * ```
   */
  #[napi]
  pub async unsafe fn cleanup(&mut self) -> napi::Result<()> {
    // Prevent double cleanup
    if self.cleaned_up {
      pg_log!(debug, "Cleanup already performed, skipping");
      return Ok(());
    }

    pg_log!(info, "Manually cleaning up PostgreSQL instance resources");

    // First try to stop gracefully using internal_stop
    if let Err(e) = self.internal_stop(true).await {
      pg_log!(warn, "Graceful stop failed during cleanup: {}", e);
    }

    // Then take ownership of the instance to ensure it's dropped
    if let Some(instance) = self.async_instance.take() {
      pg_log!(debug, "Taking ownership of PostgreSQL instance for cleanup");
      // The instance will be dropped here, which should handle cleanup
      drop(instance);
    }

    // Clear connection cache
    if let Ok(mut cache) = self.connection_cache.lock() {
      *cache = None;
    }

    // Clear startup time
    if let Ok(mut startup_time) = self.startup_time.lock() {
      *startup_time = None;
    }

    // Ensure final state is stopped
    self.set_state(InstanceState::Stopped)?;
    self.cleaned_up = true;

    pg_log!(info, "Manual cleanup completed");
    Ok(())
  }

  /**
   * Executes a SQL command against the PostgreSQL instance
   *
   * This method uses the psql command-line tool to execute SQL statements.
   * The instance must be running before executing SQL commands.
   *
   * @param sql - The SQL command to execute
   * @param database - Optional database name (defaults to "postgres")
   * @returns Promise that resolves to an object containing stdout and stderr
   * @throws Error if the instance is not running or if SQL execution fails
   *
   * @example
   * ```typescript
   * const result = await instance.executeSql('SELECT version();');
   * console.log('Query result:', result.stdout);
   *
   * // Execute on specific database
   * const result2 = await instance.executeSql('SELECT * FROM users;', 'myapp');
   * ```
   */
  #[napi]
  pub async fn execute_sql(
    &self,
    sql: String,
    database: Option<String>,
  ) -> napi::Result<SqlResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    if sql.trim().is_empty() {
      return Err(database_error("SQL command cannot be empty"));
    }

    let db_name = database.unwrap_or_else(|| "postgres".to_string());

    pg_log!(
      debug,
      "Executing SQL on database '{}': {}",
      db_name,
      sql.chars().take(100).collect::<String>()
    );

    let mut psql = PsqlBuilder::new()
      .command(&sql)
      .host(&self.settings.host)
      .port(self.settings.port)
      .username(&self.settings.username)
      .pg_password(&self.settings.password)
      .dbname(&db_name)
      .build();

    match psql.execute() {
      Ok((stdout, stderr)) => {
        pg_log!(debug, "SQL execution completed successfully");
        Ok(SqlResult {
          stdout,
          stderr,
          success: true,
        })
      }
      Err(e) => {
        pg_log!(error, "SQL execution failed: {}", e);
        Err(database_error(&format!("SQL execution failed: {}", e)))
      }
    }
  }

  /**
   * Executes a SQL file against the PostgreSQL instance
   *
   * This method reads and executes a SQL file using the psql command-line tool.
   * The instance must be running before executing SQL files.
   *
   * @param file_path - Path to the SQL file to execute
   * @param database - Optional database name (defaults to "postgres")
   * @returns Promise that resolves to an object containing stdout and stderr
   * @throws Error if the instance is not running, file doesn't exist, or execution fails
   *
   * @example
   * ```typescript
   * const result = await instance.executeSqlFile('./schema.sql');
   * console.log('Schema created:', result.success);
   *
   * // Execute on specific database
   * const result2 = await instance.executeSqlFile('./data.sql', 'myapp');
   * ```
   */
  #[napi]
  pub async fn execute_sql_file(
    &self,
    file_path: String,
    database: Option<String>,
  ) -> napi::Result<SqlResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    if file_path.trim().is_empty() {
      return Err(database_error("File path cannot be empty"));
    }

    let db_name = database.unwrap_or_else(|| "postgres".to_string());

    pg_log!(
      debug,
      "Executing SQL file '{}' on database '{}'",
      file_path,
      db_name
    );

    let mut psql = PsqlBuilder::new()
      .file(&file_path)
      .host(&self.settings.host)
      .port(self.settings.port)
      .username(&self.settings.username)
      .pg_password(&self.settings.password)
      .dbname(&db_name)
      .build();

    match psql.execute() {
      Ok((stdout, stderr)) => {
        pg_log!(debug, "SQL file execution completed successfully");
        Ok(SqlResult {
          stdout,
          stderr,
          success: true,
        })
      }
      Err(e) => {
        pg_log!(error, "SQL file execution failed: {}", e);
        Err(database_error(&format!("SQL file execution failed: {}", e)))
      }
    }
  }

  /**
   * Executes a SQL query and returns structured JSON results
   *
   * This method executes a SQL query and attempts to parse the results as JSON.
   * It's particularly useful for SELECT queries where you want structured data.
   *
   * @param sql - The SQL query to execute
   * @param database - Optional database name (defaults to "postgres")
   * @returns Promise that resolves to a StructuredSqlResult with parsed JSON data
   * @throws Error if the instance is not running or if SQL execution fails
   *
   * @example
   * ```typescript
   * const result = await instance.executeSqlStructured('SELECT * FROM users;');
   * if (result.success && result.data) {
   *   const users = JSON.parse(result.data);
   *   console.log('Users:', users);
   * }
   * ```
   */
  #[napi]
  pub async fn execute_sql_structured(
    &self,
    sql: String,
    database: Option<String>,
  ) -> napi::Result<StructuredSqlResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    if sql.trim().is_empty() {
      return Err(database_error("SQL command cannot be empty"));
    }

    let db_name = database.unwrap_or_else(|| "postgres".to_string());

    pg_log!(
      debug,
      "Executing structured SQL on database '{}': {}",
      db_name,
      sql.chars().take(100).collect::<String>()
    );

    // Execute the SQL query with CSV output format
    let mut psql = PsqlBuilder::new()
      .command(&sql)
      .host(&self.settings.host)
      .port(self.settings.port)
      .username(&self.settings.username)
      .pg_password(&self.settings.password)
      .dbname(&db_name)
      .csv() // CSV format output
      .no_align() // No alignment formatting
      .build();

    match psql.execute() {
      Ok((stdout, stderr)) => {
        pg_log!(debug, "Structured SQL execution completed successfully");

        // Parse CSV output and convert to JSON
        let (json_data, row_count) = self.parse_csv_to_json(&stdout)?;

        Ok(StructuredSqlResult {
          data: json_data,
          stdout: stdout.clone(),
          stderr,
          success: true,
          row_count,
        })
      }
      Err(e) => {
        pg_log!(error, "Structured SQL execution failed: {}", e);
        Err(database_error(&format!(
          "Structured SQL execution failed: {}",
          e
        )))
      }
    }
  }

  /**
   * Executes a SQL query and returns results as JSON array
   *
   * This is a convenience method that directly returns JSON-formatted results.
   * It uses PostgreSQL's built-in JSON functions for better performance.
   *
   * @param sql - The SQL query to execute (should be a SELECT statement)
   * @param database - Optional database name (defaults to "postgres")
   * @returns Promise that resolves to a StructuredSqlResult with JSON array data
   * @throws Error if the instance is not running or if SQL execution fails
   *
   * @example
   * ```typescript
   * const result = await instance.executeSqlJson('SELECT id, name FROM users LIMIT 10;');
   * if (result.success && result.data) {
   *   const users = JSON.parse(result.data);
   *   console.log('Users:', users);
   * }
   * ```
   */
  #[napi]
  pub async fn execute_sql_json(
    &self,
    sql: String,
    database: Option<String>,
  ) -> napi::Result<StructuredSqlResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    if sql.trim().is_empty() {
      return Err(database_error("SQL command cannot be empty"));
    }

    let db_name = database.unwrap_or_else(|| "postgres".to_string());

    pg_log!(
      debug,
      "Executing JSON SQL on database '{}': {}",
      db_name,
      sql.chars().take(100).collect::<String>()
    );

    // Check if this is a SELECT statement or a DML with RETURNING
    let trimmed_sql = sql.trim().to_uppercase();
    let json_sql = if trimmed_sql.starts_with("SELECT") {
      // For SELECT statements, wrap with JSON aggregation
      format!(
        "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM ({}) t;",
        sql.trim_end_matches(';')
      )
    } else if trimmed_sql.contains("RETURNING") {
      // For INSERT/UPDATE/DELETE with RETURNING, wrap the entire statement
      format!(
        "WITH result AS ({}) SELECT COALESCE(json_agg(row_to_json(result)), '[]'::json) FROM result;",
        sql.trim_end_matches(';')
      )
    } else {
      // For other statements, execute as-is but this might not return JSON
      sql.to_string()
    };

    let mut psql = PsqlBuilder::new()
      .command(&json_sql)
      .host(&self.settings.host)
      .port(self.settings.port)
      .username(&self.settings.username)
      .pg_password(&self.settings.password)
      .dbname(&db_name)
      .tuples_only() // Only output data, no headers
      .no_align() // No alignment formatting
      .build();

    match psql.execute() {
      Ok((stdout, stderr)) => {
        pg_log!(debug, "JSON SQL execution completed successfully");

        // Clean output - should be just the JSON result
        let json_result = stdout.trim().to_string();

        let row_count = match serde_json::from_str::<serde_json::Value>(&json_result) {
          Ok(serde_json::Value::Array(arr)) => arr.len() as u32,
          Ok(serde_json::Value::Null) => 0,
          _ => {
            pg_log!(debug, "Failed to parse JSON for row count: {}", json_result);
            0
          }
        };

        pg_log!(
          debug,
          "JSON result: {}, row_count: {:?}",
          json_result,
          row_count
        );

        Ok(StructuredSqlResult {
          data: Some(json_result),
          stdout: stdout.clone(),
          stderr,
          success: true,
          row_count,
        })
      }
      Err(e) => {
        pg_log!(error, "JSON SQL execution failed: {}", e);
        Err(database_error(&format!("JSON SQL execution failed: {}", e)))
      }
    }
  }

  /// Helper method to parse CSV output to JSON
  fn parse_csv_to_json(&self, csv_data: &str) -> napi::Result<(Option<String>, u32)> {
    if csv_data.trim().is_empty() {
      return Ok((Some("[]".to_string()), 0));
    }

    let lines: Vec<&str> = csv_data.trim().lines().collect();
    if lines.is_empty() {
      return Ok((Some("[]".to_string()), 0));
    }

    // Parse CSV header
    let header_line = lines[0];
    let headers: Vec<&str> = header_line.split(',').map(|h| h.trim()).collect();

    if lines.len() == 1 {
      // Only header, no data
      return Ok((Some("[]".to_string()), 0));
    }

    let mut json_objects = Vec::new();

    // Parse data rows
    for line in &lines[1..] {
      let values: Vec<&str> = line.split(',').map(|v| v.trim()).collect();

      if values.len() != headers.len() {
        continue; // Skip malformed rows
      }

      let mut obj = serde_json::Map::new();
      for (i, header) in headers.iter().enumerate() {
        let value = values.get(i).unwrap_or(&"");
        // Try to parse as number, otherwise treat as string
        let json_value = if let Ok(num) = value.parse::<i64>() {
          serde_json::Value::Number(serde_json::Number::from(num))
        } else if let Ok(num) = value.parse::<f64>() {
          serde_json::Number::from_f64(num)
            .map(serde_json::Value::Number)
            .unwrap_or_else(|| serde_json::Value::String(value.to_string()))
        } else if *value == "true" || *value == "false" {
          serde_json::Value::Bool(*value == "true")
        } else if value.is_empty() || *value == "NULL" {
          serde_json::Value::Null
        } else {
          serde_json::Value::String(value.to_string())
        };

        obj.insert(header.to_string(), json_value);
      }
      json_objects.push(serde_json::Value::Object(obj));
    }

    let json_array = serde_json::Value::Array(json_objects);
    let row_count = (lines.len() - 1) as u32; // Subtract header row

    match serde_json::to_string(&json_array) {
      Ok(json_string) => Ok((Some(json_string), row_count)),
      Err(e) => {
        pg_log!(error, "Failed to serialize JSON: {}", e);
        Err(database_error(&format!("Failed to serialize JSON: {}", e)))
      }
    }
  }
}
