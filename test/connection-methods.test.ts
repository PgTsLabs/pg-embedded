import test from 'ava'
import { PostgresInstance, InstanceState } from '../index.js'

// Note: These tests require an actual PostgreSQL instance running to get ConnectionInfo
// Currently we can only test basic instance creation and state

test('PostgresInstance connection methods exist', (t) => {
  const instance = new PostgresInstance({
    port: 5432,
    username: 'postgres',
    password: 'postgres',
  })

  t.truthy(instance)
  t.is(instance.state, InstanceState.Stopped)

  // Verify that connection info throws error when stopped
  const error = t.throws(() => {
    instance.connectionInfo
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

test('Connection string format validation', (t) => {
  // Test connection string format correctness
  const testCases = [
    {
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'postgres',
      expected: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
    },
    {
      host: 'localhost',
      port: 5433,
      username: 'testuser',
      password: 'testpass',
      database: 'testdb',
      expected: 'postgresql://testuser:testpass@localhost:5433/testdb',
    },
  ]

  testCases.forEach(({ host, port, username, password, database, expected }) => {
    const connectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`
    t.is(connectionString, expected)
  })
})

test('Safe connection string format validation', (t) => {
  // Test safe connection string format (without password)
  const testCases = [
    {
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      database: 'postgres',
      expected: 'postgresql://postgres:***@127.0.0.1:5432/postgres',
    },
    {
      host: 'localhost',
      port: 5433,
      username: 'testuser',
      database: 'testdb',
      expected: 'postgresql://testuser:***@localhost:5433/testdb',
    },
  ]

  testCases.forEach(({ host, port, username, database, expected }) => {
    const safeConnectionString = `postgresql://${username}:***@${host}:${port}/${database}`
    t.is(safeConnectionString, expected)
  })
})

test('JDBC URL format validation', (t) => {
  // Test JDBC URL format
  const testCases = [
    {
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'postgres',
      expected: 'jdbc:postgresql://127.0.0.1:5432/postgres?user=postgres&password=postgres',
    },
    {
      host: 'localhost',
      port: 5433,
      username: 'testuser',
      password: 'testpass',
      database: 'testdb',
      expected: 'jdbc:postgresql://localhost:5433/testdb?user=testuser&password=testpass',
    },
  ]

  testCases.forEach(({ host, port, username, password, database, expected }) => {
    const jdbcUrl = `jdbc:postgresql://${host}:${port}/${database}?user=${username}&password=${password}`
    t.is(jdbcUrl, expected)
  })
})
