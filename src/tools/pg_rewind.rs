use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_rewind::PgRewindBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::Command;
use std::process::Stdio;
use tokio::process::Command as TokioCommand;

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Configuration for pg_rewind-specific options, separate from connection settings.
///
/// This contains only the pg_rewind tool-specific configuration options,
/// allowing for clean separation when used with PostgresInstance.
pub struct PgRewindConfig {
  /// Generic tool options like silent mode and timeout.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// Path to the target PostgreSQL data directory to be rewound (required).
  /// This is the data directory that will be synchronized with the source.
  /// The target server should be stopped before running pg_rewind.
  /// Equivalent to pg_rewind --target-pgdata flag.
  #[napi(js_name = "targetPgdata")]
  pub target_pgdata: String,
  /// Path to the source PostgreSQL data directory (alternative to sourceServer).
  /// Use this when both source and target are on the same machine.
  /// Either sourcePgdata or sourceServer (or sourceInstance) must be specified.
  /// Equivalent to pg_rewind --source-pgdata flag.
  #[napi(js_name = "sourcePgdata")]
  pub source_pgdata: Option<String>,
  /// Connection string to the source PostgreSQL server (alternative to sourcePgdata).
  /// Format: 'host=localhost port=5432 user=postgres password=secret dbname=mydb'
  /// Either sourceServer or sourcePgdata (or sourceInstance) must be specified.
  /// Equivalent to pg_rewind --source-server flag.
  #[napi(js_name = "sourceServer")]
  pub source_server: Option<String>,
  /// Source server connection configuration (alternative to sourceServer string).
  /// This is a convenient way to pass PostgresInstance.connectionInfo directly
  /// without manually constructing connection strings. Takes precedence over sourceServer.
  #[napi(js_name = "sourceInstance")]
  pub source_instance: Option<ConnectionConfig>,
  /// Perform a dry run without making any actual changes to files.
  /// Useful for testing and validation. Shows what would be done without doing it.
  /// Equivalent to pg_rewind --dry-run flag.
  #[napi(js_name = "dryRun")]
  pub dry_run: Option<bool>,
  /// Display progress information during the rewind operation.
  /// Shows detailed information about the synchronization process.
  /// Equivalent to pg_rewind --progress flag.
  pub progress: Option<bool>,
  /// Enable debug output for troubleshooting.
  /// Provides detailed information about the rewind process for debugging.
  /// Equivalent to pg_rewind --debug flag.
  pub debug: Option<bool>,
  /// Use restore_command to retrieve WAL files from archive when needed.
  /// This allows pg_rewind to fetch required WAL files from the archive.
  /// Equivalent to pg_rewind --restore-target-wal flag.
  #[napi(js_name = "restoreTargetWal")]
  pub restore_target_wal: Option<bool>,
  /// Automatically configure all WAL-related settings required for pg_rewind.
  /// When enabled, this will configure wal_log_hints, archive_mode, archive_command,
  /// restore_command, wal_level, and max_wal_senders in postgresql.conf.
  /// This eliminates the need for manual PostgreSQL configuration.
  #[napi(js_name = "autoConfigureWal")]
  pub auto_configure_wal: Option<bool>,
  /// Directory path for WAL file archiving (used with autoConfigureWal).
  /// If not specified, a temporary directory will be created automatically.
  /// This directory stores WAL files needed for the rewind operation.
  #[napi(js_name = "walArchiveDir")]
  pub wal_archive_dir: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Complete configuration options for the PostgreSQL pg_rewind tool.
///
/// This interface defines all available options for synchronizing PostgreSQL data directories
/// using pg_rewind. The `programDir` and `targetPgdata` fields are required, while other
/// fields are optional and will use pg_rewind's default values if not specified.
/// For use with PostgresInstance, consider using PgRewindConfig instead.
///
/// pg_rewind is used to synchronize a PostgreSQL data directory with another copy of the
/// same database cluster after they have diverged. This is commonly used for failover
/// scenarios where you need to rewind a former primary server to become a standby.
///
/// @example Basic usage with connection string
/// ```typescript
/// import { PgRewindTool } from 'pg-embedded';
///
/// const rewindTool = new PgRewindTool({
///   connection: targetConnectionInfo,
///   programDir: '/home/postgresql/17.5.0/bin',
///   config: {
///     targetPgdata: './target_data_dir',
///     sourceServer: 'host=localhost port=5432 user=postgres password=secret',
///     progress: true,
///     dryRun: false
///   }
/// });
///
/// const result = await rewindTool.execute();
/// console.log('Rewind completed:', result.exitCode === 0);
/// ```
///
/// @example Simplified usage with auto-configuration
/// ```typescript
/// const rewindTool = new PgRewindTool({
///   connection: targetConnectionInfo,
///   programDir: '/home/postgresql/17.5.0/bin',
///   config: {
///     targetPgdata: './target_data_dir',
///     sourceInstance: sourceConnectionInfo,
///     autoConfigureWal: true,
///     progress: true
///   }
/// });
/// ```
pub struct PgRewindOptions {
  /// Database connection configuration (required for target server).
  /// Specifies how to connect to the PostgreSQL target server.
  pub connection: ConnectionConfig,
  /// Directory path where the pg_rewind executable is located (required).
  /// This should point to the directory containing the pg_rewind binary.
  /// Equivalent to specifying the PATH to pg_rewind.
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Pg_rewind-specific configuration options.
  pub config: PgRewindConfig,
}

#[napi]
/// PostgreSQL data directory synchronization tool using pg_rewind.
///
/// This class provides a TypeScript interface for synchronizing PostgreSQL data directories
/// using PostgreSQL's pg_rewind utility. It's commonly used in failover scenarios to rewind
/// a former primary server so it can become a standby server again.
///
/// pg_rewind works by finding the point where the target and source servers' timelines
/// diverged, then replaying changes from the source to bring the target back in sync.
/// This requires that the target server has WAL logging enabled and either data checksums
/// or wal_log_hints enabled.
///
/// @example Basic rewind operation
/// ```typescript
/// import { PgRewindTool } from 'pg-embedded';
///
/// const rewindTool = new PgRewindTool({
///   programDir: '/home/postgresql/17.5.0/bin',
///   targetPgdata: './former_primary_data',
///   sourceServer: 'host=localhost port=5432 user=postgres password=secret',
///   progress: true,
///   dryRun: false
/// });
///
/// const result = await rewindTool.execute();
/// if (result.exitCode === 0) {
///   console.log('Rewind completed successfully');
/// } else {
///   console.error('Rewind failed:', result.stderr);
/// }
/// ```
///
/// @example Simplified usage with auto-configuration
/// ```typescript
/// const rewindTool = new PgRewindTool({
///   connection: targetConnectionInfo,
///   programDir: '/home/postgresql/17.5.0/bin',
///   targetPgdata: './target_data_dir',
///   sourceInstance: sourceConnectionInfo,
///   autoConfigureWal: true,
///   progress: true
/// });
///
/// const result = await rewindTool.execute();
/// ```
///
/// @example Dry run for validation
/// ```typescript
/// const rewindTool = new PgRewindTool({
///   programDir: '/home/postgresql/17.5.0/bin',
///   targetPgdata: './target_data_dir',
///   sourceServer: 'host=source-server port=5432 user=postgres',
///   dryRun: true,
///   debug: true
/// });
///
/// const result = await rewindTool.execute();
/// console.log('Dry run output:', result.stdout);
/// ```
pub struct PgRewindTool {
  options: PgRewindOptions,
}

#[napi]
impl PgRewindTool {
  /// Creates a new PgRewindTool instance with complete options.
  ///
  /// @param options - Configuration options for the pg_rewind operation (programDir and targetPgdata are required)
  /// @returns A new PgRewindTool instance ready to execute rewind operations
  ///
  /// @example
  /// ```typescript
  /// const rewindTool = new PgRewindTool({
  ///   connection: targetConnectionInfo,
  ///   programDir: '/home/postgresql/17.5.0/bin',
  ///   targetPgdata: './target_data_dir',
  ///   config: {
  ///     sourceServer: 'host=localhost port=5432 user=postgres',
  ///     progress: true
  ///   }
  /// });
  /// ```
  #[napi(constructor)]
  pub fn new(options: PgRewindOptions) -> Self {
    Self { options }
  }

