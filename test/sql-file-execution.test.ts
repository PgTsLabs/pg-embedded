import test from 'ava'
import { PostgresInstance, initLogger, LogLevel } from '../index.js'
import path from 'path'

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

test('should execute SQL file successfully', async (t) => {
  // Create a test database
  await instance.createDatabase('file_test_db')

  // Execute the SQL file
  const sqlFilePath = path.join(process.cwd(), 'test', 'fixtures', 'test-schema.sql')
  const result = await instance.executeSqlFile(sqlFilePath, 'file_test_db')

  t.is(result.success, true)

  // Verify the table was created and data was inserted
  const queryResult = await instance.executeSql('SELECT COUNT(*) FROM products;', 'file_test_db')
  t.is(queryResult.success, true)
  t.true(queryResult.stdout.includes('3')) // Should have 3 products

  // Verify specific data
  const dataResult = await instance.executeSql(
    "SELECT name, price FROM products WHERE category = 'Electronics';",
    'file_test_db',
  )
  t.is(dataResult.success, true)
  t.true(dataResult.stdout.includes('Laptop'))
  t.true(dataResult.stdout.includes('999.99'))

  // Clean up
  await instance.dropDatabase('file_test_db')
})

test('should handle non-existent SQL file', async (t) => {
  const error = await t.throwsAsync(async () => {
    await instance.executeSqlFile('/path/to/non-existent-file.sql')
  })

  t.true(error.message.includes('SQL file execution failed'))
})

test('should reject empty file path', async (t) => {
  const error = await t.throwsAsync(async () => {
    await instance.executeSqlFile('')
  })

  t.true(error.message.includes('File path cannot be empty'))
})

test('should reject SQL file execution when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance()

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.executeSqlFile('./test.sql')
  })

  t.true(error.message.includes('PostgreSQL instance is not running'))
})
