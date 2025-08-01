use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_isready::PgIsReadyBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

/// Options for configuring the `pg_isready` tool.
#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
pub struct PgIsReadyOptions {
  /// Connection settings for the PostgreSQL server.
  pub connection: Option<ConnectionConfig>,
  /// The number of seconds to wait for a connection.
  pub timeout: Option<u32>,
  /// If `true`, suppresses status messages.
  pub silent: Option<bool>,
  /// The specific database name to check.
  pub dbname: Option<String>,
  /// The directory where the `pg_isready` executable is located.
  #[napi(js_name = "programDir")]
  pub program_dir: Option<String>,
}

/// A tool for checking the connection status of a PostgreSQL server.
#[napi]
pub struct PgIsReadyTool {
  options: PgIsReadyOptions,
}

#[napi]
impl PgIsReadyTool {
  /// Creates a new `PgIsReadyTool` instance.
  #[napi(constructor)]
  pub fn new(options: PgIsReadyOptions) -> Self {
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
    ToolResult::from_output(output, self.options.silent.unwrap_or(false))
  }

  fn to_command(&self) -> Result<Command> {
    let mut builder = PgIsReadyBuilder::new();
    if let Some(program_dir) = &self.options.program_dir {
      builder = builder.program_dir(program_dir);
    }
    if let Some(connection) = &self.options.connection {
      if let Some(host) = &connection.host {
        builder = builder.host(host);
      }
      if let Some(port) = connection.port {
        builder = builder.port(port);
      }
      if let Some(user) = &connection.username {
        builder = builder.username(user);
      }
    }
    if let Some(timeout) = self.options.timeout {
      builder = builder.timeout(timeout as u16);
    }
    if let Some(true) = self.options.silent {
      builder = builder.quiet();
    }
    if let Some(dbname) = &self.options.dbname {
      builder = builder.dbname(dbname);
    }
    Ok(builder.build())
  }
}