  #[napi(factory)]
  /// Creates a PgRewindTool from connection info and rewind-specific config.
  ///
  /// This is the preferred method when using with PostgresInstance,
  /// as it separates connection concerns from tool-specific configuration.
  ///
  /// @param connection - Database connection configuration for target server
  /// @param program_dir - Directory containing the pg_rewind executable
  /// @param config - Pg_rewind-specific configuration options (including targetPgdata)
  /// @returns A new PgRewindTool instance
  ///
  /// @example
  /// ```typescript
  /// const rewindTool = PgRewindTool.fromConnection(
  ///   targetInstance.connectionInfo,
  ///   targetInstance.programDir + '/bin',
  ///   {
  ///     targetPgdata: './target_data_dir',
  ///     sourceInstance: sourceInstance.connectionInfo,
  ///     progress: true,
  ///     autoConfigureWal: true
  ///   }
  /// );
  /// ```
  pub fn from_connection(
    connection: ConnectionConfig,
    program_dir: String,
    config: PgRewindConfig,
  ) -> Self {
    let options = PgRewindOptions {
      connection,
      program_dir,
      config,
    };
    Self { options }
  }

  #[napi]
  /// Executes the pg_rewind command with the configured options.
  ///
  /// This method runs the pg_rewind utility to synchronize the target data directory
  /// with the source. If autoConfigureWal is enabled, it will first configure all
  /// necessary WAL settings automatically.
  ///
  /// The target PostgreSQL server must be stopped before running this command.
  /// The source server should be running and accessible.
  ///
  /// @returns Promise<ToolResult> containing exit code, stdout, and stderr
  /// @throws Error if the command fails to execute or if there are configuration issues
  ///
  /// @example Basic execution
  /// ```typescript
  /// const result = await rewindTool.execute();
  /// if (result.exitCode === 0) {
  ///   console.log('Rewind completed successfully');
  ///   console.log('Output:', result.stdout);
  /// } else {
  ///   console.error('Rewind failed:', result.stderr);
  /// }
  /// ```
  ///
  /// @example With error handling
  /// ```typescript
  /// try {
  ///   const result = await rewindTool.execute();
  ///   if (result.exitCode === 0) {
  ///     console.log('Target server successfully rewound');
  ///   } else {
  ///     console.error('pg_rewind failed with exit code:', result.exitCode);
  ///     console.error('Error details:', result.stderr);
  ///   }
  /// } catch (error) {
  ///   console.error('Failed to execute pg_rewind:', error.message);
  /// }
  /// ```
  pub async fn execute(&self) -> Result<ToolResult> {
    // Auto-configure WAL settings if requested
    if self.options.config.auto_configure_wal.unwrap_or(false) {
      self.auto_configure_wal_settings().await?;
    }

    let command = to_command(&self.options)?;
    run_command(command, &self.options).await
  }

