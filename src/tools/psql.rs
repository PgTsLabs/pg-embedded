use crate::error::{PgEmbedError, Result};
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::psql::PsqlBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;

use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Configuration for psql-specific options, separate from connection settings.
///
/// This contains only the psql tool-specific configuration options,
/// allowing for clean separation when used with PostgresInstance.
pub struct PsqlConfig {
  /// Generic tool options like silent mode and timeout.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,

  // Command execution options
  /// Run only single command (SQL or internal) and exit.
  /// Equivalent to psql --command flag.
  pub command: Option<String>,
  /// Execute commands from file, then exit.
  /// Equivalent to psql --file flag.
  pub file: Option<String>,
  /// List available databases, then exit.
  /// Equivalent to psql --list flag.
  pub list: Option<bool>,
  /// Set psql variable NAME to VALUE (e.g., ON_ERROR_STOP=1).
  /// Equivalent to psql --variable flag.
  pub variable: Option<(String, String)>,
  /// Output version information, then exit.
  /// Equivalent to psql --version flag.
  pub version: Option<bool>,
  /// Do not read startup file (~/.psqlrc).
  /// Equivalent to psql --no-psqlrc flag.
  #[napi(js_name = "noPsqlrc")]
  pub no_psqlrc: Option<bool>,
  /// Execute as a single transaction (if non-interactive).
  /// Equivalent to psql --single-transaction flag.
  #[napi(js_name = "singleTransaction")]
  pub single_transaction: Option<bool>,
  /// Show help, then exit. Possible values: options, commands, variables.
  /// Equivalent to psql --help flag.
  pub help: Option<String>,

  // Echo options
  /// Echo all input from script.
  /// Equivalent to psql --echo-all flag.
  #[napi(js_name = "echoAll")]
  pub echo_all: Option<bool>,
  /// Echo failed commands.
  /// Equivalent to psql --echo-errors flag.
  #[napi(js_name = "echoErrors")]
  pub echo_errors: Option<bool>,
  /// Echo commands sent to server.
  /// Equivalent to psql --echo-queries flag.
  #[napi(js_name = "echoQueries")]
  pub echo_queries: Option<bool>,
  /// Display queries that internal commands generate.
  /// Equivalent to psql --echo-hidden flag.
  #[napi(js_name = "echoHidden")]
  pub echo_hidden: Option<bool>,

  // Output and logging options
  /// Send session log to file.
  /// Equivalent to psql --log-file flag.
  #[napi(js_name = "logFile")]
  pub log_file: Option<String>,
  /// Disable enhanced command line editing (readline).
  /// Equivalent to psql --no-readline flag.
  #[napi(js_name = "noReadline")]
  pub no_readline: Option<bool>,
  /// Send query results to file (or |pipe).
  /// Equivalent to psql --output flag.
  pub output: Option<String>,
  /// Run quietly (no messages, only query output).
  /// Equivalent to psql --quiet flag.
  pub quiet: Option<bool>,
  /// Single-step mode (confirm each query).
  /// Equivalent to psql --single-step flag.
  #[napi(js_name = "singleStep")]
  pub single_step: Option<bool>,
  /// Single-line mode (end of line terminates SQL command).
  /// Equivalent to psql --single-line flag.
  #[napi(js_name = "singleLine")]
  pub single_line: Option<bool>,

