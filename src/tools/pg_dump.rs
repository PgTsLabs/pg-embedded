use crate::error::Result;
use crate::tools::common::{ConnectionConfig, ToolOptions, ToolResult};
use napi_derive::napi;
use postgresql_commands::pg_dump::PgDumpBuilder;
use postgresql_commands::traits::CommandBuilder;
use serde::Deserialize;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[napi]
#[derive(Clone, Debug, Deserialize)]
/// PostgreSQL dump output format options.
///
/// Each format has different characteristics and use cases:
/// - **Plain**: Human-readable SQL text format (.sql files)
/// - **Custom**: Compressed binary format (.dump/.backup files) - recommended for backups
/// - **Directory**: Multiple files in a directory - allows parallel processing
/// - **Tar**: Tar archive format (.tar files)
pub enum PgDumpFormat {
  /// Plain text SQL format (default).
  /// Creates human-readable SQL files that can be executed with psql.
  /// File extension: .sql
  Plain,
  /// Custom compressed binary format.
  /// Most flexible and efficient format, supports compression and selective restore.
  /// File extension: .dump or .backup
  Custom,
  /// Directory format with multiple files.
  /// Allows parallel dumping and restoring for large databases.
  /// Output: directory containing multiple files
  Directory,
  /// Tar archive format.
  /// Similar to custom format but in tar format.
  /// File extension: .tar
  Tar,
}

impl PgDumpFormat {
  /// Convert enum to pg_dump format string
  pub fn to_pg_dump_format(&self) -> &'static str {
    match self {
      PgDumpFormat::Plain => "p",
      PgDumpFormat::Custom => "c",
      PgDumpFormat::Directory => "d",
      PgDumpFormat::Tar => "t",
    }
  }

  /// Get recommended file extension for the format
  pub fn recommended_extension(&self) -> &'static str {
    match self {
      PgDumpFormat::Plain => ".sql",
      PgDumpFormat::Custom => ".dump",
      PgDumpFormat::Directory => "", // Directory, no extension
      PgDumpFormat::Tar => ".tar",
    }
  }
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
/// Configuration for pg_dump-specific options, separate from connection settings.
///
/// This contains only the pg_dump tool-specific configuration options,
/// allowing for clean separation when used with PostgresInstance.
pub struct PgDumpConfig {
  /// Generic tool options like silent mode and timeout.
  #[serde(flatten)]
  pub tool: Option<ToolOptions>,
  /// Output file path. If not specified, output goes to stdout.
  /// Equivalent to pg_dump --file flag.
  pub file: Option<String>,
  /// Output format for the dump.
  /// Default is Plain (SQL text format). Equivalent to pg_dump --format flag.
  pub format: Option<PgDumpFormat>,
  /// Export only table data, excluding schema definitions.
  /// Equivalent to pg_dump --data-only flag.
  #[napi(js_name = "dataOnly")]
  pub data_only: Option<bool>,
  /// Include DROP statements before CREATE statements in the output.
  /// Useful for recreating objects cleanly. Equivalent to pg_dump --clean flag.
  pub clean: Option<bool>,
  /// Include CREATE DATABASE statement in the dump output.
  /// Equivalent to pg_dump --create flag.
  pub create: Option<bool>,
  /// Export only schema definitions, excluding table data.
  /// Equivalent to pg_dump --schema-only flag.
  #[napi(js_name = "schemaOnly")]
  pub schema_only: Option<bool>,
  /// Do not output commands to set ownership of objects.
  /// Equivalent to pg_dump --no-owner flag.
  #[napi(js_name = "noOwner")]
  pub no_owner: Option<bool>,
  /// Do not dump access privileges (GRANT/REVOKE commands).
  /// Equivalent to pg_dump --no-privileges flag.
  #[napi(js_name = "noPrivileges")]
  pub no_privileges: Option<bool>,
  /// Enable verbose output showing detailed progress information.
  /// Equivalent to pg_dump --verbose flag.
  pub verbose: Option<bool>,
  /// Export only the specified table and its dependencies.
  /// Equivalent to pg_dump --table flag.
  pub table: Option<String>,
  /// Exclude the specified table from the dump.
  /// Equivalent to pg_dump --exclude-table flag.
  #[napi(js_name = "excludeTable")]
  pub exclude_table: Option<String>,
  /// Export only objects in the specified schema.
  /// Equivalent to pg_dump --schema flag.
  pub schema: Option<String>,
  /// Exclude the specified schema from the dump.
  /// Equivalent to pg_dump --exclude-schema flag.
  #[napi(js_name = "excludeSchema")]
  pub exclude_schema: Option<String>,
  /// Character encoding for the dump output (e.g., 'UTF8', 'LATIN1').
  /// Equivalent to pg_dump --encoding flag.
  pub encoding: Option<String>,
  /// Number of parallel worker processes for dumping (custom format only).
  /// Equivalent to pg_dump --jobs flag.
  pub jobs: Option<i32>,
  /// Compression level (0-9) for compressed output formats.
  /// Higher values mean better compression but slower processing.
  /// Equivalent to pg_dump --compress flag.
  pub compression: Option<i32>,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize)]