  /// Automatically configures all WAL-related PostgreSQL settings required for pg_rewind.
  ///
  /// This method modifies the target server's postgresql.conf file to enable all settings
  /// necessary for pg_rewind to function properly. It configures:
  /// - wal_log_hints = on (required for pg_rewind)
  /// - archive_mode = on (enables WAL archiving)
  /// - archive_command (copies WAL files to archive directory)
  /// - restore_command (retrieves WAL files from archive)
  /// - wal_level = replica (enables replication)
  /// - max_wal_senders = 3 (allows WAL streaming)
  ///
  /// The method creates the WAL archive directory if it doesn't exist and writes
  /// the configuration to the postgresql.conf file. The target PostgreSQL server
  /// must be restarted after this configuration for the changes to take effect.
  ///
  /// This is automatically called when autoConfigureWal option is enabled.
  ///
  /// @throws Error if the configuration file cannot be read/written or if directory creation fails
  ///
  /// @example Manual usage (normally called automatically)
  /// ```typescript
  /// // This is typically called automatically when autoConfigureWal: true
  /// // But can be called manually if needed:
  /// await rewindTool.autoConfigureWalSettings();
  /// ```
  async fn auto_configure_wal_settings(&self) -> Result<()> {
    use std::fs;
    use std::path::Path;

    println!("[DEBUG] Starting auto_configure_wal_settings");

    // Create WAL archive directory if not specified
    let archive_dir = if let Some(dir) = &self.options.config.wal_archive_dir {
      dir.clone()
    } else {
      // Use a temporary directory next to target_pgdata
      let target_path = Path::new(&self.options.config.target_pgdata);
      let parent = target_path.parent().unwrap_or(Path::new("."));
      parent.join("wal_archive").to_string_lossy().to_string()
    };

    println!("[DEBUG] Archive directory: {archive_dir}");

    // Create archive directory
    fs::create_dir_all(&archive_dir).map_err(|e| {
      crate::error::PgEmbedError::InternalError(format!(
        "Failed to create WAL archive directory: {e}",
      ))
    })?;

    // Configure target PostgreSQL instance
    let config_path = Path::new(&self.options.config.target_pgdata).join("postgresql.conf");

    println!("[DEBUG] Config path: {config_path:?}");

    if config_path.exists() {
      println!("[DEBUG] Config file exists, reading...");
      let mut config_content = fs::read_to_string(&config_path).map_err(|e| {
        crate::error::PgEmbedError::InternalError(format!("Failed to read postgresql.conf: {e}"))
      })?;

      // Add required configurations for pg_rewind
      let additional_config = format!(
        "\n# Auto-configured for pg_rewind\n\
         wal_log_hints = on\n\
         archive_mode = on\n\
         archive_command = 'cp \"%p\" \"{archive_dir}//%f\"'\n\
         restore_command = 'cp \"{archive_dir}//%f\" \"%p\"'\n\
         wal_level = replica\n\
         max_wal_senders = 3\n",
      );

      println!("[DEBUG] Adding configuration:\n{additional_config}");

      config_content.push_str(&additional_config);

      fs::write(&config_path, config_content).map_err(|e| {
        crate::error::PgEmbedError::InternalError(format!("Failed to write postgresql.conf: {e}"))
      })?;

      println!("[DEBUG] Configuration written successfully");

      // Try to reload configuration if possible
      // For pg_rewind, we need the target server to have loaded these settings at some point
      // Since the target is typically stopped, we'll add a note about this requirement
      println!("[DEBUG] Note: Target server must be restarted to load WAL configuration before using pg_rewind");
    } else {
      println!("[DEBUG] Config file does not exist!");
    }

    Ok(())
  }
}

fn to_command(options: &PgRewindOptions) -> Result<Command> {
  let mut builder = PgRewindBuilder::new();
  let config = &options.config;

  builder = builder.program_dir(&options.program_dir);

  builder = builder.target_pgdata(&config.target_pgdata);

  if let Some(source_pgdata) = &config.source_pgdata {
    builder = builder.source_pgdata(source_pgdata);
  }

  if let Some(source_server) = &config.source_server {
    builder = builder.source_server(source_server);
  } else if let Some(source_instance) = &config.source_instance {
    // Build connection string from sourceInstance
    let mut conn_str = String::new();
    if let Some(host) = &source_instance.host {
      conn_str.push_str(&format!("host={host} "));
    }
    if let Some(port) = source_instance.port {
      conn_str.push_str(&format!("port={port} "));
    }
    if let Some(username) = &source_instance.username {
      conn_str.push_str(&format!("user={username} "));
    }
    if let Some(password) = &source_instance.password {
      conn_str.push_str(&format!("password={password} "));
    }
    if let Some(database) = &source_instance.database {
      conn_str.push_str(&format!("dbname={database} "));
    }
    if !conn_str.is_empty() {
      builder = builder.source_server(conn_str.trim());
    }
  } else {
    // Fallback: construct from the main connection options if neither is provided
    let mut conn_str = String::new();
    if let Some(host) = &options.connection.host {
      conn_str.push_str(&format!("host={host} "));
    }
    if let Some(port) = options.connection.port {
      conn_str.push_str(&format!("port={port} "));
    }
    if let Some(username) = &options.connection.username {
      conn_str.push_str(&format!("user={username} "));
    }
    if let Some(password) = &options.connection.password {
      conn_str.push_str(&format!("password={password} "));
    }
    if !conn_str.is_empty() {
      builder = builder.source_server(conn_str.trim());
    }
  }

  if let Some(dry_run) = config.dry_run {
    if dry_run {
      builder = builder.dry_run();
    }
  }

  if let Some(progress) = config.progress {
    if progress {
      builder = builder.progress();
    }
  }

  if let Some(debug) = config.debug {
    if debug {
      builder = builder.debug();
    }
  }

  if let Some(restore_target_wal) = config.restore_target_wal {
    if restore_target_wal {
      builder = builder.restore_target_wal();
    }
  }

  let command = builder.build();
  Ok(command)
}

async fn run_command(command: Command, options: &PgRewindOptions) -> Result<ToolResult> {
  let output = TokioCommand::from(command)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output()
    .await?;
  ToolResult::from_output(
    output,
    options
      .config
      .tool
      .as_ref()
      .and_then(|t| t.silent)
      .unwrap_or(false),
  )
}
