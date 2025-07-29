use crate::{
  error::{
    convert_postgresql_error, database_error, setup_error, start_error, stop_error, timeout_error,
  },
  logger::pg_log,
  settings::PostgresSettings,
  types::{ConnectionInfo, InstanceState},
};
use napi_derive::napi;
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
  /// Sync instance (lazy initialized)
  blocking_instance: Option<postgresql_embedded::blocking::PostgreSQL>,
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
}

impl Drop for PostgresInstance {
  fn drop(&mut self) {
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

    // Try to stop sync instance
    if let Some(instance) = self.blocking_instance.take() {
      pg_log!(
        debug,
        "Cleaning up blocking PostgreSQL instance for {}",
        self.instance_id
      );
      // Try synchronous stop
      if let Err(e) = instance.stop() {
        pg_log!(
          warn,
          "Failed to stop PostgreSQL instance {} during cleanup: {}",
          self.instance_id,
          e
        );
      }
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
      blocking_instance: None,
      settings: embedded_settings,
      state: Arc::new(Mutex::new(InstanceState::Stopped)),
      instance_id,
      connection_cache: Arc::new(Mutex::new(None)),
      config_hash,
      startup_time: Arc::new(Mutex::new(None)),
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
        let has_blocking = self.blocking_instance.is_some();

        Ok(has_async || has_blocking)
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
    let current_state = self.get_state()?;
    match current_state {
      InstanceState::Stopped => {
        pg_log!(
          warn,
          "Attempted to stop already stopped PostgreSQL instance"
        );
        return Err(stop_error("PostgreSQL instance is already stopped"));
      }
      InstanceState::Stopping => {
        pg_log!(
          warn,
          "Attempted to stop already stopping PostgreSQL instance"
        );
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

  // Synchronous methods

  /**
   * Sets up the PostgreSQL instance synchronously
   *
   * This method initializes the PostgreSQL instance but does not start it.
   * It's automatically called by startSync() if needed.
   *
   * @returns void
   * @throws Error if setup fails
   */
  #[napi]
  pub fn setup_sync(&mut self) -> napi::Result<()> {
    self.set_state(InstanceState::Starting)?;

    let mut instance = postgresql_embedded::blocking::PostgreSQL::new(self.settings.clone());
    match instance.setup() {
      Ok(_) => {
        self.blocking_instance = Some(instance);
        self.set_state(InstanceState::Stopped)?; // Setup完成后设置为Stopped状态，等待start
        Ok(())
      }
      Err(e) => {
        self.set_state(InstanceState::Stopped)?;
        Err(convert_postgresql_error(e))
      }
    }
  }

  /**
   * Starts the PostgreSQL instance synchronously
   *
   * This method starts the PostgreSQL server and makes it ready to accept connections.
   * It includes automatic setup if the instance hasn't been set up yet.
   *
   * @returns void
   * @throws Error if the instance is already running or if startup fails
   *
   * @example
   * ```typescript
   * instance.startSync();
   * console.log('PostgreSQL is ready!');
   * ```
   */
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

  /**
   * Stops the PostgreSQL instance synchronously
   *
   * This method gracefully shuts down the PostgreSQL server.
   *
   * @returns void
   * @throws Error if the instance is already stopped or if stopping fails
   *
   * @example
   * ```typescript
   * instance.stopSync();
   * console.log('PostgreSQL stopped');
   * ```
   */
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

  /**
   * Creates a new database synchronously
   *
   * @param name - The name of the database to create
   * @returns void
   * @throws Error if the instance is not running or if database creation fails
   *
   * @example
   * ```typescript
   * instance.createDatabaseSync('myapp');
   * ```
   */
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

  /**
   * Drops (deletes) a database synchronously
   *
   * @param name - The name of the database to drop
   * @returns void
   * @throws Error if the instance is not running or if database deletion fails
   *
   * @example
   * ```typescript
   * instance.dropDatabaseSync('myapp');
   * ```
   */
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

  /**
   * Checks if a database exists synchronously
   *
   * @param name - The name of the database to check
   * @returns true if the database exists, false otherwise
   * @throws Error if the instance is not running or if the check fails
   *
   * @example
   * ```typescript
   * const exists = instance.databaseExistsSync('myapp');
   * if (exists) {
   *   console.log('Database exists');
   * }
   * ```
   */
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
   * instance.cleanup();
   * console.log('Resources cleaned up');
   * ```
   */
  #[napi]
  pub fn cleanup(&mut self) -> napi::Result<()> {
    pg_log!(info, "Manually cleaning up PostgreSQL instance resources");

    // Clean up async instance
    if self.async_instance.take().is_some() {
      pg_log!(debug, "Cleaned up async PostgreSQL instance");
    }

    // Clean up sync instance
    if let Some(instance) = self.blocking_instance.take() {
      pg_log!(
        debug,
        "Stopping and cleaning up blocking PostgreSQL instance"
      );
      if let Err(e) = instance.stop() {
        pg_log!(
          warn,
          "Failed to stop PostgreSQL instance during cleanup: {}",
          e
        );
      }
    }

    // Update state
    self.set_state(InstanceState::Stopped)?;

    pg_log!(info, "Manual cleanup completed");
    Ok(())
  }
}
