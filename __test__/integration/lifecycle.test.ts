/**
 * Integration tests for PostgreSQL instance lifecycle
 * Tests complete start -> run -> stop workflow with real database operations
 */

import test from 'ava'
import { InstanceState, initLogger, LogLevel } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import {
  assertInstanceState,
  assertInstanceRunning,
  assertInstanceStopped,
  assertValidConnectionInfo,
  assertConnectionInfoThrowsWhenStopped,
} from '../helpers/test-assertions.js'
import { getTestTimeout } from '../helpers/test-config.js'

// Initialize logger for debugging
initLogger(LogLevel.Info)

// Set test timeout based on platform
test.serial.timeout = getTestTimeout()

test.serial('Complete lifecycle: create -> start -> stop -> cleanup', async (t) => {
  const instance = createTestInstance()

  try {
    // Initial state
    assertInstanceStopped(t, instance)

    // Start instance
    await startInstanceWithRetry(instance)
    assertInstanceRunning(t, instance)

    // Verify connection info is available
    assertValidConnectionInfo(t, instance)

    // Stop instance
    await instance.stopWithTimeout(30)
    assertInstanceStopped(t, instance)

    // Connection info should not be available after stopping
    assertConnectionInfoThrowsWhenStopped(t, instance)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Instance can be started with startWithTimeout', async (t) => {
  const instance = createTestInstance()

  try {
    assertInstanceState(t, instance, InstanceState.Stopped)

    await instance.startWithTimeout(60)

    assertInstanceRunning(t, instance)
    assertValidConnectionInfo(t, instance)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Instance can be started with start method', async (t) => {
  const instance = createTestInstance()

  try {
    assertInstanceState(t, instance, InstanceState.Stopped)

    await instance.start()

    assertInstanceRunning(t, instance)
    assertValidConnectionInfo(t, instance)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Instance can be stopped with stopWithTimeout', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)
    assertInstanceRunning(t, instance)

    await instance.stopWithTimeout(30)

    assertInstanceStopped(t, instance)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Instance can be stopped with stop method', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)
    assertInstanceRunning(t, instance)

    await instance.stop()

    assertInstanceStopped(t, instance)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Instance cleanup is safe to call multiple times', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)
    await instance.stopWithTimeout(30)

    // Cleanup multiple times should not throw
    t.notThrows(() => instance.cleanup())
    t.notThrows(() => instance.cleanup())
    t.notThrows(() => instance.cleanup())
  } finally {
    // Final cleanup
    instance.cleanup()
  }
})

test.serial('Instance health check works correctly', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    t.true(instance.isHealthy(), 'Instance should be healthy after startup')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Connection info provides all required fields', async (t) => {
  const instance = createTestInstance({
    username: 'lifecycleuser',
    password: 'lifecyclepass',
  })

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    t.is(info.host, 'localhost', 'Host should be localhost')
    t.true(info.port > 0, 'Port should be positive')
    t.is(info.username, 'lifecycleuser', 'Username should match')
    t.is(info.databaseName, 'postgres', 'Database name should be postgres (default)')
    t.truthy(info.password, 'Password should be available')

    // Test safe connection string (password masked)
    const safeConnStr = info.safeConnectionString()
    t.false(safeConnStr.includes('lifecyclepass'), 'Safe connection string should not contain password')
    t.true(safeConnStr.includes('***'), 'Safe connection string should mask password')

    // Test JDBC URL
    const jdbcUrl = info.jdbcUrl()
    t.true(jdbcUrl.startsWith('jdbc:postgresql://'), 'JDBC URL should have correct prefix')
    t.true(jdbcUrl.includes('postgres'), 'JDBC URL should include database name')
  } finally {
    await cleanupTestInstance(instance)
  }
})
