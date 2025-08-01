use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_dump::PgDumpBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Configuration options for the PostgreSQL pg_dump tool.
///
/// This interface defines all available options for creating database backups using pg_dump.
/// The `connection` and `programDir` fields are required, while other fields are optional
/// and will use pg_dump's default values if not specified.
///
/// @example
/// ```typescript
/// import { PgDumpTool } from 'pg-embedded';
///
/// const dumpTool = new PgDumpTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///     database: 'mydb'
///   },
///   programDir: '/home/postgresql/17.5.0/bin',
///   file: './backup.sql',
///   create: true,
///   clean: true
/// });
///
/// const result = await dumpTool.execute();
/// console.log('Backup completed:', result.exitCode === 0);
/// ```
pub struct PgDumpOptions {
  /// Database connection configuration (required).
  /// Specifies how to connect to the PostgreSQL server.
  #[serde(flatten)]
  pub connection: ConnectionConfig,
  /// Generic tool options such as silent mode for suppressing output.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// Directory path where the pg_dump executable is located (required).
  /// This should point to the directory containing the pg_dump binary.
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Export only table data, excluding schema definitions.
  /// Equivalent to pg_dump --data-only flag.
  pub data_only: Option<bool>,
  /// Include DROP statements before CREATE statements in the output.
  /// Useful for recreating objects cleanly. Equivalent to pg_dump --clean flag.
  pub clean: Option<bool>,
  /// Include CREATE DATABASE statement in the dump output.
  /// Equivalent to pg_dump --create flag.
  pub create: Option<bool>,
  /// Export only the specified extension and its dependencies.
  /// Equivalent to pg_dump --extension flag.
  pub extension: Option<String>,
  /// Character encoding for the dump output (e.g., 'UTF8', 'LATIN1').
  /// Equivalent to pg_dump --encoding flag.
  pub encoding: Option<String>,
  /// Output file path. If not specified, output goes to stdout.
  /// Equivalent to pg_dump --file flag.
  pub file: Option<String>,
  /// Output format: 'p' (plain text), 'c' (custom), 'd' (directory), 't' (tar).
  /// Default is 'p' (plain text). Equivalent to pg_dump --format flag.
  pub format: Option<String>,
  /// Number of parallel worker processes for dumping (custom format only).
  /// Equivalent to pg_dump --jobs flag.
  pub jobs: Option<i32>,
  /// Export only objects in the specified schema.
  /// Equivalent to pg_dump --schema flag.
  pub schema: Option<String>,
  /// Exclude the specified schema from the dump.
  /// Equivalent to pg_dump --exclude-schema flag.
  pub exclude_schema: Option<String>,
  /// Do not output commands to set ownership of objects.
  /// Equivalent to pg_dump --no-owner flag.
  pub no_owner: Option<bool>,
  /// Export only schema definitions, excluding table data.
  /// Equivalent to pg_dump --schema-only flag.
  pub schema_only: Option<bool>,
  /// Superuser name to use for disabling triggers during data-only dumps.
  /// Equivalent to pg_dump --superuser flag.
  pub superuser: Option<String>,
  /// Export only the specified table and its dependencies.
  /// Equivalent to pg_dump --table flag.
  pub table: Option<String>,
  /// Exclude the specified table from the dump.
  /// Equivalent to pg_dump --exclude-table flag.
  pub exclude_table: Option<String>,
  /// Enable verbose output showing detailed progress information.
  /// Equivalent to pg_dump --verbose flag.
  pub verbose: Option<bool>,
  /// Do not dump access privileges (GRANT/REVOKE commands).
  /// Equivalent to pg_dump --no-privileges flag.
  pub no_privileges: Option<bool>,
  /// Compression level (0-9) for compressed output formats.
  /// Higher values mean better compression but slower processing.
  /// Equivalent to pg_dump --compress flag.
  pub compression: Option<i32>,
  /// Generate output suitable for in-place upgrade utilities.
  /// This is an advanced option rarely used in normal operations.
  /// Equivalent to pg_dump --binary-upgrade flag.
  pub binary_upgrade: Option<bool>,
  /// Output data as INSERT commands with explicit column names.
  /// Slower than COPY but more portable. Equivalent to pg_dump --column-inserts flag.
  pub column_inserts: Option<bool>,
  /// Output data as INSERT commands with attribute names (alias for column_inserts).
  /// Equivalent to pg_dump --attribute-inserts flag.
  pub attribute_inserts: Option<bool>,
  /// Disable dollar quoting for function bodies, use regular SQL quoting instead.
  /// Equivalent to pg_dump --disable-dollar-quoting flag.
  pub disable_dollar_quoting: Option<bool>,
  /// Disable triggers during data restoration to improve performance.
  /// Only applies to data-only dumps. Equivalent to pg_dump --disable-triggers flag.
  pub disable_triggers: Option<bool>,
  /// Enable row-level security policies during the dump.
  /// Equivalent to pg_dump --enable-row-security flag.
  pub enable_row_security: Option<bool>,
  /// Output data as INSERT commands instead of COPY commands.
  /// Slower but more portable. Equivalent to pg_dump --inserts flag.
  pub inserts: Option<bool>,
  /// Do not dump object comments and descriptions.
  /// Equivalent to pg_dump --no-comments flag.
  pub no_comments: Option<bool>,
  /// Do not dump publication definitions (PostgreSQL 10+).
  /// Equivalent to pg_dump --no-publications flag.
  pub no_publications: Option<bool>,
  /// Do not dump security label assignments.
  /// Equivalent to pg_dump --no-security-labels flag.
  pub no_security_labels: Option<bool>,
  /// Do not dump subscription definitions (PostgreSQL 10+).
  /// Equivalent to pg_dump --no-subscriptions flag.
  pub no_subscriptions: Option<bool>,
  /// Do not dump table access method assignments.
  /// Equivalent to pg_dump --no-table-access-method flag.
  pub no_table_access_method: Option<bool>,
  /// Do not dump tablespace assignments.
  /// Equivalent to pg_dump --no-tablespaces flag.
  pub no_tablespaces: Option<bool>,
  /// Do not dump TOAST compression method assignments.
  /// Equivalent to pg_dump --no-toast-compression flag.
  pub no_toast_compression: Option<bool>,
  /// Do not dump data from unlogged tables.
  /// Unlogged tables are not crash-safe and are automatically truncated on server restart.
  /// Equivalent to pg_dump --no-unlogged-table-data flag.
  pub no_unlogged_table_data: Option<bool>,
  /// Add ON CONFLICT DO NOTHING clause to INSERT commands.
  /// Helps avoid errors when restoring to a database with existing data.
  /// Equivalent to pg_dump --on-conflict-do-nothing flag.
  pub on_conflict_do_nothing: Option<bool>,
  /// Quote all database object identifiers, even if not required.
  /// Ensures compatibility across different PostgreSQL versions.
  /// Equivalent to pg_dump --quote-all-identifiers flag.
  pub quote_all_identifiers: Option<bool>,
  /// Number of rows to include in each INSERT command when using --inserts.
  /// Higher values can improve performance but may hit command length limits.
  /// Equivalent to pg_dump --rows-per-insert flag.
  pub rows_per_insert: Option<i32>,
  /// Use a specific snapshot for the dump to ensure consistency.
  /// The snapshot must be exported by another session.
  /// Equivalent to pg_dump --snapshot flag.
  pub snapshot: Option<String>,
  /// Use strict naming conventions for database objects.
  /// Equivalent to pg_dump --strict-names flag.
  pub strict_names: Option<bool>,
  /// Use SET SESSION AUTHORIZATION commands instead of ALTER OWNER commands.
  /// Useful when the dumping user doesn't have ownership privileges.
  /// Equivalent to pg_dump --use-set-session-authorization flag.
  pub use_set_session_authorization: Option<bool>,
}

