use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_isready::PgIsReadyBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Configuration for pg_isready-specific options, separate from connection settings.
///
/// This contains only the pg_isready tool-specific configuration options,
/// allowing for clean separation when used with PostgresInstance.
pub struct PgIsReadyConfig {
  /// Generic tool options like silent mode and timeout.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// The number of seconds to wait for a connection.
  pub timeout: Option<u32>,
  /// If `true`, suppresses status messages.
  pub silent: Option<bool>,
  /// The specific database name to check (overrides connection database).
  pub dbname: Option<String>,
}

/// Complete options for configuring the `pg_isready` tool.
///
/// The `connection` and `programDir` fields are required for proper operation.
/// For use with PostgresInstance, consider using PgIsReadyConfig instead.
///
/// @example
/// ```typescript
/// const options = {
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///     database: 'mydb'
///   },
///   programDir: '/home/postgresql/17.5.0/bin',
///   config: {
///     timeout: 10,
///     silent: false
///   }
/// };
/// ```
#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
pub struct PgIsReadyOptions {
  /// Connection settings for the PostgreSQL server (required).
  pub connection: ConnectionConfig,
  /// The directory where the `pg_isready` executable is located (required).
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Pg_isready-specific configuration options.
  pub config: PgIsReadyConfig,
}

/// A tool for checking the connection status of a PostgreSQL server.
///
/// This class provides a TypeScript interface for checking PostgreSQL server availability
/// using the pg_isready utility. Both `connection` and `programDir` parameters are required.
///
/// @example Basic connection check
/// ```typescript
/// import { PgIsReadyTool } from 'pg-embedded';
///
/// const readyTool = new PgIsReadyTool({
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
/// const isReady = await readyTool.check();
/// console.log('Server is ready:', isReady);
/// ```
///
/// @example Detailed status check
/// ```typescript
/// const result = await readyTool.execute();
/// if (result.exitCode === 0) {
///   console.log('Server is accepting connections');
/// } else {
///   console.log('Server is not ready:', result.stderr);
/// }
/// ```
#[napi]
pub struct PgIsReadyTool {
  options: PgIsReadyOptions,
}

#[napi]
impl PgIsReadyTool {
  /// Creates a new `PgIsReadyTool` instance with complete options.
  ///
  /// @param options - Configuration options for the pg_isready operation (connection and programDir are required)
  /// @returns A new PgIsReadyTool instance ready to check server status
  ///
  /// @example
  /// ```typescript
  /// const readyTool = new PgIsReadyTool({
  ///   connection: {
  ///     host: 'localhost',
  ///     port: 5432,
  ///     username: 'postgres',
  ///     password: 'password',
  ///     database: 'mydb'
  ///   },
  ///   programDir: '/home/postgresql/17.5.0/bin',
  ///   config: {
  ///     timeout: 10,
  ///     silent: false
  ///   }
  /// });
  /// ```
  #[napi(constructor)]
  pub fn new(options: PgIsReadyOptions) -> Self {
    Self { options }
  }

  #[napi(factory)]
  /// Creates a PgIsReadyTool from connection info and isready-specific config.
  ///
  /// This is the preferred method when using with PostgresInstance,
  /// as it separates connection concerns from tool-specific configuration.
  ///
  /// @param connection - Database connection configuration
  /// @param program_dir - Directory containing the pg_isready executable
  /// @param config - Pg_isready-specific configuration options
  /// @returns A new PgIsReadyTool instance
  ///
  /// @example
  /// ```typescript
  /// const readyTool = PgIsReadyTool.fromConnection(
  ///   instance.connectionInfo,
  ///   instance.programDir + '/bin',
  ///   {
  ///     timeout: 30,
  ///     silent: true
  ///   }
  /// );
  /// ```
  pub fn from_connection(
    connection: ConnectionConfig,
    program_dir: String,
    config: PgIsReadyConfig,
  ) -> Self {
    let options = PgIsReadyOptions {
      connection,
      program_dir,
      config,
    };
    Self { options }
  }

  /// Performs a quick check to see if the server is running.
  #[napi]
  pub async fn check(&self) -> Result<bool> {
    let command = self.to_command()?;
    let output = TokioCommand::from(command).output().await?;
    Ok(output.status.success())
  }

  /// Executes `pg_isready` and returns the detailed result.
  #[napi]
  pub async fn execute(&self) -> Result<ToolResult> {
    let command = self.to_command()?;
    let output = TokioCommand::from(command)
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .output()
      .await?;
    ToolResult::from_output(output, self.options.config.silent.unwrap_or(false))
  }

  fn to_command(&self) -> Result<Command> {
    let mut builder = PgIsReadyBuilder::new();
    let config = &self.options.config;

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
    if let Some(timeout) = config.timeout {
      builder = builder.timeout(timeout as u16);
    }
    if let Some(true) = config.silent {
      builder = builder.quiet();
    }
    if let Some(dbname) = &config.dbname {
      builder = builder.dbname(dbname);
    } else if let Some(dbname) = &connection.database {
      builder = builder.dbname(dbname);
    }
    Ok(builder.build())
  }
}
