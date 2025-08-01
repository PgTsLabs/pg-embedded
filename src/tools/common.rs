use crate::types::ConnectionInfo;
use napi_derive::napi;
use serde::Deserialize;
use std::{fmt::Display, process::Output};

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Configuration for connecting to a PostgreSQL server.
pub struct ConnectionConfig {
  /// The host of the PostgreSQL server.
  pub host: Option<String>,
  /// The port of the PostgreSQL server.
  pub port: Option<u16>,
  /// The username to connect with.
  pub username: Option<String>,
  /// The password to connect with.
  pub password: Option<String>,
  /// The database to connect to.
  pub database: Option<String>,
}

impl From<ConnectionInfo> for ConnectionConfig {
  fn from(info: ConnectionInfo) -> Self {
    Self {
      host: Some(info.host),
      port: Some(info.port),
      username: Some(info.username),
      password: Some(info.password),
      database: Some(info.database_name),
    }
  }
}

impl Display for ConnectionConfig {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let mut conn_str = String::new();
    if let Some(host) = &self.host {
      conn_str.push_str(&format!("host={host} ",));
    }
    if let Some(port) = self.port {
      conn_str.push_str(&format!("port={port} ",));
    }
    if let Some(username) = &self.username {
      conn_str.push_str(&format!("user={username} ",));
    }
    if let Some(password) = &self.password {
      conn_str.push_str(&format!("password={password} "));
    }
    if let Some(database) = &self.database {
      conn_str.push_str(&format!("dbname={database} "));
    }
    write!(f, "{}", conn_str.trim())
  }
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Generic options for a tool execution.
///
/// These are common options that apply to all PostgreSQL tools,
/// separate from connection-specific settings.
pub struct ToolOptions {
  /// Timeout for the tool execution in seconds.
  pub timeout: Option<u32>,
  /// If true, suppresses tool output.
  pub silent: Option<bool>,
}

#[napi(object)]
#[derive(Debug)]
/// The result of a tool execution.
pub struct ToolResult {
  /// The exit code of the tool.
  pub exit_code: i32,
  /// The standard output of the tool.
  pub stdout: String,
  /// The standard error of the tool.
  pub stderr: String,
}

impl ToolResult {
  pub fn from_output(output: Output, _silent: bool) -> crate::error::Result<Self> {
    let exit_code = output.status.code().unwrap_or(1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(Self {
      exit_code,
      stdout,
      stderr,
    })
  }
}
