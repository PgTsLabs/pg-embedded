# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING**: Removed all synchronous API methods - now async-only
- Updated `PostgresSettings` interface property names to camelCase (`databaseName`, `dataDir`, `installationDir`)
- Updated `ConnectionInfo` interface property name to `databaseName`
- `cleanup()` method is now async and returns `Promise<void>`
- Updated all documentation and examples to reflect async-only API

### Added

- `setup()` method for explicit PostgreSQL instance setup
- `setupTimeout` configuration option for PostgreSQL initialization timeout

## [0.1.0] - 2025-07-29

### Added

- Initial release of pg-embedded
- PostgreSQL embedded instance management
- Asynchronous API with full async/await support
- Comprehensive TypeScript type definitions
- Automatic resource cleanup and management
- Connection information caching for performance
- Database creation, deletion, and existence checking
- Configurable PostgreSQL settings
- Health checking and startup time monitoring
- Timeout support for operations
- Extensive test suite with performance benchmarks
- Complete documentation and examples

### Features

- **Easy Setup**: Simple API for starting and managing PostgreSQL instances
- **Cross-Platform**: Support for macOS, Linux, and Windows
- **TypeScript Support**: Full type definitions with JSDoc documentation
- **Performance Optimized**: Connection caching and lazy initialization
- **Resource Management**: Automatic cleanup and memory management
- **Flexible Configuration**: Extensive configuration options
- **Testing Ready**: Perfect for integration tests and development

### API

- `PostgresInstance` class with full lifecycle management
- `PostgresSettings` interface for configuration
- `ConnectionInfo` interface for connection details
- `InstanceState` enum for state tracking
- Async methods: `setup()`, `start()`, `stop()`, `createDatabase()`, `dropDatabase()`, `databaseExists()`, `cleanup()`
- Utility methods: `isHealthy()`, `getStartupTime()`, `cleanup()`
- Timeout methods: `startWithTimeout()`, `stopWithTimeout()`

### Documentation

- Comprehensive README with quick start guide
- Complete API reference documentation
- Usage examples for async/await and synchronous patterns
- Testing framework integration examples
- Troubleshooting guide and performance tips

### Testing

- Unit tests for all core functionality
- Integration tests for real-world scenarios
- Performance benchmarks and stability tests
- Error handling and edge case testing
- Thread safety and concurrent operation tests

## [0.1.0] - 2024-01-15

### Added

- Initial project setup
- Basic PostgreSQL instance management
- Core Rust implementation with NAPI bindings
- TypeScript definitions generation
- Basic test infrastructure

---

## Release Notes

### Version 0.1.0 - Initial Release

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
