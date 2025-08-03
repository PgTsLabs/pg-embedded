# pg-embedded

A Node.js library for running embedded PostgreSQL instances. This library provides a simple and efficient way to start, manage, and interact with PostgreSQL databases directly from your Node.js applications without requiring a separate PostgreSQL installation.

## Features

- 🚀 **Easy to use**: Simple API for starting and managing PostgreSQL instances
- ⚡ **Fast startup**: Optimized for quick instance initialization
- 🔄 **Async operations**: Full async/await support for non-blocking operations
- 🛡️ **Type-safe**: Full TypeScript support with comprehensive type definitions
- 🧹 **Automatic cleanup**: Built-in resource management and cleanup
- 📊 **Performance monitoring**: Built-in startup time tracking and health checks
- 🔧 **Configurable**: Extensive configuration options for different use cases
- 🏗️ **Cross-platform**: Works on macOS, Linux, and Windows
- 🛠️ **Complete toolset**: Built-in PostgreSQL tools (pg_dump, pg_restore, pg_rewind, pg_basebackup, psql)
- 🎯 **Simplified workflows**: One-line operations with automatic configuration

## Installation

```bash
npm install pg-embedded
```

## Quick Start

```typescript
import { PostgresInstance } from 'pg-embedded'

async function example() {
  // Create a new PostgreSQL instance
  const postgres = new PostgresInstance({
    port: 5432,
    username: 'postgres',
    password: 'password',
    persistent: false,
  })

  try {
    // Start the PostgreSQL server
    await postgres.start()
    console.log('PostgreSQL started successfully!')

    // Create a database
    await postgres.createDatabase('myapp')

    // Check if database exists
    const exists = await postgres.databaseExists('myapp')
    console.log(`Database exists: ${exists}`)

    // Get connection information
    const connectionInfo = postgres.connectionInfo
    console.log(`Connect to: ${connectionInfo.connectionString}`)

    // Drop the database
    await postgres.dropDatabase('myapp')

    // Stop the server
    await postgres.stop()
  } finally {
    // Clean up resources
    await postgres.cleanup()
  }
}

example().catch(console.error)
```

## Configuration Options

The `PostgresSettings` object supports the following options:

```typescript
interface PostgresSettings {
  /** PostgreSQL version (e.g., "15.0", ">=14.0") */
  version?: string

  /** Port number (0-65535, default: 5432, 0 for random) */
  port?: number

  /** Username for database connection (default: "postgres") */
  username?: string

  /** Password for database connection (default: "postgres") */
  password?: string

  /** Default database name (default: "postgres") */
  databaseName?: string

  /** Custom data directory path */
  dataDir?: string

  /** Custom installation directory path */
  installationDir?: string

  /** Timeout in seconds for database operations (default: 30) */
  timeout?: number

  /** Setup timeout in seconds for PostgreSQL initialization (default: 300 on Windows, 30 on other platforms) */
  setupTimeout?: number

  /** Whether to persist data between runs (default: false) */
  persistent?: boolean
}
```

## API Reference

### PostgresInstance

#### Constructor

```typescript
new PostgresInstance(settings?: PostgresSettings)
```

Creates a new PostgreSQL instance with the specified settings.

#### Properties

- `state: InstanceState` - Current state of the instance (Stopped, Starting, Running, Stopping)
- `connectionInfo: ConnectionInfo` - Connection information (only available when running)
- `instanceId: string` - Unique identifier for this instance

#### Methods

- `setup(): Promise<void>` - Set up the PostgreSQL instance (called automatically by start)
- `start(): Promise<void>` - Start the PostgreSQL instance
- `stop(): Promise<void>` - Stop the PostgreSQL instance
- `startWithTimeout(seconds: number): Promise<void>` - Start with timeout
- `stopWithTimeout(seconds: number): Promise<void>` - Stop with timeout
- `createDatabase(name: string): Promise<void>` - Create a new database
- `dropDatabase(name: string): Promise<void>` - Drop a database
- `databaseExists(name: string): Promise<boolean>` - Check if database exists

#### Utility Methods

- `isHealthy(): boolean` - Check if the instance is healthy
- `getStartupTime(): number | null` - Get startup time in seconds
- `getConfigHash(): string` - Get configuration hash
- `getPostgreSqlVersion(): string` - Get PostgreSQL version
- `clearConnectionCache(): void` - Clear connection info cache
- `isConnectionCacheValid(): boolean` - Check if connection cache is valid
- `cleanup(): Promise<void>` - Manually clean up resources

### Version Information

- `getVersionInfo(): VersionInfo` - Get comprehensive version information
- `getPostgreSQLVersion(): string` - Get PostgreSQL version
- `getPackageVersion(): string` - Get package version

### ConnectionInfo

