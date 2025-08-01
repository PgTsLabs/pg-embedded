use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolResult};

use napi_derive::napi;
use postgresql_commands::pg_restore::PgRestoreBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::Command;
use tokio::process::Command as TokioCommand;

/**
 * Options for the `pg_restore` tool.
 * @see https://www.postgresql.org/docs/current/app-pgrestore.html
 */
#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PgRestoreOptions {
  /**
   * Connection configuration for the PostgreSQL server.
   * @type {ConnectionConfig}
   */
  #[serde(flatten)]
  pub connection: ConnectionConfig,
  /**
   * The path to the dump file.
   * @type {string}
   */
  pub file: String,
  /**
   * The format of the archive.
   * @type {string | undefined}
   */
  pub format: Option<String>,
  /**
   * Clean (drop) database objects before recreating them.
   * @type {boolean}
   */
  pub clean: bool,
  /**
   * Create the database before restoring into it.
   * @type {boolean}
   */
  pub create: bool,
  /**
   * Exit on error.
   * @type {boolean}
   */
  pub exit_on_error: bool,
  /**
   * Number of concurrent jobs.
   * @type {number | undefined}
   */
  pub jobs: Option<u32>,
  /**
   * Execute as a single transaction.
   * @type {boolean}
   */
  pub single_transaction: bool,
  /**
   * Verbose mode.
   * @type {boolean}
   */
  pub verbose: bool,
  /**
   * The name of the database to restore into.
   * @type {string | undefined}
   */
  #[serde(rename = "dbname")]
  pub db_name: Option<String>,
  /**
   * Restore only the data, not the schema.
   * @type {boolean}
   */
  pub data_only: bool,
  /**
   * Restore only the schema, not the data.
   * @type {boolean}
   */
  pub schema_only: bool,
  /**
   * Superuser name to use for disabling triggers.
   * @type {string | undefined}
   */
  pub superuser: Option<String>,
  /**
   * Restore only the specified table(s).
   * @type {string[]}
   */
  pub table: Vec<String>,
  /**
   * Restore only the specified trigger(s).
   * @type {string[]}
   */
  pub trigger: Vec<String>,
  /**
   * Do not restore ownership of objects.
   * @type {boolean}
   */
  pub no_owner: bool,
  /**
   * Do not restore privileges (grant/revoke).
   * @type {boolean}
   */
  pub no_privileges: bool,
  /**
   * The directory where the `pg_restore` program is located.
   * @type {string | undefined}
   */
  pub program_dir: Option<String>,
}

/**
 * A tool for restoring a PostgreSQL database from an archive created by `pg_dump`.
 */
#[napi]
pub struct PgRestoreTool {
  options: PgRestoreOptions,
}

#[napi]
impl PgRestoreTool {
  /**
   * Creates a new `PgRestoreTool` instance.
   * @param {PgRestoreOptions} options - The options for the `pg_restore` tool.
   * @returns {PgRestoreTool} A new `PgRestoreTool` instance.
   */
  #[napi(constructor)]
  pub fn new(options: PgRestoreOptions) -> Self {
    Self { options }
  }

  fn to_command(&self) -> Result<Command> {
    let mut builder = PgRestoreBuilder::new();
    let options = &self.options;

    // Don't use builder.file() as it conflicts with --dbname
    // Instead, we'll add the file as a positional argument later

    if let Some(format) = &options.format {
      builder = builder.format(format);
    }
    if options.clean {
      builder = builder.clean();
    }
    if options.create {
      builder = builder.create();
    }
    if options.exit_on_error {
      builder = builder.exit_on_error();
    }
    if let Some(jobs) = options.jobs {
      builder = builder.jobs(jobs.to_string());
    }
    if options.single_transaction {
      builder = builder.single_transaction();
    }
    if options.verbose {
      builder = builder.verbose();
    }
    if let Some(db_name) = &options.db_name {
      builder = builder.dbname(db_name);
    }
    if options.data_only {
      builder = builder.data_only();
    }
    if options.schema_only {
      builder = builder.schema_only();
    }
    if let Some(superuser) = &options.superuser {
      builder = builder.superuser(superuser);
    }
    for table in &options.table {
      builder = builder.table(table);
    }
    for trigger in &options.trigger {
      builder = builder.trigger(trigger);
    }
    if options.no_owner {
      builder = builder.no_owner();
    }
    if options.no_privileges {
      builder = builder.no_privileges();
    }
    if let Some(program_dir) = &options.program_dir {
      builder = builder.program_dir(program_dir);
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
    command.arg(&options.file);

    Ok(command)
  }

  async fn run_command(&self, command: Command) -> Result<ToolResult> {
    let output = TokioCommand::from(command).output().await?;
    ToolResult::from_output(output, false)
  }

  /**
   * Executes the pg_restore command with the configured options.
   *
   * This method runs the pg_restore utility and restores a database from an archive.
   *
   * @returns {Promise<ToolResult>} A promise that resolves with the result of the command,
   * including exit code, stdout, and stderr.
   * @throws {Error} If the command fails to execute or if there are configuration issues.
   *
   * @example
   * ```typescript
   * const restoreTool = new PgRestoreTool({
   *   connection: {
   *     host: 'localhost',
   *     port: 5432,
   *     username: 'postgres',
   *     database: 'restored_db'
   *   },
   *   programDir: '/home/postgresql/17.5.0/bin',
   *   file: './backup.sql',
   *   clean: true,
   *   create: true
   * });
   *
   * const result = await restoreTool.execute();
   * if (result.exitCode === 0) {
   *   console.log('Database restored successfully.');
   * } else {
   *   console.error('Restore failed:', result.stderr);
   * }
   * ```
   */
  #[napi]
  pub async fn execute(&self) -> Result<ToolResult> {
    let command = self.to_command()?;
    self.run_command(command).await
  }
}
