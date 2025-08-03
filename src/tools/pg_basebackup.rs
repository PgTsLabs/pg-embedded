use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_basebackup::PgBaseBackupBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Options for configuring the `pg_basebackup` command.
///
/// This interface corresponds to the command-line arguments of the `pg_basebackup` utility.
///
/// @example
/// ```typescript
/// const basebackupOptions: PgBasebackupOptions = {
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///   },
///   programDir: '/path/to/postgres/bin',
///   pgdata: './backup_dir',
///   format: 'p', // plain format
///   walMethod: 'fetch',
/// };
/// ```
pub struct PgBasebackupOptions {
  /// Database connection parameters.
  #[serde(flatten)]
  pub connection: ConnectionConfig,
  /// General tool options.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// The directory containing the `pg_basebackup` executable.
  /// Corresponds to the `--pgdata` command-line argument.
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Specifies the output directory for the backup.
  #[napi(js_name = "pgdata")]
  pub pgdata: String,
  /// The output format. Can be `p` (plain) or `t` (tar).
  /// Corresponds to the `--format` command-line argument.
  pub format: Option<String>,
  /// Enable verbose mode.
  /// Corresponds to the `--verbose` command-line argument.
  pub verbose: Option<bool>,
  /// Set checkpoint mode to `fast` or `spread`.
  /// Corresponds to the `--checkpoint` command-line argument.
  pub checkpoint: Option<String>,
  /// Create a temporary replication slot.
  /// Corresponds to the `--create-slot` command-line argument.
  #[napi(js_name = "createSlot")]
  pub create_slot: Option<bool>,
  /// Maximum transfer rate of the data directory.
  /// Corresponds to the `--max-rate` command-line argument.
  #[napi(js_name = "maxRate")]
  pub max_rate: Option<String>,
  /// Method for including WAL files. Can be `none`, `fetch`, or `stream`.
  /// Corresponds to the `--wal-method` command-line argument.
  #[napi(js_name = "walMethod")]
  pub wal_method: Option<String>,
}

#[napi]
/// A tool for taking base backups of a running PostgreSQL cluster.
/// This class provides an interface to the `pg_basebackup` command-line utility.
///
/// @example
/// ```typescript
/// import { PgBasebackupTool } from 'pg-embedded';
///
/// const backup = new PgBasebackupTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///   },
///   programDir: '/path/to/postgres/bin',
///   pgdata: './backup_dir',
///   walMethod: 'fetch',
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
  /// Creates a new `PgBasebackupTool` instance.
  /// @param options - The configuration options for `pg_basebackup`.
  #[napi(constructor)]
  pub fn new(options: PgBasebackupOptions) -> Self {
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

  builder = builder.pgdata(&options.pgdata);

  if let Some(format) = &options.format {
    builder = builder.format(format);
  }
  if let Some(verbose) = options.verbose {
    if verbose {
      builder = builder.verbose();
    }
  }
  if let Some(checkpoint) = &options.checkpoint {
    builder = builder.checkpoint(checkpoint);
  }
  if let Some(create_slot) = options.create_slot {
    if create_slot {
      builder = builder.create_slot();
    }
  }
  if let Some(max_rate) = &options.max_rate {
    builder = builder.max_rate(max_rate);
  }
  if let Some(wal_method) = &options.wal_method {
    builder = builder.wal_method(wal_method);
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
      .tool
      .as_ref()
      .and_then(|t| t.silent)
      .unwrap_or(false),
  )
}