```typescript
interface ConnectionInfo {
  host: string
  port: number
  username: string
  password: string
  databaseName: string
  connectionString: string
}
```

### InstanceState

```typescript
enum InstanceState {
  Stopped = 'Stopped',
  Starting = 'Starting',
  Running = 'Running',
  Stopping = 'Stopping',
}
```

## PostgreSQL Tools

The library includes comprehensive TypeScript wrappers for essential PostgreSQL command-line tools, providing type-safe interfaces and automatic configuration.

### PgRewindTool - Data Directory Synchronization

Synchronize PostgreSQL data directories after timeline divergence, commonly used in failover scenarios.

```typescript
import { PgRewindTool, PostgresInstance } from 'pg-embedded'

// Simplified usage with automatic configuration
const rewindTool = new PgRewindTool({
  connection: targetConnectionInfo,
  programDir: '/path/to/postgres/bin',
  targetPgdata: './target_data_dir',

  // ✨ Pass connection info directly, no manual string construction
  sourceInstance: sourceConnectionInfo,

  // ✨ Automatically configure all WAL settings
  autoConfigureWal: true,

  progress: true,
  dryRun: false,
})

const result = await rewindTool.execute()
if (result.exitCode === 0) {
  console.log('Rewind completed successfully!')
} else {
  console.error('Rewind failed:', result.stderr)
}
```

**Key Features:**

- 🎯 **One-line operation**: Automatic WAL configuration eliminates manual setup
- 🔗 **Direct connection info**: Pass `PostgresInstance.connectionInfo` directly
- 🧪 **Dry run support**: Test operations without making changes
- 📊 **Progress reporting**: Real-time operation feedback
- 🛡️ **Type-safe**: Full TypeScript support with comprehensive validation

### PgBasebackupTool - Database Backups

Create base backups of running PostgreSQL clusters with full format and streaming support.

```typescript
import { PgBasebackupTool } from 'pg-embedded'

const backupTool = new PgBasebackupTool({
  connection: postgres.connectionInfo,
  programDir: '/path/to/postgres/bin',
  pgdata: './backup_directory',
  format: 'p', // plain format
  walMethod: 'stream', // stream WAL files
  verbose: true,
})

const result = await backupTool.execute()
if (result.exitCode === 0) {
  console.log('Backup completed successfully!')
}
```

### PsqlTool - SQL Command Execution

Execute SQL commands and scripts with full TypeScript support.

```typescript
import { PsqlTool } from 'pg-embedded'

const psqlTool = new PsqlTool({
  connection: postgres.connectionInfo,
  programDir: '/path/to/postgres/bin',
})

// Execute SQL commands
const result = await psqlTool.executeCommand('CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);')

// Execute SQL files
const fileResult = await psqlTool.executeFile('./schema.sql')
```

### PgDumpTool - Database Export

Create database dumps with comprehensive format and filtering options.

```typescript
import { PgDumpTool } from 'pg-embedded'

const dumpTool = new PgDumpTool({
  connection: postgres.connectionInfo,
  programDir: '/path/to/postgres/bin',
  file: './backup.sql',
  format: 'p', // plain SQL format
  verbose: true,
})

const result = await dumpTool.execute()
```

### PgRestoreTool - Database Import

Restore databases from various backup formats.

```typescript
import { PgRestoreTool } from 'pg-embedded'

const restoreTool = new PgRestoreTool({
  connection: postgres.connectionInfo,
  programDir: '/path/to/postgres/bin',
  inputFile: './backup.sql',
  verbose: true,
})

const result = await restoreTool.execute()
```

## Advanced Usage

### Using with Testing Frameworks

#### Jest

```typescript
import { PostgresInstance } from 'pg-embedded'

describe('Database Tests', () => {
  let postgres: PostgresInstance

  beforeAll(async () => {
    postgres = new PostgresInstance({
      port: 5434,
      persistent: false,
    })
    await postgres.start()
  })

  afterAll(async () => {
    await postgres.stop()
    await postgres.cleanup()
  })

  beforeEach(async () => {
    await postgres.createDatabase('test_db')
  })

  afterEach(async () => {
    await postgres.dropDatabase('test_db')
  })

  test('should create and connect to database', async () => {
    const exists = await postgres.databaseExists('test_db')
    expect(exists).toBe(true)
  })
})
```

#### Mocha

```typescript
import { PostgresInstance } from 'pg-embedded'

describe('Database Tests', function () {
  let postgres: PostgresInstance

  before(async function () {
    this.timeout(30000) // Allow time for PostgreSQL to start
    postgres = new PostgresInstance()
    await postgres.start()
  })

  after(async function () {
    await postgres.stop()
    await postgres.cleanup()
  })

  it('should handle database operations', async function () {
    await postgres.createDatabase('mocha_test')
    const exists = await postgres.databaseExists('mocha_test')
    expect(exists).to.be.true
    await postgres.dropDatabase('mocha_test')
  })
})
```

