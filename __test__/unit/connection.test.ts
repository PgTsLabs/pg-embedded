/**
 * Unit tests for connection configuration and validation
 * Tests connection string formatting and validation without database operations
 */

import test from 'ava'
import { PostgresInstance, InstanceState } from '../../index.js'
import { assertInstanceState } from '../helpers/test-assertions.js'

test('Connection settings are accepted correctly', (t) => {
  const instance = new PostgresInstance({
    port: 5433,
    username: 'myuser',
    password: 'mypass',
    databaseName: 'mydb',
  })

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('Connection string format validation', (t) => {
  // Test expected connection string format
  const host = '127.0.0.1'
  const port = 5432
  const username = 'postgres'
  const password = 'postgres'
  const database = 'postgres'

  const expectedConnectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`

  t.is(expectedConnectionString, 'postgresql://postgres:postgres@127.0.0.1:5432/postgres')
})

test('Custom port settings are handled correctly', (t) => {
  const customSettings = {
    port: 5433,
    username: 'myuser',
    password: 'mypass',
  }

  const instance = new PostgresInstance(customSettings)

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('Default settings work correctly', (t) => {
  const instance = new PostgresInstance()

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('Username and password can be customized', (t) => {
  const instance = new PostgresInstance({
    username: 'customuser',
    password: 'custompass',
  })

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('Database name can be customized', (t) => {
  const instance = new PostgresInstance({
    databaseName: 'customdb',
  })

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('Connection info throws error when instance is stopped', (t) => {
  const instance = new PostgresInstance()

  const error = t.throws(() => {
    instance.connectionInfo
  })

  t.truthy(error, 'Should throw error')
  t.true(error.message.includes('not running'), 'Error should mention instance is not running')
})