#[napi]
/// PostgreSQL database backup tool using pg_dump.
///
/// This class provides a TypeScript interface for creating database backups using PostgreSQL's
/// pg_dump utility. It supports all major pg_dump options and can output to files or return
/// the dump as a string.
///
/// Both `connection` and `programDir` parameters are required for proper operation.
///
/// @example Basic usage
/// ```typescript
/// import { PgDumpTool } from 'pg-embedded';
///
/// const dumpTool = new PgDumpTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///     database: 'mydb'
///   },
///   programDir: '/home/postgresql/17.5.0/bin'
/// });
///
/// const result = await dumpTool.execute();
/// if (result.exitCode === 0) {
///   console.log('Database dump:', result.stdout);
/// }
/// ```
///
/// @example Dump to file
/// ```typescript
/// const dumpTool = new PgDumpTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///     database: 'mydb'
///   },
///   programDir: '/home/postgresql/17.5.0/bin',
///   file: './backup.sql',
///   create: true,
///   clean: true
/// });
///
/// await dumpTool.execute();
/// ```
///
/// @example Schema-only dump
/// ```typescript
/// const dumpTool = new PgDumpTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///     database: 'mydb'
///   },
///   programDir: '/home/postgresql/17.5.0/bin',
///   schemaOnly: true,
///   noOwner: true,
///   noPrivileges: true
/// });
/// ```
pub struct PgDumpTool {
  options: PgDumpOptions,
}

