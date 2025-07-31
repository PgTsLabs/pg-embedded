# API Reference

This document provides a comprehensive reference for all classes, interfaces, and functions available in the pg-embedded library.

## Table of Contents

- [PostgresInstance](#postgresinstance)
- [PostgresSettings](#postgressettings)
- [ConnectionInfo](#connectioninfo)
- [SqlResult](#sqlresult)
- [StructuredSqlResult](#structuredsqlresult)
- [InstanceState](#instancestate)
- [Utility Functions](#utility-functions)
- [Error Handling](#error-handling)

## PostgresInstance

The main class for managing embedded PostgreSQL instances.

### Constructor

```typescript
new PostgresInstance(settings?: PostgresSettings)
```

Creates a new PostgreSQL instance with the specified settings.

**Parameters:**

- `settings` (optional): Configuration settings for the PostgreSQL instance

**Example:**

```typescript
const instance = new PostgresInstance({
  port: 5432,
  username: 'postgres',
  password: 'password',
})
```

### Properties

#### `state: InstanceState` (readonly)

Gets the current state of the PostgreSQL instance.

**Possible values:**

- `"Stopped"` - Instance is not running
- `"Starting"` - Instance is in the process of starting
- `"Running"` - Instance is running and ready to accept connections
- `"Stopping"` - Instance is in the process of stopping

**Example:**

```typescript
console.log(`Current state: ${instance.state}`)
```

#### `connectionInfo: ConnectionInfo` (readonly)

Gets the connection information for the PostgreSQL instance. Only available when the instance is running.

**Throws:** Error if the instance is not running

**Example:**

```typescript
if (instance.state === 'Running') {
  const info = instance.connectionInfo
  console.log(`Connect to: ${info.connectionString}`)
}
```

#### `instanceId: string` (readonly)

Gets the unique identifier for this PostgreSQL instance.

**Example:**

```typescript
console.log(`Instance ID: ${instance.instanceId}`)
```

### Methods

#### `setup(): Promise<void>`

Sets up the PostgreSQL instance asynchronously. This method initializes the PostgreSQL instance but does not start it. It's automatically called by start() if needed.

**Throws:**

- Error if setup fails

**Example:**

```typescript
try {
  await instance.setup()
  console.log('PostgreSQL setup completed')
} catch (error) {
  console.error('Failed to setup:', error.message)
}
```

#### `start(): Promise<void>`

Starts the PostgreSQL instance asynchronously. This method includes automatic setup if the instance hasn't been set up yet.

**Throws:**

- Error if the instance is already running or starting
- Error if startup fails

**Example:**

```typescript
try {
  await instance.start()
  console.log('PostgreSQL started successfully')
} catch (error) {
  console.error('Failed to start:', error.message)
}
```

#### `stop(): Promise<void>`

Stops the PostgreSQL instance asynchronously.

**Throws:**

- Error if the instance is already stopped or stopping
- Error if stopping fails

**Example:**

```typescript
try {
  await instance.stop()
  console.log('PostgreSQL stopped successfully')
} catch (error) {
  console.error('Failed to stop:', error.message)
}
```

#### `startWithTimeout(timeoutSeconds: number): Promise<void>`

Starts the PostgreSQL instance with a specified timeout.

**Parameters:**

- `timeoutSeconds`: Maximum time to wait for startup in seconds

**Throws:**

- Error if the instance is already running or starting
- Error if startup fails or timeout is exceeded

**Example:**

```typescript
try {
  await instance.startWithTimeout(30) // 30 second timeout
  console.log('Started within timeout')
} catch (error) {
  console.error('Start failed or timed out:', error.message)
}
```

#### `stopWithTimeout(timeoutSeconds: number): Promise<void>`

Stops the PostgreSQL instance with a specified timeout.

**Parameters:**

- `timeoutSeconds`: Maximum time to wait for shutdown in seconds

**Throws:**

- Error if the instance is already stopped or stopping
- Error if stopping fails or timeout is exceeded

**Example:**

```typescript
try {
  await instance.stopWithTimeout(10) // 10 second timeout
  console.log('Stopped within timeout')
} catch (error) {
  console.error('Stop failed or timed out:', error.message)
}
```

#### `createDatabase(name: string): Promise<void>`

Creates a new database asynchronously.

**Parameters:**

- `name`: The name of the database to create

**Throws:**

- Error if the instance is not running
- Error if database creation fails
- Error if database name is empty

**Example:**

```typescript
try {
  await instance.createDatabase('myapp')
  console.log('Database created successfully')
} catch (error) {
  console.error('Failed to create database:', error.message)
}
```

#### `dropDatabase(name: string): Promise<void>`

Drops (deletes) a database asynchronously.

**Parameters:**

- `name`: The name of the database to drop

**Throws:**

- Error if the instance is not running
- Error if database deletion fails
- Error if database name is empty

**Example:**

```typescript
try {
  await instance.dropDatabase('myapp')
  console.log('Database dropped successfully')
} catch (error) {
  console.error('Failed to drop database:', error.message)
}
```

#### `databaseExists(name: string): Promise<boolean>`

Checks if a database exists asynchronously.

**Parameters:**

- `name`: The name of the database to check

**Returns:** Promise that resolves to `true` if the database exists, `false` otherwise

**Throws:**

- Error if the instance is not running
- Error if the check fails
- Error if database name is empty

**Example:**

```typescript
try {
  const exists = await instance.databaseExists('myapp')
  if (exists) {
    console.log('Database exists')
  } else {
    console.log('Database does not exist')
  }
} catch (error) {
  console.error('Failed to check database:', error.message)
}
```

#### `executeSql(sql: string, database?: string): Promise<SqlResult>`

Executes a SQL command against the PostgreSQL instance.

**Parameters:**

- `sql`: The SQL command to execute
- `database` (optional): Database name (defaults to "postgres")

**Returns:** Promise that resolves to a `SqlResult` object containing:

- `stdout`: Standard output from the SQL command
- `stderr`: Standard error from the SQL command
- `success`: Whether the execution was successful

**Throws:**

- Error if the instance is not running
- Error if SQL command is empty
- Error if SQL execution fails

**Example:**

```typescript
try {
  const result = await instance.executeSql('SELECT version();')
  console.log('Query result:', result.stdout)

  // Execute on specific database
  const result2 = await instance.executeSql('SELECT * FROM users;', 'myapp')
  console.log('Users:', result2.stdout)
} catch (error) {
  console.error('SQL execution failed:', error.message)
}
```

#### `executeSqlFile(filePath: string, database?: string): Promise<SqlResult>`

Executes a SQL file against the PostgreSQL instance.

**Parameters:**

- `filePath`: Path to the SQL file to execute
- `database` (optional): Database name (defaults to "postgres")

**Returns:** Promise that resolves to a `SqlResult` object containing:

- `stdout`: Standard output from the SQL command
- `stderr`: Standard error from the SQL command
- `success`: Whether the execution was successful

**Throws:**

- Error if the instance is not running
- Error if file path is empty
- Error if file doesn't exist
- Error if SQL execution fails

**Example:**

```typescript
try {
  const result = await instance.executeSqlFile('./schema.sql')
  console.log('Schema created:', result.success)

  // Execute on specific database
  const result2 = await instance.executeSqlFile('./data.sql', 'myapp')
  console.log('Data loaded:', result2.success)
} catch (error) {
  console.error('SQL file execution failed:', error.message)
}
```

#### `executeSqlJson(sql: string, database?: string): Promise<StructuredSqlResult>`

Executes a SQL query and returns results as a JSON array using PostgreSQL's built-in JSON functions.

**Parameters:**

- `sql`: The SQL query to execute (should be a SELECT statement)
- `database` (optional): Database name (defaults to "postgres")

**Returns:** Promise that resolves to a `StructuredSqlResult` object containing:

- `data`: JSON array string of query results
- `stdout`: Raw standard output
- `stderr`: Standard error messages
- `success`: Whether execution was successful
- `row_count`: Number of rows returned

**Throws:**

- Error if the instance is not running
- Error if SQL command is empty
- Error if SQL execution fails

**Example:**

```typescript
try {
  const result = await instance.executeSqlJson('SELECT id, name, email FROM users WHERE active = true;')

  if (result.success && result.data) {
    const users = JSON.parse(result.data)
    console.log(`Found ${result.row_count} active users:`)

    users.forEach((user) => {
      console.log(`- ${user.name}: ${user.email}`)
    })
  }
} catch (error) {
  console.error('JSON SQL execution failed:', error.message)
}
```

#### `executeSqlStructured(sql: string, database?: string): Promise<StructuredSqlResult>`

Executes a SQL query and returns structured results by parsing CSV output to JSON.

**Parameters:**

- `sql`: The SQL query to execute
- `database` (optional): Database name (defaults to "postgres")

**Returns:** Promise that resolves to a `StructuredSqlResult` object containing:

- `data`: JSON array string of parsed CSV results
- `stdout`: Raw CSV output
- `stderr`: Standard error messages
- `success`: Whether execution was successful
- `row_count`: Number of rows returned

**Throws:**

- Error if the instance is not running
- Error if SQL command is empty
- Error if SQL execution fails

**Example:**

```typescript
try {
  const result = await instance.executeSqlStructured('SELECT * FROM products ORDER BY price DESC;')

  if (result.success && result.data) {
    const products = JSON.parse(result.data)
    console.log(`Found ${result.row_count} products:`)

    products.forEach((product) => {
      console.log(`- ${product.name}: $${product.price}`)
    })
  }
} catch (error) {
  console.error('Structured SQL execution failed:', error.message)
}
```

### Utility Methods

#### `isHealthy(): boolean`

Checks if the PostgreSQL instance is healthy and running.

**Returns:** `true` if the instance is running and healthy, `false` otherwise

**Example:**

```typescript
if (instance.isHealthy()) {
  console.log('Instance is healthy')
} else {
  console.log('Instance is not healthy')
}
```

#### `getStartupTime(): number | null`

Gets the startup time of the PostgreSQL instance in seconds.

**Returns:** The startup time in seconds, or `null` if the instance hasn't been started yet

**Example:**

```typescript
const startupTime = instance.getStartupTime()
if (startupTime !== null) {
  console.log(`Started in ${startupTime.toFixed(3)} seconds`)
} else {
  console.log('Instance has not been started yet')
}
```

#### `getConfigHash(): string`

Gets the configuration hash for this instance.

**Returns:** A string hash of the instance configuration

**Example:**

```typescript
const hash = instance.getConfigHash()
console.log(`Configuration hash: ${hash}`)
```

#### `clearConnectionCache(): void`

Clears the connection information cache. This forces the next call to `connectionInfo` to regenerate the connection information.

**Example:**

```typescript
instance.clearConnectionCache()
console.log('Connection cache cleared')
```

#### `isConnectionCacheValid(): boolean`

Checks if the connection information cache is valid. The cache is considered valid if it exists and is less than 5 minutes old.

**Returns:** `true` if the cache is valid, `false` otherwise

**Example:**

```typescript
if (instance.isConnectionCacheValid()) {
  console.log('Connection cache is valid')
} else {
  console.log('Connection cache is invalid or expired')
}
```

#### `cleanup(): Promise<void>`

Manually cleans up all resources associated with this instance. This method stops the PostgreSQL instance (if running) and cleans up all resources. It's automatically called when the instance is garbage collected, but can be called manually for immediate cleanup.

**Example:**

```typescript
await instance.cleanup()
console.log('Resources cleaned up')
```

## PostgresSettings

Configuration settings for a PostgreSQL instance.

```typescript
interface PostgresSettings {
  version?: string
  port?: number
  username?: string
  password?: string
  databaseName?: string
  dataDir?: string
  installationDir?: string
  timeout?: number
  setupTimeout?: number
  persistent?: boolean
}
```

### Properties

#### `version?: string`

PostgreSQL version specification (e.g., "15.0", ">=14.0"). Uses semantic versioning syntax.

**Default:** Latest available version

**Example:**

```typescript
const settings: PostgresSettings = {
  version: '>=14.0',
}
```

#### `port?: number`

Port number for the PostgreSQL server (1-65535).

**Default:** 5432

**Example:**

```typescript
const settings: PostgresSettings = {
  port: 5433,
}
```

#### `username?: string`

Username for database connection.

**Default:** "postgres"

**Example:**

```typescript
const settings: PostgresSettings = {
  username: 'myuser',
}
```

#### `password?: string`

Password for database connection.

**Default:** "postgres"

**Example:**

```typescript
const settings: PostgresSettings = {
  password: 'mypassword',
}
```

#### `databaseName?: string`

Default database name.

**Default:** "postgres"

**Example:**

```typescript
const settings: PostgresSettings = {
  databaseName: 'mydefaultdb',
}
```

#### `dataDir?: string`

Custom data directory path. If not specified, a temporary directory will be used.

**Default:** System temporary directory

**Example:**

```typescript
const settings: PostgresSettings = {
  dataDir: '/path/to/data',
}
```

#### `installationDir?: string`

Custom installation directory path. If not specified, PostgreSQL will be installed in a default location.

**Default:** System-specific default location

**Example:**

```typescript
const settings: PostgresSettings = {
  installationDir: '/path/to/postgres',
}
```

#### `timeout?: number`

Timeout in seconds for database operations.

**Default:** 30

**Example:**

```typescript
const settings: PostgresSettings = {
  timeout: 60,
}
```

#### `setupTimeout?: number`

Setup timeout in seconds for PostgreSQL initialization.

**Default:** 300 on Windows, 30 on other platforms

**Example:**

```typescript
const settings: PostgresSettings = {
  setupTimeout: 120,
}
```

#### `persistent?: boolean`

Whether to persist data between runs. If `false`, data will be stored in a temporary location and deleted when the instance stops.

**Default:** false

**Example:**

```typescript
const settings: PostgresSettings = {
  persistent: true,
}
```

## ConnectionInfo

Connection information for a PostgreSQL instance.

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

### Properties

#### `host: string`

The hostname or IP address of the PostgreSQL server.

#### `port: number`

The port number of the PostgreSQL server.

#### `username: string`

The username for connecting to the database.

#### `password: string`

The password for connecting to the database.

#### `databaseName: string`

The default database name.

#### `connectionString: string`

A complete PostgreSQL connection string that can be used with database clients.

**Example:**

```typescript
const info = instance.connectionInfo
console.log(`Host: ${info.host}`)
console.log(`Port: ${info.port}`)
console.log(`Database: ${info.databaseName}`)
console.log(`Connection String: ${info.connectionString}`)

// Use with a PostgreSQL client
import { Client } from 'pg'
const client = new Client(info.connectionString)
```

## SqlResult

Result object returned by SQL execution methods.

```typescript
interface SqlResult {
  stdout: string
  stderr: string
  success: boolean
}
```

### Properties

#### `stdout: string`

Standard output from the SQL command execution. Contains query results, success messages, and other output.

#### `stderr: string`

Standard error from the SQL command execution. Contains error messages and warnings.

#### `success: boolean`

Indicates whether the SQL execution was successful. `true` if the command executed without errors, `false` otherwise.

**Example:**

```typescript
const result = await instance.executeSql('SELECT COUNT(*) FROM users;')

if (result.success) {
  console.log('Query executed successfully')
  console.log('Result:', result.stdout)
} else {
  console.error('Query failed')
  console.error('Error:', result.stderr)
}

// Handle both output and errors
if (result.stderr) {
  console.warn('Warnings:', result.stderr)
}
```

## StructuredSqlResult

Result object returned by structured SQL execution methods (`executeSqlJson` and `executeSqlStructured`).

```typescript
interface StructuredSqlResult {
  data: string | null
  stdout: string
  stderr: string
  success: boolean
  row_count: number | null
}
```

### Properties

#### `data: string | null`

Parsed JSON data from the SQL query result as a string. Contains the query results in JSON format, or `null` if parsing failed.

#### `stdout: string`

Raw standard output from the SQL command execution.

#### `stderr: string`

Standard error from the SQL command execution. Contains error messages and warnings.

#### `success: boolean`

Indicates whether the SQL execution was successful.

#### `row_count: number | null`

Number of rows returned by the query, or `null` if not applicable.

**Example:**

```typescript
const result = await instance.executeSqlJson('SELECT id, name FROM users LIMIT 5;')

if (result.success && result.data) {
  const users = JSON.parse(result.data)
  console.log(`Found ${result.row_count} users:`)

  users.forEach((user) => {
    console.log(`- ${user.name} (ID: ${user.id})`)
  })
} else {
  console.error('Query failed:', result.stderr)
}

// TypeScript usage with type safety
interface User {
  id: number
  name: string
}

const typedUsers: User[] = JSON.parse(result.data)
```

## InstanceState

Enumeration of possible PostgreSQL instance states.

```typescript
enum InstanceState {
  Stopped = 'Stopped',
  Starting = 'Starting',
  Running = 'Running',
  Stopping = 'Stopping',
}
```

### Values

#### `Stopped`

The instance is not running.

#### `Starting`

The instance is in the process of starting up.

#### `Running`

The instance is running and ready to accept connections.

#### `Stopping`

The instance is in the process of shutting down.

## Utility Functions

### `initLogger(level: LogLevel): void`

Initializes the logging system with the specified log level.

**Parameters:**

- `level`: The log level to use

**Example:**

```typescript
import { initLogger, LogLevel } from 'pg-embedded'

initLogger(LogLevel.Info)
```

### LogLevel

Enumeration of available log levels.

```typescript
enum LogLevel {
  Error = 'Error',
  Warn = 'Warn',
  Info = 'Info',
  Debug = 'Debug',
}
```

## Error Handling

The library provides detailed error information for different scenarios. All errors include a `message` property with a human-readable description, and may include additional properties for specific error types.

### Common Error Codes

#### `ConfigurationError`

Thrown when there's an issue with the configuration settings.

**Example:**

```typescript
try {
  const instance = new PostgresInstance({
    port: 0, // Invalid port
  })
} catch (error) {
  if (error.code === 'ConfigurationError') {
    console.log('Configuration issue:', error.message)
  }
}
```

#### `StartupError`

Thrown when the PostgreSQL instance fails to start.

**Example:**

```typescript
try {
  await instance.start()
} catch (error) {
  if (error.code === 'StartupError') {
    console.log('Startup failed:', error.message)
  }
}
```

#### `DatabaseError`

Thrown when database operations fail.

**Example:**

```typescript
try {
  await instance.createDatabase('invalid name!')
} catch (error) {
  if (error.code === 'DatabaseError') {
    console.log('Database operation failed:', error.message)
  }
}
```

#### `TimeoutError`

Thrown when operations exceed their timeout limits.

**Example:**

```typescript
try {
  await instance.startWithTimeout(1) // Very short timeout
} catch (error) {
  if (error.code === 'TimeoutError') {
    console.log('Operation timed out:', error.message)
  }
}
```

### Error Handling Best Practices

1. **Always use try-catch blocks** for async operations:

   ```typescript
   try {
     await instance.start()
     // ... database operations
   } catch (error) {
     console.error('Operation failed:', error.message)
   } finally {
     instance.cleanup()
   }
   ```

2. **Check error codes** for specific handling:

   ```typescript
   try {
     await instance.createDatabase(dbName)
   } catch (error) {
     if (error.code === 'DatabaseError') {
       // Handle database-specific errors
     } else if (error.code === 'ConfigurationError') {
       // Handle configuration errors
     } else {
       // Handle other errors
     }
   }
   ```

3. **Use cleanup in finally blocks** to ensure resources are freed:

   ```typescript
   let instance
   try {
     instance = new PostgresInstance()
     await instance.start()
     // ... operations
   } catch (error) {
     console.error('Error:', error.message)
   } finally {
     if (instance) {
       await instance.cleanup()
     }
   }
   ```

4. **Handle state-dependent operations**:
   ```typescript
   if (instance.state === 'Running') {
     const info = instance.connectionInfo
     // Use connection info
   } else {
     console.log('Instance is not running')
   }
   ```
