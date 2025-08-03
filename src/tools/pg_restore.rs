use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};

use napi_derive::napi;
use postgresql_commands::pg_restore::PgRestoreBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::Command;
use tokio::process::Command as TokioCommand;

#[napi]
#[derive(Clone, Debug, Deserialize)]
/// PostgreSQL restore format options.
///
/// Specifies the format of the input archive file.
pub enum PgRestoreFormat {
  /// Custom format (created with pg_dump -Fc)
  Custom,
  /// Directory format (created with pg_dump -Fd)  
  Directory,
  /// Tar format (created with pg_dump -Ft)
  Tar,
}

impl PgRestoreFormat {
  /// Convert enum to pg_restore format string
  pub fn to_pg_restore_format(&self) -> &'static str {
    match self {
      PgRestoreFormat::Custom => "c",
      PgRestoreFormat::Directory => "d",
      PgRestoreFormat::Tar => "t",
    }
  }
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Configuration for pg_restore-specific options, separate from connection settings.
///
/// This contains only the pg_restore tool-specific configuration options,
/// allowing for clean separation when used with PostgresInstance.
pub struct PgRestoreConfig {
  /// Generic tool options like silent mode and timeout.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// The path to the dump file to restore from.
  pub file: String,
  /// The format of the archive.
  pub format: Option<PgRestoreFormat>,
  /// Clean (drop) database objects before recreating them.
  pub clean: Option<bool>,
  /// Create the database before restoring into it.
  pub create: Option<bool>,
  /// Exit on error.
  #[napi(js_name = "exitOnError")]
  pub exit_on_error: Option<bool>,
  /// Number of concurrent jobs.
  pub jobs: Option<u32>,
  /// Execute as a single transaction.
  #[napi(js_name = "singleTransaction")]
  pub single_transaction: Option<bool>,
  /// Verbose mode.
  pub verbose: Option<bool>,
  /// Restore only the data, not the schema.
  #[napi(js_name = "dataOnly")]
  pub data_only: Option<bool>,
  /// Restore only the schema, not the data.
  #[napi(js_name = "schemaOnly")]
  pub schema_only: Option<bool>,
  /// Superuser name to use for disabling triggers.
  pub superuser: Option<String>,
  /// Restore only the specified table(s).
  pub table: Option<Vec<String>>,
  /// Restore only the specified trigger(s).
  pub trigger: Option<Vec<String>>,
  /// Do not restore ownership of objects.
  #[napi(js_name = "noOwner")]
  pub no_owner: Option<bool>,
  /// Do not restore privileges (grant/revoke).
  #[napi(js_name = "noPrivileges")]
  pub no_privileges: Option<bool>,
}

/// Complete options for the `pg_restore` tool.
/// @see https://www.postgresql.org/docs/current/app-pgrestore.html
///
/// @example
/// ```typescript
/// import { PgRestoreTool, PgRestoreFormat } from 'pg-embedded';
///
/// const restoreTool = new PgRestoreTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     database: 'restored_db'
///   },
///   programDir: '/home/postgresql/17.5.0/bin',
///   config: {
///     file: './backup.dump',
///     format: PgRestoreFormat.Custom,
///     clean: true,
///     noOwner: true
///   }
/// });
/// ```
#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
pub struct PgRestoreOptions {
  /// Connection configuration for the PostgreSQL server.
  pub connection: ConnectionConfig,
  /// The directory where the `pg_restore` program is located.
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Pg_restore-specific configuration options.
  pub config: PgRestoreConfig,
}

/// A tool for restoring a PostgreSQL database from an archive created by `pg_dump`.
#[napi]
pub struct PgRestoreTool {
  options: PgRestoreOptions,
}

#[napi]
impl PgRestoreTool {
  /// Creates a new `PgRestoreTool` instance with complete options.
  /// @param {PgRestoreOptions} options - The options for the `pg_restore` tool.
  /// @returns {PgRestoreTool} A new `PgRestoreTool` instance.
  #[napi(constructor)]
  pub fn new(options: PgRestoreOptions) -> Self {
    Self { options }
  }

  #[napi(factory)]
  /// Creates a PgRestoreTool from connection info and restore-specific config.
  ///
  /// This is the preferred method when using with PostgresInstance,
  /// as it separates connection concerns from tool-specific configuration.
  ///
  /// @param connection - Database connection configuration
  /// @param program_dir - Directory containing the pg_restore executable
  /// @param config - Pg_restore-specific configuration options (including file)
  /// @returns A new PgRestoreTool instance
  ///
  /// @example
  /// ```typescript
  /// import { PgRestoreTool, PgRestoreFormat } from 'pg-embedded';
  ///
  /// const restoreTool = PgRestoreTool.fromConnection(
  ///   instance.connectionInfo,
  ///   instance.programDir + '/bin',
  ///   {
  ///     file: './backup.dump',
  ///     format: PgRestoreFormat.Custom,
  ///     clean: true,
  ///     noOwner: true
  ///   }
  /// );
  /// ```
  pub fn from_connection(
    connection: ConnectionConfig,
    program_dir: String,
    config: PgRestoreConfig,
  ) -> Self {
    let options = PgRestoreOptions {
      connection,
      program_dir,
      config,
    };
    Self { options }
  }