### Performance Monitoring

```typescript
import { PostgresInstance } from 'pg-embedded'

const postgres = new PostgresInstance()

// Monitor startup performance
const startTime = Date.now()
await postgres.start()
const externalStartupTime = Date.now() - startTime

// Get internal startup time measurement
const internalStartupTime = postgres.getStartupTime()

console.log(`External measurement: ${externalStartupTime}ms`)
console.log(`Internal measurement: ${internalStartupTime * 1000}ms`)

// Check instance health
if (postgres.isHealthy()) {
  console.log('PostgreSQL instance is healthy')
}
```

### Connection Caching

```typescript
import { PostgresInstance } from 'pg-embedded'

const postgres = new PostgresInstance()
await postgres.start()

// Connection info is cached for performance
const info1 = postgres.connectionInfo
const info2 = postgres.connectionInfo // Uses cached version

// Check cache validity
console.log(`Cache valid: ${postgres.isConnectionCacheValid()}`)

// Manually clear cache if needed
postgres.clearConnectionCache()
console.log(`Cache valid after clear: ${postgres.isConnectionCacheValid()}`)
```

## Error Handling

The library provides detailed error information for different scenarios:

```typescript
import { PostgresInstance } from 'pg-embedded'

const postgres = new PostgresInstance({
  port: 80, // Invalid port for PostgreSQL
})

try {
  await postgres.start()
} catch (error) {
  console.error('Failed to start PostgreSQL:', error.message)
  // Handle specific error types
  if (error.code === 'ConfigurationError') {
    console.log('Configuration issue detected')
  }
}
```

## Troubleshooting

### Common Issues

1. **Port already in use**

   ```
   Error: PostgreSQL error: could not bind IPv4 address "127.0.0.1": Address already in use
   ```

   Solution: Use a different port or stop the conflicting service.

2. **Permission denied**

   ```
   Error: Permission denied
   ```

   Solution: Ensure your application has write permissions to the data directory.

3. **Startup timeout**
   ```
   Error: Start operation timed out after 30 seconds
   ```
   Solution: Increase the timeout or check system resources.

### Debug Logging

Enable debug logging to get more information:

```typescript
import { initLogger, LogLevel } from 'pg-embedded'

// Enable debug logging
initLogger(LogLevel.Debug)

const postgres = new PostgresInstance()
await postgres.start() // Will output detailed logs
```

### Performance Tips

1. **Use persistent instances for development**:

   ```typescript
   const postgres = new PostgresInstance({
     persistent: true,
     data_dir: './postgres-data',
   })
   ```

2. **Reuse instances across tests**:

   ```typescript
   // Create once, use multiple times
   const postgres = new PostgresInstance()
   await postgres.start()

   // Run multiple test suites...

   await postgres.stop()
   ```

3. **Monitor startup times**:
   ```typescript
   await postgres.start()
   const startupTime = postgres.getStartupTime()
   if (startupTime > 5) {
     console.warn(`Slow startup detected: ${startupTime}s`)
   }
   ```

## Version Management

This project uses a special versioning scheme that includes the PostgreSQL version:

```
<base-version>+pg<postgresql-version>
```

For example: `0.1.0+pg17.5` means:

- Base package version: `0.1.0`
- PostgreSQL version: `17.5`

### Managing PostgreSQL Versions

```bash
# Check current PostgreSQL version
pnpm pg:version

# Update PostgreSQL version
pnpm pg:update 17.6

# The CI automatically uses the PostgreSQL version from package.json
```

### Release Process

The release process automatically preserves the PostgreSQL version:

```bash
# Patch release: 0.1.0+pg17.5 -> 0.1.1+pg17.5
pnpm release:patch

# Minor release: 0.1.0+pg17.5 -> 0.2.0+pg17.5
pnpm release:minor

# Major release: 0.1.0+pg17.5 -> 1.0.0+pg17.5
pnpm release:major
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes and version history.

## Documentation

- 📖 [API Reference](API.md) - Complete API documentation
- 📝 [Examples](examples/) - Usage examples and patterns
- 🤝 [Contributing Guide](CONTRIBUTING.md) - How to contribute to the project
- 📋 [Changelog](CHANGELOG.md) - Version history and changes

## Support

If you need help or have questions:

1. Check the [API Reference](API.md) for detailed documentation
2. Look at the [examples](examples/) for common usage patterns
3. Search existing [issues](https://github.com/PgTsLabs/pg-embedded/issues) for similar problems
4. Create a new [issue](https://github.com/PgTsLabs/pg-embedded/issues/new) if you found a bug
5. Start a [discussion](https://github.com/PgTsLabs/pg-embedded/discussions) for questions or ideas