#[napi]
impl PgDumpTool {
  #[napi(constructor)]
  /// Creates a new PgDumpTool instance with the specified configuration.
  ///
  /// @param options - Configuration options for the pg_dump operation (connection and programDir are required)
  /// @returns A new PgDumpTool instance ready to execute dumps
  ///
  /// @example
  /// ```typescript
  /// const dumpTool = new PgDumpTool({
  ///   connection: {
  ///     host: 'localhost',
  ///     port: 5432,
  ///     username: 'postgres',
  ///     password: 'password',
  ///     database: 'mydb'
  ///   },
  ///   programDir: '/home/postgresql/17.5.0/bin'
  /// });
  /// ```
  pub fn new(options: PgDumpOptions) -> Self {
    Self { options }
  }

  /// Builds a pg_dump command with all configured options.
  /// This internal method translates the TypeScript options into command-line arguments.
  fn to_command(&self, force_stdout: bool) -> Result<Command> {
    let mut builder = PgDumpBuilder::new();

    // Set required program directory
    builder = builder.program_dir(&self.options.program_dir);

    // Set required connection parameters
    let connection = &self.options.connection;
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
    if let Some(dbname) = &connection.database {
      builder = builder.dbname(dbname);
    }

    if let Some(data_only) = self.options.data_only {
      if data_only {
        builder = builder.data_only();
      }
    }
    if let Some(clean) = self.options.clean {
      if clean {
        builder = builder.clean();
      }
    }
    if let Some(create) = self.options.create {
      if create {
        builder = builder.create();
      }
    }
    if let Some(extension) = &self.options.extension {
      builder = builder.extension(extension);
    }
    if let Some(encoding) = &self.options.encoding {
      builder = builder.encoding(encoding);
    }
    if !force_stdout {
      if let Some(file) = &self.options.file {
        builder = builder.file(file);
      }
    }
    if let Some(format) = &self.options.format {
      builder = builder.format(format);
    }
    if let Some(jobs) = &self.options.jobs {
      builder = builder.jobs(jobs.to_string());
    }
    if let Some(schema) = &self.options.schema {
      builder = builder.schema(schema);
    }
    if let Some(exclude_schema) = &self.options.exclude_schema {
      builder = builder.exclude_schema(exclude_schema);
    }
    if let Some(no_owner) = self.options.no_owner {
      if no_owner {
        builder = builder.no_owner();
      }
    }
    if let Some(schema_only) = self.options.schema_only {
      if schema_only {
        builder = builder.schema_only();
      }
    }
    if let Some(superuser) = &self.options.superuser {
      builder = builder.superuser(superuser);
    }
    if let Some(table) = &self.options.table {
      builder = builder.table(table);
    }
    if let Some(exclude_table) = &self.options.exclude_table {
      builder = builder.exclude_table(exclude_table);
    }
    if let Some(verbose) = self.options.verbose {
      if verbose {
        builder = builder.verbose();
      }
    }
    if let Some(no_privileges) = self.options.no_privileges {
      if no_privileges {
        builder = builder.no_privileges();
      }
    }
    if let Some(compression) = self.options.compression {
      builder = builder.compression(compression.to_string());
    }
    if let Some(binary_upgrade) = self.options.binary_upgrade {
      if binary_upgrade {
        builder = builder.binary_upgrade();
      }
    }
    if let Some(column_inserts) = self.options.column_inserts {
      if column_inserts {
        builder = builder.column_inserts();
      }
    }
    if let Some(attribute_inserts) = self.options.attribute_inserts {
      if attribute_inserts {
        builder = builder.attribute_inserts();
      }
    }
    if let Some(disable_dollar_quoting) = self.options.disable_dollar_quoting {
      if disable_dollar_quoting {
        builder = builder.disable_dollar_quoting();
      }
    }
    if let Some(disable_triggers) = self.options.disable_triggers {
      if disable_triggers {
        builder = builder.disable_triggers();
      }
    }
    if let Some(enable_row_security) = self.options.enable_row_security {
      if enable_row_security {
        builder = builder.enable_row_security();
      }
    }
    if let Some(inserts) = self.options.inserts {
      if inserts {
        builder = builder.inserts();
      }
    }
    if let Some(no_comments) = self.options.no_comments {
      if no_comments {
        builder = builder.no_comments();
      }
    }
    if let Some(no_publications) = self.options.no_publications {
      if no_publications {
        builder = builder.no_publications();
      }
    }
    if let Some(no_security_labels) = self.options.no_security_labels {
      if no_security_labels {
        builder = builder.no_security_labels();
      }
    }
    if let Some(no_subscriptions) = self.options.no_subscriptions {
      if no_subscriptions {
        builder = builder.no_subscriptions();
      }
    }
    if let Some(no_table_access_method) = self.options.no_table_access_method {
      if no_table_access_method {
        builder = builder.no_table_access_method();
      }
    }
    if let Some(no_tablespaces) = self.options.no_tablespaces {
      if no_tablespaces {
        builder = builder.no_tablespaces();
      }
    }
    if let Some(no_toast_compression) = self.options.no_toast_compression {
      if no_toast_compression {
        builder = builder.no_toast_compression();
      }
    }
    if let Some(no_unlogged_table_data) = self.options.no_unlogged_table_data {
      if no_unlogged_table_data {
        builder = builder.no_unlogged_table_data();
      }
    }
    if let Some(on_conflict_do_nothing) = self.options.on_conflict_do_nothing {
      if on_conflict_do_nothing {
        builder = builder.on_conflict_do_nothing();
      }
    }
    if let Some(quote_all_identifiers) = self.options.quote_all_identifiers {
      if quote_all_identifiers {
        builder = builder.quote_all_identifiers();
      }
    }
    if let Some(rows_per_insert) = self.options.rows_per_insert {
      builder = builder.rows_per_insert(rows_per_insert as u64);
    }
    if let Some(snapshot) = &self.options.snapshot {
      builder = builder.snapshot(snapshot);
    }
    if let Some(strict_names) = self.options.strict_names {
      if strict_names {
        builder = builder.strict_names();
      }
    }
    if let Some(use_set_session_authorization) = self.options.use_set_session_authorization {
      if use_set_session_authorization {
        builder = builder.use_set_session_authorization();
      }
    }

    let command = builder.build();
    Ok(command)
  }

