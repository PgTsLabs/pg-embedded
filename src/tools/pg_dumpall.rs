use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_dumpall::PgDumpAllBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Options for configuring the `pg_dumpall` command.
///
/// This interface corresponds to the command-line arguments of the `pg_dumpall` utility.
///
/// @example
/// ```typescript
/// const dumpallOptions: PgDumpallOptions = {
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///   },
///   programDir: '/path/to/postgres/bin',
///   file: 'dump.sql',
///   globalsOnly: true,
/// };
/// ```
pub struct PgDumpallOptions {
  /// Database connection parameters.
  #[serde(flatten)]
  pub connection: ConnectionConfig,
  /// General tool options.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// The directory containing the `pg_dumpall` executable.
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Specifies the output file for the dump. If not provided, the output is sent to standard output.
  /// Corresponds to the `--file` command-line argument.
  pub file: Option<String>,
  /// Dump only global objects (roles and tablespaces), not databases.
  /// Corresponds to the `--globals-only` command-line argument.
  pub globals_only: Option<bool>,
  /// Dump only roles.
  /// Corresponds to the `--roles-only` command-line argument.
  pub roles_only: Option<bool>,
  /// Dump only tablespaces.
  /// Corresponds to the `--tablespaces-only` command-line argument.
  pub tablespaces_only: Option<bool>,
  /// Enable verbose mode.
  /// Corresponds to the `--verbose` command-line argument.
  pub verbose: Option<bool>,
  /// Output commands to `DROP` objects before recreating them.
  /// Corresponds to the `--clean` command-line argument.
  pub clean: Option<bool>,
  /// Do not output commands to set object ownership.
  /// Corresponds to the `--no-owner` command-line argument.
  pub no_owner: Option<bool>,
  /// Do not dump privileges (GRANT/REVOKE commands).
  /// Corresponds to the `--no-privileges` command-line argument.
  pub no_privileges: Option<bool>,
}

#[napi]
/// A tool for creating a dump of all databases in a PostgreSQL cluster.
///
/// This class provides an interface to the `pg_dumpall` command-line utility.
///
/// @example
/// ```typescript
/// import { PgDumpallTool } from 'pg-embedded';
///
/// const dumpall = new PgDumpallTool({
///   connection: {
///     host: 'localhost',
///     port: 5432,
///     username: 'postgres',
///     password: 'password',
///   },
///   programDir: '/path/to/postgres/bin',
///   file: 'fulldump.sql',
/// });
///
/// const result = await dumpall.execute();
/// if (result.exitCode === 0) {
///   console.log('Dump completed successfully.');
/// } else {
///   console.error(`Dump failed with error: ${result.stderr}`);
/// }
/// ```
pub struct PgDumpallTool {
  options: PgDumpallOptions,
}

#[napi]
impl PgDumpallTool {
  /// Creates a new `PgDumpallTool` instance.
  /// @param options - The configuration options for `pg_dumpall`.
  #[napi(constructor)]
  pub fn new(options: PgDumpallOptions) -> Self {
    Self { options }
  }

  #[napi(js_name = "executeToString")]
  /// Executes the `pg_dumpall` command and returns the output as a string.
  ///
  /// This method is useful for capturing the dump output directly, for example,
  /// to process it in memory or send it over a network stream.
  ///
  /// @returns A promise that resolves with the result of the command execution.
  /// The dump content will be available in the `stdout` property of the result.
  pub async fn execute_to_string(&self) -> Result<ToolResult> {
    let command = to_command(&self.options, true)?;
    run_command(command, &self.options).await
  }

  #[napi]
  /// Executes the `pg_dumpall` command.
  ///
  /// If the `file` option is specified in the constructor, the dump will be written to that file.
  /// Otherwise, the dump output will be available in the `stdout` property of the returned result.
  ///
  /// @returns A promise that resolves with the result of the command execution.
  pub async fn execute(&self) -> Result<ToolResult> {
    let command = to_command(&self.options, false)?;
    run_command(command, &self.options).await
  }
}

fn to_command(options: &PgDumpallOptions, force_stdout: bool) -> Result<Command> {
    let mut builder = PgDumpAllBuilder::new();

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

    if !force_stdout {
        if let Some(file) = &options.file {
            builder = builder.file(file);
        }
    }
    if let Some(globals_only) = options.globals_only {
        if globals_only {
            builder = builder.globals_only();
        }
    }
    if let Some(roles_only) = options.roles_only {
        if roles_only {
            builder = builder.roles_only();
        }
    }
    if let Some(tablespaces_only) = options.tablespaces_only {
        if tablespaces_only {
            builder = builder.tablespaces_only();
        }
    }
    if let Some(verbose) = options.verbose {
        if verbose {
            builder = builder.verbose();
        }
    }
    if let Some(clean) = options.clean {
        if clean {
            builder = builder.clean();
        }
    }
    if let Some(no_owner) = options.no_owner {
        if no_owner {
            builder = builder.no_owner();
        }
    }
    if let Some(no_privileges) = options.no_privileges {
        if no_privileges {
            builder = builder.no_privileges();
        }
    }

    let command = builder.build();
    Ok(command)
}

async fn run_command(command: Command, options: &PgDumpallOptions) -> Result<ToolResult> {
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