  // Output formatting options
  /// Unaligned table output mode.
  /// Equivalent to psql --no-align flag.
  #[napi(js_name = "noAlign")]
  pub no_align: Option<bool>,
  /// CSV table output mode.
  /// Equivalent to psql --csv flag.
  pub csv: Option<bool>,
  /// Field separator for unaligned output (default "|").
  /// Equivalent to psql --field-separator flag.
  #[napi(js_name = "fieldSeparator")]
  pub field_separator: Option<String>,
  /// HTML table output mode.
  /// Equivalent to psql --html flag.
  pub html: Option<bool>,
  /// Set printing option VAR to ARG (see \pset command).
  /// Equivalent to psql --pset flag.
  pub pset: Option<(String, String)>,
  /// Record separator for unaligned output (default newline).
  /// Equivalent to psql --record-separator flag.
  #[napi(js_name = "recordSeparator")]
  pub record_separator: Option<String>,
  /// Print rows only (no headers, footers).
  /// Equivalent to psql --tuples-only flag.
  #[napi(js_name = "tuplesOnly")]
  pub tuples_only: Option<bool>,
  /// HTML table tag attributes (e.g., width, border).
  /// Equivalent to psql --table-attr flag.
  #[napi(js_name = "tableAttr")]
  pub table_attr: Option<String>,
  /// Turn on expanded table output mode.
  /// Equivalent to psql --expanded flag.
  pub expanded: Option<bool>,
  /// Set field separator for unaligned output to zero byte.
  /// Equivalent to psql --field-separator-zero flag.
  #[napi(js_name = "fieldSeparatorZero")]
  pub field_separator_zero: Option<bool>,
  /// Set record separator for unaligned output to zero byte.
  /// Equivalent to psql --record-separator-zero flag.
  #[napi(js_name = "recordSeparatorZero")]
  pub record_separator_zero: Option<bool>,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Complete options for configuring the `psql` tool, including connection settings.
///
/// The `connection` and `programDir` fields are required for proper operation.
/// For use with PostgresInstance, consider using PsqlConfig instead.
///
/// @example
/// ```typescript
/// const options = {
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///     database: 'testdb',
///   },
///   programDir: '/home/postgresql/17.5.0/bin',
///   config: {
///     variable: ['MY_VAR', 'some_value'],
///     csv: true,
///     singleTransaction: true,
///     tuplesOnly: true,
///   }
/// };
/// ```
pub struct PsqlOptions {
  /// Connection settings for the PostgreSQL server (required).
  pub connection: ConnectionConfig,
  /// The directory where the psql executable is located (required).
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Psql-specific configuration options.
  pub config: PsqlConfig,
}

#[napi]
/// A tool for executing SQL commands and scripts using the `psql` interactive terminal.
///
/// This class provides a TypeScript interface for running SQL commands and scripts using
/// PostgreSQL's psql utility. Both `connection` and `programDir` parameters are required.
///
/// @example Basic SQL command execution
/// ```typescript
/// import { PsqlTool } from 'pg-embedded';
///
/// const psqlTool = new PsqlTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///     database: 'mydb'
///   },
///   programDir: '/home/postgresql/17.5.0/bin',
///   config: {}
/// });
///
/// const result = await psqlTool.executeCommand('SELECT * FROM users;');
/// if (result.exitCode === 0) {
///   console.log('Query result:', result.stdout);
/// }
/// ```
///
/// @example Execute SQL file
/// ```typescript
/// const result = await psqlTool.executeFile('./schema.sql');
/// if (result.exitCode === 0) {
///   console.log('Script executed successfully');
/// }
/// ```
pub struct PsqlTool {
  options: PsqlOptions,
}

#[napi]
impl PsqlTool {
  #[napi(constructor)]
  /// Creates a new instance of the `PsqlTool` with complete options.
  ///
  /// @param options - Configuration options for the psql operation (connection and programDir are required)
  /// @returns A new PsqlTool instance ready to execute SQL commands
  ///
  /// @example
  /// ```typescript
  /// const psqlTool = new PsqlTool({
  ///   connection: {
  ///     host: 'localhost',
  ///     port: 5432,
  ///     username: 'postgres',
  ///     password: 'password',
  ///     database: 'mydb'
  ///   },
  ///   programDir: '/home/postgresql/17.5.0/bin',
  ///   config: {
  ///     flags: ['--csv', '--tuples-only']
  ///   }
  /// });
  /// ```
  pub fn new(options: PsqlOptions) -> Self {
    Self { options }
  }

  #[napi(factory)]
  /// Creates a PsqlTool from connection info and psql-specific config.
  ///
  /// This is the preferred method when using with PostgresInstance,
  /// as it separates connection concerns from tool-specific configuration.
  ///
  /// @param connection - Database connection configuration
  /// @param program_dir - Directory containing the psql executable
  /// @param config - Psql-specific configuration options
  /// @returns A new PsqlTool instance
  ///
  /// @example
  /// ```typescript
  /// const psqlTool = PsqlTool.fromConnection(
  ///   instance.connectionInfo,
  ///   instance.programDir + '/bin',
  ///   {
  ///     csv: true,
  ///     tuplesOnly: true,
  ///     variable: ['MY_VAR', 'value']
  ///   }
  /// );
  /// ```
  pub fn from_connection(
    connection: ConnectionConfig,
    program_dir: String,
    config: PsqlConfig,
  ) -> Self {
    let options = PsqlOptions {
      connection,
      program_dir,
      config,
    };
    Self { options }
  }

