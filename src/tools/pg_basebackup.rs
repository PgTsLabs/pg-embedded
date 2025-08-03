use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_basebackup::PgBaseBackupBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi]
#[derive(Clone, Debug, Deserialize)]
/// PostgreSQL base backup format options.
///
/// Specifies the output format for the base backup.
pub enum PgBasebackupFormat {
  /// Plain format - creates a directory with database files
  Plain,
  /// Tar format - creates tar archive files
  Tar,
}

impl PgBasebackupFormat {
  /// Convert enum to pg_basebackup format string
  pub fn to_pg_basebackup_format(&self) -> &'static str {
    match self {
      PgBasebackupFormat::Plain => "p",
      PgBasebackupFormat::Tar => "t",
    }
  }
}

#[napi]
#[derive(Clone, Debug, Deserialize)]
/// WAL method options for pg_basebackup.
///
/// Specifies how WAL files should be handled during backup.
pub enum PgBasebackupWalMethod {
  /// Don't include WAL files
  None,
  /// Fetch WAL files at the end of backup
  Fetch,
  /// Stream WAL files during backup
  Stream,
}

impl PgBasebackupWalMethod {
  /// Convert enum to pg_basebackup wal-method string
  pub fn to_pg_basebackup_wal_method(&self) -> &'static str {
    match self {
      PgBasebackupWalMethod::None => "none",
      PgBasebackupWalMethod::Fetch => "fetch",
      PgBasebackupWalMethod::Stream => "stream",
    }
  }
}

#[napi]
#[derive(Clone, Debug, Deserialize)]
/// Checkpoint mode options for pg_basebackup.
///
/// Specifies how the checkpoint should be performed.
pub enum PgBasebackupCheckpoint {
  /// Fast checkpoint (may cause I/O spike)
  Fast,
  /// Spread checkpoint over time (default)
  Spread,
}

impl PgBasebackupCheckpoint {
  /// Convert enum to pg_basebackup checkpoint string
  pub fn to_pg_basebackup_checkpoint(&self) -> &'static str {
    match self {
      PgBasebackupCheckpoint::Fast => "fast",
      PgBasebackupCheckpoint::Spread => "spread",
    }
  }
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Configuration for pg_basebackup-specific options, separate from connection settings.
///
/// This contains only the pg_basebackup tool-specific configuration options,
/// allowing for clean separation when used with PostgresInstance.
pub struct PgBasebackupConfig {
  /// Generic tool options like silent mode and timeout.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// Specifies the output directory for the backup.
  #[napi(js_name = "pgdata")]
  pub pgdata: String,
  /// The output format for the backup.
  pub format: Option<PgBasebackupFormat>,
  /// Enable verbose mode.
  /// Corresponds to the `--verbose` command-line argument.
  pub verbose: Option<bool>,
  /// Set checkpoint mode.
  /// Corresponds to the `--checkpoint` command-line argument.
  pub checkpoint: Option<PgBasebackupCheckpoint>,
  /// Create a temporary replication slot.
  /// Corresponds to the `--create-slot` command-line argument.
  #[napi(js_name = "createSlot")]
  pub create_slot: Option<bool>,
  /// Maximum transfer rate of the data directory.
  /// Corresponds to the `--max-rate` command-line argument.
  #[napi(js_name = "maxRate")]
  pub max_rate: Option<String>,
  /// Method for including WAL files.
  /// Corresponds to the `--wal-method` command-line argument.
  #[napi(js_name = "walMethod")]
  pub wal_method: Option<PgBasebackupWalMethod>,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Complete options for configuring the `pg_basebackup` command.
///
/// This interface corresponds to the command-line arguments of the `pg_basebackup` utility.
/// For use with PostgresInstance, consider using PgBasebackupConfig instead.
///
/// @example
/// ```typescript
/// import { PgBasebackupTool, PgBasebackupFormat, PgBasebackupWalMethod } from 'pg-embedded';
///
/// const basebackupOptions: PgBasebackupOptions = {
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///   },
///   programDir: '/path/to/postgres/bin',
///   config: {
///     pgdata: './backup_dir',
///     format: PgBasebackupFormat.Plain,
///     walMethod: PgBasebackupWalMethod.Fetch,
///   }
/// };
/// ```
pub struct PgBasebackupOptions {
  /// Database connection parameters.
  pub connection: ConnectionConfig,
  /// The directory containing the `pg_basebackup` executable.
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Pg_basebackup-specific configuration options.
  pub config: PgBasebackupConfig,
}

#[napi]
/// A tool for taking base backups of a running PostgreSQL cluster.
/// This class provides an interface to the `pg_basebackup` command-line utility.
///
/// @example
/// ```typescript
/// import { PgBasebackupTool, PgBasebackupFormat, PgBasebackupWalMethod } from 'pg-embedded';
///
/// const backup = new PgBasebackupTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///   },
///   programDir: '/path/to/postgres/bin',
///   config: {
///     pgdata: './backup_dir',
///     format: PgBasebackupFormat.Plain,
///     walMethod: PgBasebackupWalMethod.Fetch,
///   }
/// });
///
/// const result = await backup.execute();
/// if (result.exitCode === 0) {
///   console.log('Base backup completed successfully.');
/// } else {
///   console.error(`Backup failed with error: ${result.stderr}`);
/// }
/// ```
pub struct PgBasebackupTool {
  options: PgBasebackupOptions,
}

#[napi]
impl PgBasebackupTool {
  /// Creates a new `PgBasebackupTool` instance with complete options.
  /// @param options - The configuration options for `pg_basebackup`.
  #[napi(constructor)]
  pub fn new(options: PgBasebackupOptions) -> Self {
    Self { options }
  }

