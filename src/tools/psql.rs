use crate::error::{PgEmbedError, Result};
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::psql::PsqlBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;

use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Options for configuring the `psql` tool, primarily for connection settings.
///
/// The `connection` and `programDir` fields are required for proper operation.
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
///   variables: ['MY_VAR=some_value', 'COUNT=42'],
///   flags: ['--csv', '--single-transaction', '--tuples-only'],
/// };
/// ```
pub struct PsqlOptions {
  /// Connection settings for the PostgreSQL server (required).
  #[serde(flatten)]
  pub connection: ConnectionConfig,
  /// Generic tool options like silent mode.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,

  /// Variables to set for the psql session in KEY=VALUE format.
  /// For example, `['MY_VAR=hello', 'COUNT=42']`.
  /// Each string should be in the format 'NAME=VALUE'.
  pub variables: Option<Vec<String>>,
  /// A list of boolean flags to pass to `psql`.
  /// For example, `['--csv', '--tuples-only']`.
  pub flags: Option<Vec<String>>,
  /// The directory where the psql executable is located (required).
  #[napi(js_name = "programDir")]
  pub program_dir: String,
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
///   programDir: '/home/postgresql/17.5.0/bin'
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
  /// Creates a new instance of the `PsqlTool`.
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
  ///   programDir: '/home/postgresql/17.5.0/bin'
  /// });
  /// ```
  pub fn new(options: PsqlOptions) -> Self {
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

    // Handle variables - take the first one due to library limitation
    if let Some(variables) = &self.options.variables {
      if let Some(var_str) = variables.first() {
        if let Some((name, value)) = var_str.split_once('=') {
          builder = builder.variable((name, value));
        }
      }
    }

    if let Some(flags) = &self.options.flags {
      for flag in flags {
        match flag.as_str() {
          "--csv" => builder = builder.csv(),
          "--single-transaction" => builder = builder.single_transaction(),
          "--tuples-only" => builder = builder.tuples_only(),
          "--echo-all" => builder = builder.echo_all(),
          "--echo-errors" => builder = builder.echo_errors(),
          "--echo-queries" => builder = builder.echo_queries(),
          "--no-align" => builder = builder.no_align(),
          "--quiet" => builder = builder.quiet(),
          _ => (), // Silently ignore unsupported flags
        }
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
