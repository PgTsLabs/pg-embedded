/**
 * Unit tests for PostgresInstance basic functionality
 * Tests instance creation, configuration, and state management without starting the database
 */

import test from 'ava'
import { PostgresInstance, InstanceState } from '../../index.js'
import { assertInstanceState, assertConnectionInfoThrowsWhenStopped } from '../helpers/test-assertions.js'

test('PostgresInstance can be created with default settings', (t) => {
  const instance = new PostgresInstance()

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('PostgresInstance can be created with custom settings', (t) => {
  const instance = new PostgresInstance({
    port: 5433,
    username: 'testuser',
    password: 'testpass',
    databaseName: 'testdb',
    persistent: false,
  })

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('PostgresInstance can be created with minimal settings', (t) => {
  const instance = new PostgresInstance({
    port: 5434,
  })

  t.truthy(instance, 'Instance should be created')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('PostgresInstance throws error when getting connection info while stopped', (t) => {
  const instance = new PostgresInstance()
  assertConnectionInfoThrowsWhenStopped(t, instance)
})

test('PostgresInstance state is Stopped initially', (t) => {
  const instance = new PostgresInstance()
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('PostgresInstance accepts port 0 for auto-assignment', (t) => {
  const instance = new PostgresInstance({ port: 0 })

  t.truthy(instance, 'Instance should be created with port 0')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('PostgresInstance accepts custom timeout settings', (t) => {
  const instance = new PostgresInstance({
    timeout: 120,
    setup_timeout: 300,
  })

  t.truthy(instance, 'Instance should be created with custom timeouts')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('PostgresInstance can be created with persistent mode', (t) => {
  const instance = new PostgresInstance({
    persistent: true,
  })

  t.truthy(instance, 'Instance should be created in persistent mode')
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('PostgresInstance can be created with non-persistent mode', (t) => {
  const instance = new PostgresInstance({
    persistent: false,
  })

  t.truthy(instance, 'Instance should be created in non-persistent mode')
  assertInstanceState(t, instance, InstanceState.Stopped)
})