  #[napi(factory)]
  /// Creates a PgBasebackupTool from connection info and basebackup-specific config.
  ///
  /// This is the preferred method when using with PostgresInstance,
  /// as it separates connection concerns from tool-specific configuration.
  ///
  /// @param connection - Database connection configuration
  /// @param program_dir - Directory containing the pg_basebackup executable
  /// @param config - Pg_basebackup-specific configuration options (including pgdata)
  /// @returns A new PgBasebackupTool instance
  ///
  /// @example
  /// ```typescript
  /// import { PgBasebackupTool, PgBasebackupFormat, PgBasebackupWalMethod } from 'pg-embedded';
  ///
  /// const backupTool = PgBasebackupTool.fromConnection(
  ///   instance.connectionInfo,
  ///   instance.programDir + '/bin',
  ///   {
  ///     pgdata: './backup_directory',
  ///     format: PgBasebackupFormat.Plain,
  ///     walMethod: PgBasebackupWalMethod.Fetch,
  ///     verbose: true
  ///   }
  /// );
  /// ```
  pub fn from_connection(
    connection: ConnectionConfig,
    program_dir: String,
    config: PgBasebackupConfig,
  ) -> Self {
    let options = PgBasebackupOptions {
      connection,
      program_dir,
      config,
    };
    Self { options }
  }

  #[napi]
  /// Executes the `pg_basebackup` command.
  ///
  /// The backup will be written to the directory specified in the `pgdata` option.
  ///
  /// @returns A promise that resolves with the result of the command execution.
  pub async fn execute(&self) -> Result<ToolResult> {
    let command = to_command(&self.options)?;
    run_command(command, &self.options).await
  }
}

fn to_command(options: &PgBasebackupOptions) -> Result<Command> {
  let mut builder = PgBaseBackupBuilder::new();
  let config = &options.config;

  builder = builder.program_dir(&options.program_dir);

  let connection = &options.connection;
  if let Some(host) = &connection.host {
    builder = builder.host(host);
  }
  if let Some(port) = connection.port {
    builder = builder.port(port);
  }
  if let Some(user) = &connection.username {
    builder = builder.username(user);
  }
  if let Some(password) = &connection.password {
    builder = builder.pg_password(password);
  }

  builder = builder.pgdata(&config.pgdata);

  if let Some(format) = &config.format {
    builder = builder.format(format.to_pg_basebackup_format());
  }
  if let Some(verbose) = config.verbose {
    if verbose {
      builder = builder.verbose();
    }
  }
  if let Some(checkpoint) = &config.checkpoint {
    builder = builder.checkpoint(checkpoint.to_pg_basebackup_checkpoint());
  }
  if let Some(create_slot) = config.create_slot {
    if create_slot {
      builder = builder.create_slot();
    }
  }
  if let Some(max_rate) = &config.max_rate {
    builder = builder.max_rate(max_rate);
  }
  if let Some(wal_method) = &config.wal_method {
    builder = builder.wal_method(wal_method.to_pg_basebackup_wal_method());
  }

  let command = builder.build();
  Ok(command)
}

async fn run_command(command: Command, options: &PgBasebackupOptions) -> Result<ToolResult> {
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