  /// Executes the pg_dump command asynchronously and captures output.
  /// This internal method handles the actual command execution and result processing.
  async fn run_command(&self, command: Command) -> Result<ToolResult> {
    let output = TokioCommand::from(command)
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .output()
      .await?;
    ToolResult::from_output(
      output,
      self
        .options
        .tool
        .as_ref()
        .and_then(|t| t.silent)
        .unwrap_or(false),
    )
  }

  #[napi(js_name = "executeToString")]
  /// Executes the pg_dump command and returns the backup content as a string.
  ///
  /// This method forces the output to stdout, ignoring the `file` option if it was set.
  /// It is a convenient way to get the dump content directly into a variable.
  ///
  /// @returns Promise<ToolResult> containing exit code, stdout (the dump content), and stderr.
  /// @throws Error if the command fails to execute or if there are configuration issues.
  ///
  /// @example
  /// ```typescript
  /// const dumpTool = new PgDumpTool({
  ///   connection: { host: 'localhost', port: 5432, user: 'postgres' },
  ///   programDir: '/home/postgresql/17.5.0/bin',
  /// });
  /// const result = await dumpTool.executeToString();
  /// if (result.exitCode === 0) {
  ///   console.log('Dump successful. SQL content:', result.stdout);
  /// } else {
  ///   console.error('Dump failed:', result.stderr);
  /// }
  /// ```
  pub async fn execute_to_string(&self) -> Result<ToolResult> {
    let command = self.to_command(true)?;
    self.run_command(command).await
  }

  #[napi]
  /// Executes the pg_dump command with the configured options.
  ///
  /// This method runs the pg_dump utility and returns the result. The behavior depends on
  /// whether a file output path was specified:
  /// - If `file` option is set: writes dump to the specified file, stdout will be empty
  /// - If `file` option is not set: returns dump content in the stdout field
  ///
  /// @returns Promise<ToolResult> containing exit code, stdout, and stderr
  /// @throws Error if the command fails to execute or if there are configuration issues
  ///
  /// @example Dump to string
  /// ```typescript
  /// const result = await dumpTool.execute();
  /// if (result.exitCode === 0) {
  ///   console.log('Dump successful');
  ///   console.log('SQL content:', result.stdout);
  /// } else {
  ///   console.error('Dump failed:', result.stderr);
  /// }
  /// ```
  ///
  /// @example Dump to file
  /// ```typescript
  /// const dumpTool = new PgDumpTool({
  ///   connection: {
  ///     host: 'localhost',
  ///     port: 5432,
  ///     username: 'postgres',
  ///     password: 'password',
  ///     database: 'mydb'
  ///   },
  ///   programDir: '/home/postgresql/17.5.0/bin',
  ///   file: './backup.sql'
  /// });
  ///
  /// const result = await dumpTool.execute();
  /// if (result.exitCode === 0) {
  ///   console.log('Backup saved to ./backup.sql');
  /// }
  /// ```
  pub async fn execute(&self) -> Result<ToolResult> {
    let command = self.to_command(false)?;
    self.run_command(command).await
  }
}
