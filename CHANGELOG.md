# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1+pg17.5] - 2025-08-04

### Added

- **✨ `ifExists` Option**: Added `ifExists` option to `pg_dump` and `pg_restore` to suppress errors when cleaning non-existent database objects. This improves the reliability of restore operations.

### Fixed

- **🧪 Test Reliability**: Improved test cleanup logic to prevent cascading failures when database instances fail to start, ensuring more accurate test results.

## [0.2.0+pg17.5] - 2025-08-03

### Added

- **🔧 PostgresInstance Tool Integration**: Direct tool execution methods added to PostgresInstance
  - `createDump()` - Execute pg_dump to backup individual databases
  - `createDumpall()` - Execute pg_dumpall to backup all databases and global objects
  - `createRestore()` - Execute pg_restore to restore databases from backups
  - `createBaseBackup()` - Execute pg_basebackup for binary cluster backups
  - `createRewind()` - Execute pg_rewind for cluster synchronization
  - `executeSql()` - Execute SQL commands directly using psql
  - `executeFile()` - Execute SQL files using psql
  - All methods include automatic connection configuration and error handling

- **📦 New Tool Classes**: Standalone tool classes for advanced PostgreSQL operations
  - `PgDumpallTool` - Complete pg_dumpall wrapper with TypeScript support
  - Enhanced tool architecture with consistent API patterns

### Changed

- **⚠️ BREAKING CHANGE**: PostgreSQL tools options structure refactored
  - Tool constructors now use a unified options object structure
  - Connection configuration separated from tool-specific options
  - Improved type safety and parameter validation
  - Better alignment with PostgreSQL command-line tool patterns

### Improved

- **🚀 Enhanced API Usability**
  - Simplified tool instantiation with cleaner constructor patterns
  - Consistent error handling across all tools
  - Better TypeScript intellisense and documentation
  - Automatic connection info passing from PostgresInstance

- **🧪 Test Infrastructure**
  - All tests updated to use automatic port assignment (`port: 0`)
  - Comprehensive test coverage for new pg_dumpall functionality
  - Enhanced test reliability with proper cleanup procedures

### Technical Details

- **API Changes**:
  - Tool constructors now accept `{ connection, programDir, config }` structure
  - Connection configuration standardized across all tools
  - Enhanced type definitions for better development experience

- **New Methods in PostgresInstance**:
  - `createDump(options: PgDumpConfig, database?: string): Promise<ToolResult>`
  - `createDumpall(options: PgDumpallConfig): Promise<ToolResult>`
  - `createRestore(options: PgRestoreConfig, database?: string): Promise<ToolResult>`
  - `createBaseBackup(options: PgBasebackupConfig, database?: string): Promise<ToolResult>`
  - `createRewind(options: PgRewindConfig, database?: string): Promise<ToolResult>`
  - `executeSql(sql: string, options: PsqlConfig, database?: string): Promise<ToolResult>`
  - `executeFile(filePath: string, options: PsqlConfig, database?: string): Promise<ToolResult>`

## [0.1.2+pg17.5] - 2025-08-03

### Added

- **🎯 PgRewindTool**: Complete PostgreSQL data directory synchronization tool
  - Full `pg_rewind` command-line utility wrapper with TypeScript support
  - Automatic WAL configuration with `autoConfigureWal` option
  - Direct `PostgresInstance.connectionInfo` support via `sourceInstance` parameter
  - Comprehensive error handling and validation
  - Dry run mode for testing and validation
  - Progress reporting and debug output options

- **🔧 PgBasebackupTool**: PostgreSQL base backup functionality
  - Complete `pg_basebackup` wrapper for creating database backups
  - Support for all backup formats (plain, custom, directory, tar)
  - Streaming and fetch WAL methods
  - Parallel backup jobs support
  - Comprehensive TypeScript documentation