  /// Prepares a `psql` command with the configured settings.
  fn to_command(&self, command_str: Option<&str>, file_path: Option<&str>) -> Result<Command> {
    let mut builder = PsqlBuilder::new();

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

    // Apply psql-specific options
    let config = &self.options.config;

    if let Some(command) = &config.command {
      builder = builder.command(command);
    }
    if let Some(file) = &config.file {
      builder = builder.file(file);
    }
    if let Some(list) = config.list {
      if list {
        builder = builder.list();
      }
    }
    if let Some((name, value)) = &config.variable {
      builder = builder.variable((name, value));
    }
    if let Some(version) = config.version {
      if version {
        builder = builder.version();
      }
    }
    if let Some(no_psqlrc) = config.no_psqlrc {
      if no_psqlrc {
        builder = builder.no_psqlrc();
      }
    }
    if let Some(single_transaction) = config.single_transaction {
      if single_transaction {
        builder = builder.single_transaction();
      }
    }
    if let Some(help) = &config.help {
      builder = builder.help(help);
    }

    // Echo options
    if let Some(echo_all) = config.echo_all {
      if echo_all {
        builder = builder.echo_all();
      }
    }
    if let Some(echo_errors) = config.echo_errors {
      if echo_errors {
        builder = builder.echo_errors();
      }
    }
    if let Some(echo_queries) = config.echo_queries {
      if echo_queries {
        builder = builder.echo_queries();
      }
    }
    if let Some(echo_hidden) = config.echo_hidden {
      if echo_hidden {
        builder = builder.echo_hidden();
      }
    }

    // Output and logging options
    if let Some(log_file) = &config.log_file {
      builder = builder.log_file(log_file);
    }
    if let Some(no_readline) = config.no_readline {
      if no_readline {
        builder = builder.no_readline();
      }
    }
    if let Some(output) = &config.output {
      builder = builder.output(output);
    }
    if let Some(quiet) = config.quiet {
      if quiet {
        builder = builder.quiet();
      }
    }
    if let Some(single_step) = config.single_step {
      if single_step {
        builder = builder.single_step();
      }
    }
    if let Some(single_line) = config.single_line {
      if single_line {
        builder = builder.single_line();
      }
    }

    // Output formatting options
    if let Some(no_align) = config.no_align {
      if no_align {
        builder = builder.no_align();
      }
    }
    if let Some(csv) = config.csv {
      if csv {
        builder = builder.csv();
      }
    }
    if let Some(field_separator) = &config.field_separator {
      builder = builder.field_separator(field_separator);
    }
    if let Some(html) = config.html {
      if html {
        builder = builder.html();
      }
    }
    if let Some((var, arg)) = &config.pset {
      builder = builder.pset((var, arg));
    }
    if let Some(record_separator) = &config.record_separator {
      builder = builder.record_separator(record_separator);
    }
    if let Some(tuples_only) = config.tuples_only {
      if tuples_only {
        builder = builder.tuples_only();
      }
    }
    if let Some(table_attr) = &config.table_attr {
      builder = builder.table_attr(table_attr);
    }
    if let Some(expanded) = config.expanded {
      if expanded {
        builder = builder.expanded();
      }
    }
    if let Some(field_separator_zero) = config.field_separator_zero {
      if field_separator_zero {
        builder = builder.field_separator_zero();
      }
    }
    if let Some(record_separator_zero) = config.record_separator_zero {
      if record_separator_zero {
        builder = builder.record_separator_zero();
      }
    }

    if let Some(command) = command_str {
      builder = builder.command(command);
    } else if let Some(file) = file_path {
      builder = builder.file(file);
    } else {
      return Err(PgEmbedError::ConfigurationError(
        "Either a command or a file must be provided for execution.".to_string(),
      ));
    }

    Ok(builder.build())
  }

  /// Asynchronously runs a prepared command.
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
        .config
        .tool
        .as_ref()
        .and_then(|t| t.silent)
        .unwrap_or(false),
    )
  }

  #[napi]
  /// Executes a given SQL command string.
  ///
  /// This method allows reusing a `PsqlTool` instance with the same connection settings
  /// to run multiple different commands.
  ///
  /// @param command_str - The SQL command string to execute.
  /// @returns A promise that resolves to a `ToolResult` object.
  /// @throws An error if the `psql` command fails to execute.
  ///
  /// @example
  /// ```typescript
  /// const result = await psql.executeCommand('SELECT version();');
  /// console.log(result.stdout);
  /// ```
  pub async fn execute_command(&self, command_str: String) -> Result<ToolResult> {
    let command = self.to_command(Some(&command_str), None)?;
    self.run_command(command).await
  }

  #[napi]
  /// Executes SQL commands from a given file.
  ///
  /// This method allows reusing a `PsqlTool` instance to run multiple different SQL script files.
  ///
  /// @param file_path - The path to the file containing SQL commands.
  /// @returns A promise that resolves to a `ToolResult` object.
  /// @throws An error if the `psql` command fails to execute.
  ///
  /// @example
  /// ```typescript
  /// const result = await psql.executeFile('/path/to/my/script.sql');
  /// console.log(result.stdout);
  /// ```
  pub async fn execute_file(&self, file_path: String) -> Result<ToolResult> {
    let command = self.to_command(None, Some(&file_path))?;
    self.run_command(command).await
  }
}
