# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1-pg17.5] - 2025-08-02

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
