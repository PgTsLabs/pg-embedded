use crate::{
  error::{
    convert_postgresql_error, database_error, setup_error, start_error, stop_error, timeout_error,
  },
  logger::pg_log,
  settings::PostgresSettings,
  tools::common::ConnectionConfig,
  types::{ConnectionInfo, InstanceState},
  PgBasebackupConfig, PgBasebackupTool, PgDumpConfig, PgDumpTool, PgDumpallConfig, PgDumpallTool,
  PgRestoreConfig, PgRestoreTool, PgRewindConfig, PgRewindTool, PsqlConfig, PsqlTool, ToolResult,
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

/// PostgreSQL embedded instance manager
///
/// This class provides a high-level interface for managing embedded PostgreSQL instances.
/// It supports both synchronous and asynchronous operations, automatic resource management,
/// and connection caching for optimal performance.
///
/// @example
/// ```typescript
/// import { PostgresInstance } from 'pg-embedded';
///
/// const instance = new PostgresInstance({
///   port: 5432,
///   username: 'postgres',
///   password: 'password'
/// });
///
/// await instance.start();
/// await instance.createDatabase('mydb');
/// await instance.stop();
/// ```
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
  /// Creates a new PostgreSQL instance with the specified settings
  ///
  /// @param settings - Configuration settings for the PostgreSQL instance
  /// @returns A new PostgresInstance
  ///
  /// @example
  /// ```typescript
  /// const instance = new PostgresInstance({
  ///   port: 5432,
  ///   username: 'postgres',
  ///   password: 'password',
  ///   persistent: false
  /// });
  /// ```
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

  /// Gets the unique instance ID
  ///
  /// @returns The unique identifier for this PostgreSQL instance
  #[napi(getter)]
  pub fn get_instance_id(&self) -> String {
    self.instance_id.clone()
  }

  /// Gets the configuration hash for this instance
  ///
  /// This hash is used internally for caching and can be useful for debugging.
  ///
  /// @returns A string hash of the instance configuration
  #[napi]
  pub fn get_config_hash(&self) -> String {
    self.config_hash.clone()
  }

  /// Gets the directory where the PostgreSQL binaries are located.
  #[napi(getter)]
  pub fn get_program_dir(&self) -> napi::Result<String> {
    if let Some(instance) = &self.async_instance {
      Ok(
        instance
          .settings()
          .installation_dir
          .to_string_lossy()
          .to_string(),
      )
    } else {
      Err(setup_error(
        "PostgreSQL instance has not been initialized yet.",
      ))
    }
  }

  /// Gets the directory where the PostgreSQL data is stored.
  #[napi(getter)]
  pub fn get_data_dir(&self) -> napi::Result<String> {
    if let Some(instance) = &self.async_instance {
      Ok(instance.settings().data_dir.to_string_lossy().to_string())
    } else {
      Err(setup_error(
        "PostgreSQL instance has not been initialized yet.",
      ))
    }
  }

  /// # Safety
  /// Promotes a standby server to a primary server.
  ///
  /// @returns Promise that resolves when the server is promoted.
  /// @throws Error if promotion fails.
  #[napi]
  pub async unsafe fn promote(&self) -> napi::Result<()> {
    if let Some(instance) = &self.async_instance {
      let pg_ctl_path = instance
        .settings()
        .installation_dir
        .join("bin")
        .join("pg_ctl");
      let data_dir = &instance.settings().data_dir;
      let mut command = tokio::process::Command::new(pg_ctl_path);
      command.arg("-D").arg(data_dir).arg("promote");

      let output = command
        .output()
        .await
        .map_err(|e| stop_error(&e.to_string()))?;

      if output.status.success() {
        Ok(())
      } else {
        Err(stop_error(String::from_utf8_lossy(&output.stderr).as_ref()))
      }
    } else {
      Err(setup_error(
        "PostgreSQL instance has not been initialized yet.",
      ))
    }
  }

  /// Gets the current state of the PostgreSQL instance
  ///
  /// @returns The current instance state (Stopped, Starting, Running, or Stopping)
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

  /// Gets the connection information for the PostgreSQL instance
  ///
  /// This method returns cached connection information when available for better performance.
  /// The cache is automatically invalidated after 5 minutes.
  ///
  /// @returns Connection information including host, port, username, and connection string
  /// @throws Error if the instance is not running
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

  /// Checks if the PostgreSQL instance is healthy and running
  ///
  /// @returns true if the instance is running and healthy, false otherwise
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

  /// # Safety
  /// Sets up the PostgreSQL instance asynchronously
  ///
  /// This method initializes the PostgreSQL instance but does not start it.
  /// It's automatically called by start() if needed.
  ///
  /// @returns Promise that resolves when setup is complete
  /// @throws Error if setup fails
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
        Err(convert_postgresql_error(e).into())
      }
    }
  }

  /// # Safety
  /// Starts the PostgreSQL instance asynchronously
  ///
  /// This method starts the PostgreSQL server and makes it ready to accept connections.
  /// It includes automatic setup if the instance hasn't been set up yet.
  ///
  /// @returns Promise that resolves when the instance is started and ready
  /// @throws Error if the instance is already running or if startup fails
  ///
  /// @example
  /// ```typescript
  /// await instance.start();
  /// console.log('PostgreSQL is ready!');
  /// ```
  #[napi]
  pub async unsafe fn start(&mut self, initialize: Option<bool>) -> napi::Result<()> {
    let start_time = Instant::now();
    let should_initialize = initialize.unwrap_or(true);

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
    if self.async_instance.is_none() && should_initialize {
      self.setup().await?;
    }

    if self.async_instance.is_none() {
      // If not initializing, we need to create the instance object without setting it up
      let instance = postgresql_embedded::PostgreSQL::new(self.settings.clone());
      self.async_instance = Some(instance);
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
          Err(convert_postgresql_error(e).into())
        }
      }
    } else {
      pg_log!(error, "PostgreSQL instance not initialized");
      self.set_state(InstanceState::Stopped)?;
      Err(start_error("PostgreSQL instance not initialized"))
    }
  }

  /// # Safety
  /// Stops the PostgreSQL instance asynchronously
  ///
  /// This method gracefully shuts down the PostgreSQL server.
  ///
  /// @returns Promise that resolves when the instance is stopped
  /// @throws Error if the instance is already stopped or if stopping fails
  ///
  /// @example
  /// ```typescript
  /// await instance.stop();
  /// console.log('PostgreSQL stopped');
  /// ```
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
            Err(convert_postgresql_error(e).into())
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

  /// # Safety
  /// Creates a new database asynchronously
  ///
  /// @param name - The name of the database to create
  /// @returns Promise that resolves when the database is created
  /// @throws Error if the instance is not running or if database creation fails
  ///
  /// @example
  /// ```typescript
  /// await instance.createDatabase('myapp');
  /// ```
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
        Err(e) => Err(convert_postgresql_error(e).into()),
      }
    } else {
      Err(database_error("PostgreSQL instance not initialized"))
    }
  }

  /// # Safety
  /// Creates a database dump using pg_dump
  ///
  /// This method executes pg_dump to create a backup of a PostgreSQL database.
  /// The instance must be running before calling this method.
  ///
  /// @param options - Configuration options for pg_dump
  /// @param database_name - Optional name of the database to dump (defaults to 'postgres')
  /// @returns Promise that resolves with the execution result when the dump is complete
  /// @throws Error if the instance is not running or if the dump fails
  ///
  /// @example
  /// ```typescript
  /// const result = await instance.createDump({
  ///   file: '/path/to/backup.sql',
  ///   format: PgDumpFormat.Plain,
  ///   create: true
  /// }, 'mydb');
  /// console.log(result.stdout);
  /// ```
  #[napi]
  pub async unsafe fn create_dump(
    &mut self,
    options: PgDumpConfig,
    database_name: Option<String>,
  ) -> napi::Result<ToolResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    let program_dir = self.get_program_dir()?;
    let mut connection_config = self.connection_config();
    if let Some(database_name) = database_name {
      connection_config.database = Some(database_name);
    }
    let tool =
      PgDumpTool::from_connection(connection_config, format!("{program_dir}/bin"), options);
    tool.execute().await.map_err(|error| error.into())
  }

  /// # Safety
  /// Creates a base backup using pg_basebackup
  ///
  /// This method executes pg_basebackup to create a binary backup of a PostgreSQL
  /// database cluster. The backup can be used for point-in-time recovery or to
  /// set up streaming replication. The instance must be running before calling this method.
  ///
  /// @param options - Configuration options for pg_basebackup
  /// @param database_name - Optional name of the database to connect to (defaults to 'postgres')
  /// @returns Promise that resolves with the execution result when the backup is complete
  /// @throws Error if the instance is not running or if the backup fails
  ///
  /// @example
  /// ```typescript
  /// const result = await instance.createBaseBackup({
  ///   pgdata: '/path/to/backup',
  ///   format: PgBasebackupFormat.Tar,
  ///   walMethod: PgBasebackupWalMethod.Stream
  /// });
  /// console.log(result.stdout);
  /// ```
  #[napi]
  pub async unsafe fn create_base_backup(
    &mut self,
    options: PgBasebackupConfig,
    database_name: Option<String>,
  ) -> napi::Result<ToolResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    let program_dir = self.get_program_dir()?;
    let mut connection_config = self.connection_config();
    if let Some(database_name) = database_name {
      connection_config.database = Some(database_name);
    }
    let tool =
      PgBasebackupTool::from_connection(connection_config, format!("{program_dir}/bin"), options);
    tool.execute().await.map_err(|error| error.into())
  }

  /// # Safety
  /// Restores a database from a backup using pg_restore
  ///
  /// This method executes pg_restore to restore a PostgreSQL database from a backup
  /// file created by pg_dump. The instance must be running before calling this method.
  ///
  /// @param options - Configuration options for pg_restore
  /// @param database_name - Optional name of the database to restore to (defaults to 'postgres')
  /// @returns Promise that resolves with the execution result when the restore is complete
  /// @throws Error if the instance is not running or if the restore fails
  ///
  /// @example
  /// ```typescript
  /// const result = await instance.createRestore({
  ///   file: '/path/to/backup.dump',
  ///   format: PgRestoreFormat.Custom,
  ///   clean: true
  /// }, 'mydb');
  /// console.log(result.stdout);
  /// ```
  #[napi]
  pub async unsafe fn create_restore(
    &mut self,
    options: PgRestoreConfig,
    database_name: Option<String>,
  ) -> napi::Result<ToolResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    let program_dir = self.get_program_dir()?;
    let mut connection_config = self.connection_config();
    if let Some(database_name) = database_name {
      connection_config.database = Some(database_name);
    }
    let tool =
      PgRestoreTool::from_connection(connection_config, format!("{program_dir}/bin"), options);
    tool.execute().await.map_err(|error| error.into())
  }

  /// # Safety
  /// Rewinds a PostgreSQL cluster using pg_rewind
  ///
  /// This method executes pg_rewind to synchronize a PostgreSQL cluster with another
  /// copy of the same cluster, after the clusters' timelines have diverged.
  /// The instance must be running before calling this method.
  ///
  /// @param options - Configuration options for pg_rewind
  /// @param database_name - Optional name of the database to connect to (defaults to 'postgres')
  /// @returns Promise that resolves with the execution result when the rewind is complete
  /// @throws Error if the instance is not running or if the rewind fails
  ///
  /// @example
  /// ```typescript
  /// const result = await instance.createRewind({
  ///   targetPgdata: '/path/to/target/data',
  ///   sourceServer: 'host=source_host port=5432'
  /// });
  /// console.log(result.stdout);
  /// ```
  #[napi]
  pub async unsafe fn create_rewind(
    &mut self,
    options: PgRewindConfig,
    database_name: Option<String>,
  ) -> napi::Result<ToolResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    let program_dir = self.get_program_dir()?;
    let mut connection_config = self.connection_config();
    if let Some(database_name) = database_name {
      connection_config.database = Some(database_name);
    }
    let tool =
      PgRewindTool::from_connection(connection_config, format!("{program_dir}/bin"), options);
    tool.execute().await.map_err(|error| error.into())
  }

  /// # Safety
  /// Creates a dump of all databases using pg_dumpall
  ///
  /// This method executes pg_dumpall to create a backup of all databases in the
  /// PostgreSQL cluster, including global objects like roles and tablespaces.
  /// The instance must be running before calling this method.
  ///
  /// @param options - Configuration options for pg_dumpall
  /// @returns Promise that resolves with the execution result when the dump is complete
  /// @throws Error if the instance is not running or if the dump fails
  ///
  /// @example
  /// ```typescript
  /// const result = await instance.createDumpall({
  ///   file: '/path/to/cluster_backup.sql',
  ///   rolesOnly: false,
  ///   clean: true
  /// });
  /// console.log(result.stdout);
  /// ```
  #[napi]
  pub async unsafe fn create_dumpall(
    &mut self,
    options: PgDumpallConfig,
  ) -> napi::Result<ToolResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    let program_dir = self.get_program_dir()?;
    let tool = PgDumpallTool::from_connection(
      self.connection_config(),
      format!("{program_dir}/bin"),
      options,
    );
    tool.execute().await.map_err(|error| error.into())
  }

  /// # Safety
  /// Executes SQL commands using psql
  ///
  /// This method executes SQL commands directly using the psql command-line tool.
  /// The instance must be running before calling this method.
  ///
  /// @param sql - The SQL command(s) to execute
  /// @param options - Configuration options for psql
  /// @param database_name - Optional database name to connect to (defaults to 'postgres')
  /// @returns Promise that resolves with the execution result
  /// @throws Error if the instance is not running or if the execution fails
  ///
  /// @example
  /// ```typescript
  /// const result = await instance.executeSql('SELECT version();', {});
  /// console.log(result.stdout);
  /// ```
  #[napi]
  pub async unsafe fn execute_sql(
    &mut self,
    sql: String,
    options: PsqlConfig,
    database_name: Option<String>,
  ) -> napi::Result<ToolResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    let program_dir = self.get_program_dir()?;
    let mut connection_config = self.connection_config();
    if let Some(database_name) = database_name {
      connection_config.database = Some(database_name);
    }
    let tool = PsqlTool::from_connection(connection_config, format!("{program_dir}/bin"), options);
    tool
      .execute_command(sql)
      .await
      .map_err(|error| error.into())
  }

  /// # Safety
  /// Executes SQL commands from a file using psql
  ///
  /// This method executes SQL commands from a file using the psql command-line tool.
  /// The instance must be running before calling this method.
  ///
  /// @param file_path - Path to the SQL file to execute
  /// @param options - Configuration options for psql
  /// @param database_name - Optional database name to connect to (defaults to 'postgres')
  /// @returns Promise that resolves with the execution result
  /// @throws Error if the instance is not running, if the file doesn't exist, or if the execution fails
  ///
  /// @example
  /// ```typescript
  /// const result = await instance.executeFile('/path/to/script.sql', {}, 'mydb');
  /// console.log(result.stdout);
  /// ```
  #[napi]
  pub async unsafe fn execute_file(
    &mut self,
    file_path: String,
    options: PsqlConfig,
    database_name: Option<String>,
  ) -> napi::Result<ToolResult> {
    let current_state = self.get_state()?;
    if !matches!(current_state, InstanceState::Running) {
      return Err(database_error("PostgreSQL instance is not running"));
    }

    let program_dir = self.get_program_dir()?;
    let mut connection_config = self.connection_config();
    if let Some(database_name) = database_name {
      connection_config.database = Some(database_name);
    }
    let tool = PsqlTool::from_connection(connection_config, format!("{program_dir}/bin"), options);
    tool
      .execute_file(file_path)
      .await
      .map_err(|error| error.into())
  }

  /// # Safety
  /// Drops (deletes) a database asynchronously
  ///
  /// @param name - The name of the database to drop
  /// @returns Promise that resolves when the database is dropped
  /// @throws Error if the instance is not running or if database deletion fails
  ///
  /// @example
  /// ```typescript
  /// await instance.dropDatabase('myapp');
  /// ```
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
        Err(e) => Err(convert_postgresql_error(e).into()),
      }
    } else {
      Err(database_error("PostgreSQL instance not initialized"))
    }
  }

  /// Checks if a database exists asynchronously
  ///
  /// @param name - The name of the database to check
  /// @returns Promise that resolves to true if the database exists, false otherwise
  /// @throws Error if the instance is not running or if the check fails
  ///
  /// @example
  /// ```typescript
  /// const exists = await instance.databaseExists('myapp');
  /// if (exists) {
  ///   console.log('Database exists');
  /// }
  /// ```
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
        Err(e) => Err(convert_postgresql_error(e).into()),
      }
    } else {
      Err(database_error("PostgreSQL instance not initialized"))
    }
  }

  /// # Safety
  /// Starts the PostgreSQL instance asynchronously with a timeout
  ///
  /// @param timeout_seconds - Maximum time to wait for startup in seconds
  /// @returns Promise that resolves when the instance is started and ready
  /// @throws Error if the instance is already running, if startup fails, or if timeout is exceeded
  ///
  /// @example
  /// ```typescript
  /// await instance.startWithTimeout(30); // 30 second timeout
  /// ```
  #[napi]
  pub async unsafe fn start_with_timeout(&mut self, timeout_seconds: u32) -> napi::Result<()> {
    let timeout_duration = Duration::from_secs(timeout_seconds as u64);

    pg_log!(
      info,
      "Starting PostgreSQL instance with timeout of {} seconds",
      timeout_seconds
    );

    // Use tokio::time::timeout to wrap the start operation
    match tokio::time::timeout(timeout_duration, self.start(Some(true))).await {
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

  /// # Safety
  /// Stops the PostgreSQL instance asynchronously with a timeout
  ///
  /// @param timeout_seconds - Maximum time to wait for shutdown in seconds
  /// @returns Promise that resolves when the instance is stopped
  /// @throws Error if the instance is already stopped, if stopping fails, or if timeout is exceeded
  ///
  /// @example
  /// ```typescript
  /// await instance.stopWithTimeout(10); // 10 second timeout
  /// ```
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

  /// Gets the startup time of the PostgreSQL instance in seconds
  ///
  /// This method returns the time it took for the last successful start operation.
  ///
  /// @returns The startup time in seconds, or null if the instance hasn't been started yet
  ///
  /// @example
  /// ```typescript
  /// await instance.start();
  /// const startupTime = instance.getStartupTime();
  /// console.log(`Started in ${startupTime} seconds`);
  /// ```
  #[napi]
  pub fn get_startup_time(&self) -> Option<f64> {
    if let Ok(startup_time) = self.startup_time.lock() {
      startup_time.map(|duration| duration.as_secs_f64())
    } else {
      None
    }
  }

  /// Clears the connection information cache
  ///
  /// This forces the next call to connectionInfo to regenerate the connection information.
  ///
  /// @returns void
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

  /// Checks if the connection information cache is valid
  ///
  /// The cache is considered valid if it exists and is less than 5 minutes old.
  ///
  /// @returns true if the cache is valid, false otherwise
  #[napi]
  pub fn is_connection_cache_valid(&self) -> bool {
    if let Ok(cache) = self.connection_cache.lock() {
      if let Some(cached) = cache.as_ref() {
        return cached.created_at.elapsed() < Duration::from_secs(300);
      }
    }
    false
  }

  /// Gets the PostgreSQL version used by this instance
  ///
  /// @returns PostgreSQL version string (e.g., "15.4")
  ///
  /// @example
  /// ```typescript
  /// const version = instance.getPostgreSQLVersion();
  /// console.log(`Using PostgreSQL ${version}`);
  /// ```
  #[napi]
  pub fn get_postgre_sql_version(&self) -> String {
    crate::version::get_postgre_sql_version()
  }

  pub fn connection_config(&self) -> ConnectionConfig {
    ConnectionConfig {
      host: Some(self.settings.host.clone()),
      port: Some(self.settings.port),
      username: Some(self.settings.username.clone()),
      password: Some(self.settings.password.clone()),
      database: Some("postgres".to_string()),
    }
  }

  /// # Safety
  /// Manually cleans up all resources associated with this instance
  ///
  /// This method stops the PostgreSQL instance (if running) and cleans up all resources.
  /// It's automatically called when the instance is dropped, but can be called manually
  /// for immediate cleanup.
  ///
  /// @returns void
  ///
  /// @example
  /// ```typescript
  /// await instance.cleanup();
  /// console.log('Resources cleaned up');
  /// ```
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
}
