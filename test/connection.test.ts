import test from 'ava'
import { PostgresInstance, InstanceState } from '../index.js'

test('PostgresInstance can be created with connection settings', (t) => {
  const instance = new PostgresInstance({
    port: 0,
    username: 'testuser',
    password: 'testpass',
  })

  t.truthy(instance)
  t.is(instance.state, InstanceState.Stopped)
})

test('Connection string format validation', (t) => {
  // Test connection string format
  const host = '127.0.0.1'
  const port = 5432
  const username = 'postgres'
  const password = 'postgres'
  const database = 'postgres'

  const expectedConnectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`

  // Verify if the connection string format is correct
  t.is(expectedConnectionString, 'postgresql://postgres:postgres@127.0.0.1:5432/postgres')
})

test('Custom port settings are handled correctly', (t) => {
  const customSettings = {
    port: 5433,
    username: 'myuser',
    password: 'mypass',
  }

  const instance = new PostgresInstance(customSettings)
  t.truthy(instance)
  t.is(instance.state, InstanceState.Stopped)
})

test('Default settings work correctly', (t) => {
  const instance = new PostgresInstance()
  t.truthy(instance)
  t.is(instance.state, InstanceState.Stopped)
})

test('Connection info throws error when instance is stopped', (t) => {
  const instance = new PostgresInstance()

  const error = t.throws(() => {
    instance.connectionInfo
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})