- **📝 Enhanced Documentation**
  - All code comments converted to comprehensive English documentation
  - TypeScript-focused API documentation following industry standards
  - Detailed examples for all tools and use cases
  - Complete parameter descriptions with equivalent command-line flags
  - Error handling guidance and best practices

### Improved

- **🚀 Simplified API Usage**
  - One-line pg_rewind operations with automatic configuration
  - Eliminated manual PostgreSQL configuration requirements
  - Direct connection info passing without string concatenation
  - Automatic WAL archiving and restore command setup

- **🧪 Test Infrastructure**
  - All tests updated to use automatic port assignment (`port: 0`)
  - Eliminated port conflicts when running full test suite
  - Fully programmatic test setup using existing tools
  - Removed all manual file operations and command-line executions
  - Comprehensive test coverage for all new functionality

- **📚 Code Quality**
  - All Chinese comments replaced with professional English documentation
  - Consistent documentation style across all tools
  - Enhanced error messages and debugging information
  - Improved type safety and parameter validation

### Fixed

- **🔧 Port Conflicts**: Resolved test suite conflicts by implementing automatic port assignment
- **📁 WAL Configuration**: Automated complex WAL archiving setup for pg_rewind
- **🔐 Permissions**: Proper PostgreSQL data directory permissions handling
- **🔄 Test Reliability**: Eliminated flaky tests due to hardcoded ports and manual setup

### Technical Details

- **New Tools Added**:
  - `PgRewindTool` - PostgreSQL data directory synchronization
  - `PgBasebackupTool` - Database backup creation
  - Enhanced `PsqlTool` usage in tests

- **API Enhancements**:
  - `autoConfigureWal: boolean` - Automatic WAL configuration
  - `sourceInstance: ConnectionConfig` - Direct connection info support
  - `restoreTargetWal: boolean` - Automatic WAL restoration
  - `walArchiveDir: string` - Custom WAL archive directory

- **Configuration Improvements**:
  - Automatic `wal_log_hints = on` configuration
  - Automatic `archive_mode = on` and archive commands
  - Automatic `restore_command` setup
  - Proper `wal_level = replica` and `max_wal_senders` settings

## [0.1.1+pg17.5] - 2025-08-02

### Added

- `psql` tool for executing SQL commands and files.
- `pg_isready` tool for checking PostgreSQL server status.
- `pg_dump` tool for creating database backups.
- `pg_restore` tool for restoring databases from backups.

## [0.1.0-pg17.5] - 2025-08-01

### Added

- Initial project setup
- Basic PostgreSQL instance management
- Core Rust implementation with NAPI bindings
- TypeScript definitions generation
- Basic test infrastructure

---

## Release Notes

### Version 0.1.0-pg17.5 - Initial Release

This is the first release of pg-embedded, providing a complete solution for embedding PostgreSQL databases in Node.js applications.

#### Key Features

**🚀 Easy to Use**

- Simple API that works out of the box
- No external PostgreSQL installation required
- Automatic setup and configuration

**⚡ High Performance**

- Optimized startup times with lazy initialization
- Connection information caching
- Efficient resource management

**🛡️ Type Safe**

- Complete TypeScript support
- Comprehensive JSDoc documentation
- Runtime type validation

**🧪 Testing Ready**

- Perfect for integration tests
- Isolated database instances
- Automatic cleanup

**🔧 Highly Configurable**

- Flexible configuration options
- Support for persistent and temporary databases
- Custom data and installation directories

#### Breaking Changes

- None (initial release)

#### Migration Guide

- None (initial release)

#### Known Issues

- None currently known

#### Supported Platforms

- macOS (x64, ARM64)
- Linux (x64, ARM64, ARM)
- Windows (x64)

#### Dependencies

- Node.js >= 16.0.0
- Rust toolchain (for building from source)

#### Performance Benchmarks

- Average startup time: < 3 seconds
- Memory usage: < 50MB per instance
- Database operations: > 10 ops/second

For detailed usage instructions, see the [README](README.md) and [API documentation](API.md).