/// Complete options for the PostgreSQL pg_dump tool.
///
/// This interface defines all available options for creating database backups using pg_dump.
/// For use with PostgresInstance, consider using PgDumpConfig instead.
///
/// @example
/// ```typescript
/// import { PgDumpTool, PgDumpFormat } from 'pg-embedded';
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
///   config: {
///     file: './backup.dump',
///     format: PgDumpFormat.Custom,
///     create: true,
///     clean: true
///   }
/// });
///
/// const result = await dumpTool.execute();
/// console.log('Backup completed:', result.exitCode === 0);
/// ```
pub struct PgDumpOptions {
  /// Database connection configuration (required).
  /// Specifies how to connect to the PostgreSQL server.
  pub connection: ConnectionConfig,
  /// Directory path where the pg_dump executable is located (required).
  /// This should point to the directory containing the pg_dump binary.
  #[napi(js_name = "programDir")]
  pub program_dir: String,
  /// Pg_dump-specific configuration options.
  pub config: PgDumpConfig,
}

#[napi]
/// PostgreSQL database backup tool using pg_dump.
///
/// This class provides a TypeScript interface for creating database backups using PostgreSQL's
/// pg_dump utility. It supports all major pg_dump options and can output to files or return
/// the dump as a string.
///
/// @example Basic usage (SQL format)
/// ```typescript
/// import { PgDumpTool, PgDumpFormat } from 'pg-embedded';
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
///   config: {
///     format: PgDumpFormat.Plain
///   }
/// });
///
/// const result = await dumpTool.execute();
/// if (result.exitCode === 0) {
///   console.log('Database dump:', result.stdout);
/// }
/// ```
pub struct PgDumpTool {
  options: PgDumpOptions,
}

#[napi]
impl PgDumpTool {
  #[napi(constructor)]
  /// Creates a new PgDumpTool instance with complete options.
  ///
  /// @param options - Configuration options for the pg_dump operation
  /// @returns A new PgDumpTool instance ready to execute dumps
  ///
  /// @example
  /// ```typescript
  /// import { PgDumpTool, PgDumpFormat } from 'pg-embedded';
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
  ///   config: {
  ///     format: PgDumpFormat.Custom,
  ///     file: './backup.dump'
  ///   }
  /// });
  /// ```
  pub fn new(options: PgDumpOptions) -> Self {
    Self { options }
  }

  #[napi(factory)]
  /// Creates a PgDumpTool from connection info and dump-specific config.
  ///
  /// This is the preferred method when using with PostgresInstance,
  /// as it separates connection concerns from tool-specific configuration.
  ///
  /// @param connection - Database connection configuration
  /// @param program_dir - Directory containing the pg_dump executable
  /// @param config - Pg_dump-specific configuration options
  /// @returns A new PgDumpTool instance
  ///
  /// @example
  /// ```typescript
  /// import { PgDumpTool, PgDumpFormat } from 'pg-embedded';
  ///
  /// const dumpTool = PgDumpTool.fromConnection(
  ///   instance.connectionInfo,
  ///   instance.programDir + '/bin',
  ///   {
  ///     format: PgDumpFormat.Custom,
  ///     file: './backup.dump',
  ///     clean: true
  ///   }
  /// );
  /// ```
  pub fn from_connection(
    connection: ConnectionConfig,
    program_dir: String,
    config: PgDumpConfig,
  ) -> Self {
    let options = PgDumpOptions {
      connection,
      program_dir,
      config,
    };
    Self { options }
  }

  /// Builds a pg_dump command with all configured options.
  /// This internal method translates the TypeScript options into command-line arguments.
  fn to_command(&self, force_stdout: bool) -> Result<Command> {
    let mut builder = PgDumpBuilder::new();
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
    if let Some(password) = &connection.password {
      builder = builder.pg_password(password);
    }
    if let Some(dbname) = &connection.database {
      builder = builder.dbname(dbname);
    }

    // Apply dump-specific options
    if let Some(data_only) = config.data_only {
      if data_only {
        builder = builder.data_only();
      }
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
    if let Some(schema_only) = config.schema_only {
      if schema_only {
        builder = builder.schema_only();
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
    if let Some(verbose) = config.verbose {
      if verbose {
        builder = builder.verbose();
      }
    }
    if let Some(table) = &config.table {
      builder = builder.table(table);
    }
    if let Some(exclude_table) = &config.exclude_table {
      builder = builder.exclude_table(exclude_table);
    }
    if let Some(schema) = &config.schema {
      builder = builder.schema(schema);
    }
    if let Some(exclude_schema) = &config.exclude_schema {
      builder = builder.exclude_schema(exclude_schema);
    }
    if let Some(encoding) = &config.encoding {
      builder = builder.encoding(encoding);
    }
    if let Some(jobs) = &config.jobs {
      builder = builder.jobs(jobs.to_string());
    }
    if let Some(compression) = &config.compression {
      builder = builder.compression(compression.to_string());
    }
    if let Some(format) = &config.format {
      builder = builder.format(format.to_pg_dump_format());
    }

    // Handle file output
    if !force_stdout {
      if let Some(file) = &config.file {
        builder = builder.file(file);
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
        .config
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
  /// import { PgDumpTool, PgDumpFormat } from 'pg-embedded';
  ///
  /// const dumpTool = new PgDumpTool({
  ///   connection: { host: 'localhost', port: 5432, username: 'postgres' },
  ///   programDir: '/home/postgresql/17.5.0/bin',
  ///   config: {
  ///     format: PgDumpFormat.Plain
  ///   }
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
  pub async fn execute(&self) -> Result<ToolResult> {
    let command = self.to_command(false)?;
    self.run_command(command).await
  }
}
