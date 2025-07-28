# Examples

This directory contains practical examples demonstrating how to use pg-embedded in different scenarios.

## Available Examples

### 1. [async-example.js](async-example.js)
**Comprehensive async/await usage example**

This example demonstrates:
- Creating and configuring PostgreSQL instances
- Async lifecycle management (start/stop)
- Database operations (create, check, drop)
- Connection information and caching
- Performance monitoring
- Error handling and cleanup
- Timeout functionality

**Run with:**
```bash
node examples/async-example.js
```

### 2. [sync-example.js](sync-example.js)
**Synchronous API usage example**

This example shows:
- Synchronous instance management
- Sync database operations
- State management and health checks
- Performance testing patterns
- Error handling in sync context
- Resource cleanup

**Run with:**
```bash
node examples/sync-example.js
```

### 3. [testing-example.js](testing-example.js)
**Testing framework integration example**

This example includes:
- Test suite setup and teardown patterns
- Database isolation for tests
- Concurrent operation testing
- Performance benchmarking
- Error scenario testing
- Best practices for testing with pg-embedded

**Run with:**
```bash
node examples/testing-example.js
```

## Running Examples

### Prerequisites

Make sure you have built the project first:

```bash
# Install dependencies
pnpm install

# Build the native module
pnpm run build
```

### Running Individual Examples

```bash
# Run async example
node examples/async-example.js

# Run sync example  
node examples/sync-example.js

# Run testing example
node examples/testing-example.js
```

### Running All Examples

```bash
# Run all examples sequentially
for example in examples/*.js; do
  echo "Running $example..."
  node "$example"
  echo "---"
done
```

## Example Patterns

### Basic Usage Pattern

```javascript
import { PostgresInstance } from 'pg-embedded';

const postgres = new PostgresInstance({
  port: 5432,
  username: 'postgres',
  password: 'password'
});

try {
  await postgres.start();
  // Use the database...
  await postgres.stop();
} finally {
  postgres.cleanup();
}
```

### Testing Pattern

```javascript
// Setup
let postgres;
beforeAll(async () => {
  postgres = new PostgresInstance({ port: 5433 });
  await postgres.start();
});

// Cleanup
afterAll(async () => {
  await postgres.stop();
  postgres.cleanup();
});

// Test isolation
beforeEach(async () => {
  await postgres.createDatabase('test_db');
});

afterEach(async () => {
  await postgres.dropDatabase('test_db');
});
```

### Error Handling Pattern

```javascript
try {
  await postgres.start();
  await postgres.createDatabase('mydb');
} catch (error) {
  console.error('Operation failed:', error.message);
  
  // Handle specific error types
  if (error.code === 'DatabaseError') {
    // Handle database-specific errors
  }
} finally {
  // Always cleanup
  postgres.cleanup();
}
```

## Common Use Cases

### 1. Integration Testing
Use pg-embedded to create isolated database instances for your integration tests:

```javascript
// Each test gets a fresh database
const testDb = await postgres.createTestDatabase('my_test');
// Run your test...
await postgres.dropDatabase(testDb);
```

### 2. Development Environment
Start a local PostgreSQL instance for development:

```javascript
const postgres = new PostgresInstance({
  port: 5432,
  persistent: true,  // Keep data between runs
  data_dir: './dev-data'
});
```

### 3. CI/CD Pipelines
Use in continuous integration for reliable, isolated testing:

```javascript
// Fast startup for CI
const postgres = new PostgresInstance({
  persistent: false,  // Temporary data
  timeout: 60        // Allow more time in CI
});
```

### 4. Microservice Testing
Test microservices with dedicated database instances:

```javascript
// Each service gets its own database
const userServiceDb = new PostgresInstance({ port: 5432 });
const orderServiceDb = new PostgresInstance({ port: 5433 });
```

## Performance Tips

1. **Reuse instances** across multiple tests when possible
2. **Use persistent storage** for development to avoid repeated setup
3. **Monitor startup times** with `getStartupTime()` method
4. **Clean up resources** properly to avoid memory leaks
5. **Use appropriate timeouts** for your environment

## Troubleshooting

### Common Issues

1. **Port conflicts**: Use different ports for concurrent instances
2. **Permission errors**: Ensure write access to data directories
3. **Timeout errors**: Increase timeout values for slower systems
4. **Memory issues**: Clean up instances properly with `cleanup()`

### Debug Mode

Enable debug logging to see detailed operation logs:

```javascript
import { initLogger, LogLevel } from 'pg-embedded';

initLogger(LogLevel.Debug);
```

## Contributing Examples

If you have a useful example that demonstrates a specific use case:

1. Create a new `.js` file in this directory
2. Follow the existing naming convention
3. Include comprehensive comments
4. Add error handling and cleanup
5. Update this README with a description
6. Submit a pull request

Examples should be:
- **Self-contained**: Runnable without external dependencies
- **Well-documented**: Clear comments explaining each step
- **Robust**: Include proper error handling
- **Clean**: Proper resource cleanup