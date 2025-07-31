import test from 'ava'
import { PostgresInstance, initLogger, LogLevel } from '../index.js'

// Initialize logger for tests
initLogger(LogLevel.Error)

let instance: PostgresInstance

test.before(async () => {
  instance = new PostgresInstance({
    port: 0, // Use random port
    username: 'postgres',
    password: 'password',
    persistent: false,
  })
  await instance.start()
})

test.after(async () => {
  if (instance) {
    await instance.stop()
  }
})

test('should execute simple SQL query', async (t) => {
  const result = await instance.executeSql('SELECT version();')

  t.is(result.success, true)
  t.true(result.stdout.includes('PostgreSQL'))
  t.is(result.stderr, '')
})

test('should execute SQL query on specific database', async (t) => {
  // First create a test database
  await instance.createDatabase('test_db')

  // Execute query on the test database
  const result = await instance.executeSql('SELECT current_database();', 'test_db')

  t.is(result.success, true)
  t.true(result.stdout.includes('test_db'))

  // Clean up
  await instance.dropDatabase('test_db')
})

test('should handle SQL errors gracefully', async (t) => {
  const error = await t.throwsAsync(async () => {
    await instance.executeSql('SELECT * FROM non_existent_table;')
  })

  t.true(error.message.includes('SQL execution failed'))
})

test('should create and query a table', async (t) => {
  // Create a test database
  await instance.createDatabase('test_schema')

  // Create a table
  const createResult = await instance.executeSql(
    `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL
    );
  `,
    'test_schema',
  )

  t.is(createResult.success, true)

  // Insert data
  const insertResult = await instance.executeSql(
    `
    INSERT INTO users (name, email) VALUES 
    ('John Doe', 'john@example.com'),
    ('Jane Smith', 'jane@example.com');
  `,
    'test_schema',
  )

  t.is(insertResult.success, true)

  // Query data
  const selectResult = await instance.executeSql('SELECT * FROM users ORDER BY id;', 'test_schema')

  t.is(selectResult.success, true)
  t.true(selectResult.stdout.includes('John Doe'))
  t.true(selectResult.stdout.includes('Jane Smith'))

  // Clean up
  await instance.dropDatabase('test_schema')
})

test('should reject empty SQL commands', async (t) => {
  const error = await t.throwsAsync(async () => {
    await instance.executeSql('')
  })

  t.true(error.message.includes('SQL command cannot be empty'))
})

test('should reject SQL execution when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance()

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.executeSql('SELECT 1;')
  })

  t.true(error.message.includes('PostgreSQL instance is not running'))
})