  fn to_command(&self) -> Result<Command> {
    let mut builder = PgRestoreBuilder::new();
    let options = &self.options;
    let config = &options.config;

    // Set program directory
    builder = builder.program_dir(&options.program_dir);

    // Don't use builder.file() as it conflicts with --dbname
    // Instead, we'll add the file as a positional argument later

    if let Some(format) = &config.format {
      builder = builder.format(format.to_pg_restore_format());
    }
    if let Some(clean) = config.clean {
      if clean {
        builder = builder.clean();
      }
    }
    if let Some(create) = config.create {
      if create {
        builder = builder.create();
      }
    }
    if let Some(exit_on_error) = config.exit_on_error {
      if exit_on_error {
        builder = builder.exit_on_error();
      }
    }
    if let Some(jobs) = config.jobs {
      builder = builder.jobs(jobs.to_string());
    }
    if let Some(single_transaction) = config.single_transaction {
      if single_transaction {
        builder = builder.single_transaction();
      }
    }
    if let Some(verbose) = config.verbose {
      if verbose {
        builder = builder.verbose();
      }
    }
    if let Some(data_only) = config.data_only {
      if data_only {
        builder = builder.data_only();
      }
    }
    if let Some(schema_only) = config.schema_only {
      if schema_only {
        builder = builder.schema_only();
      }
    }
    if let Some(superuser) = &config.superuser {
      builder = builder.superuser(superuser);
    }
    if let Some(tables) = &config.table {
      for table in tables {
        builder = builder.table(table);
      }
    }
    if let Some(triggers) = &config.trigger {
      for trigger in triggers {
        builder = builder.trigger(trigger);
      }
    }
    if let Some(no_owner) = config.no_owner {
      if no_owner {
        builder = builder.no_owner();
      }
    }
    if let Some(no_privileges) = config.no_privileges {
      if no_privileges {
        builder = builder.no_privileges();
      }
    }

    let mut command = builder.build();

    if let Some(host) = &options.connection.host {
      command.arg("--host").arg(host);
    }
    if let Some(port) = options.connection.port {
      command.arg("--port").arg(port.to_string());
    }
    if let Some(username) = &options.connection.username {
      command.arg("--username").arg(username);
    }
    if let Some(password) = &options.connection.password {
      command.env("PGPASSWORD", password);
    }
    if let Some(database) = &options.connection.database {
      command.arg("--dbname").arg(database);
    }

    // Add the file as a positional argument (not as --file option)
    command.arg(&config.file);

    Ok(command)
  }

  async fn run_command(&self, command: Command) -> Result<ToolResult> {
    let output = TokioCommand::from(command).output().await?;
    ToolResult::from_output(
      output,
      self
        .options
        .config
        .tool
        .as_ref()
        .and_then(|t| t.silent)
        .unwrap_or(false),
    )
  }

  /// Executes the pg_restore command with the configured options.
  ///
  /// This method runs the pg_restore utility and restores a database from an archive.
  ///
  /// @returns {Promise<ToolResult>} A promise that resolves with the result of the command,
  /// including exit code, stdout, and stderr.
  /// @throws {Error} If the command fails to execute or if there are configuration issues.
  ///
  /// @example
  /// ```typescript
  /// import { PgRestoreTool, PgRestoreFormat } from 'pg-embedded';
  ///
  /// const restoreTool = new PgRestoreTool({
  ///   connection: {
  ///     host: 'localhost',
  ///     port: 5432,
  ///     username: 'postgres',
  ///     database: 'restored_db'
  ///   },
  ///   programDir: '/home/postgresql/17.5.0/bin',
  ///   config: {
  ///     file: './backup.dump',
  ///     format: PgRestoreFormat.Custom,
  ///     clean: true,
  ///     create: true
  ///   }
  /// });
  ///
  /// const result = await restoreTool.execute();
  /// if (result.exitCode === 0) {
  ///   console.log('Database restored successfully.');
  /// } else {
  ///   console.error('Restore failed:', result.stderr);
  /// }
  /// ```
  #[napi]
  pub async fn execute(&self) -> Result<ToolResult> {
    let command = self.to_command()?;
    self.run_command(command).await
  }
}
