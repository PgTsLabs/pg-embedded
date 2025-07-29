import test from 'ava'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// Initialize logger
initLogger(LogLevel.Info)

// Helper function: Safely stop instance
async function safeStopInstance(instance: PostgresInstance, timeoutSeconds = 30) {
  try {
    if (instance.state === InstanceState.Running) {
      await instance.stopWithTimeout(timeoutSeconds)
    }
  } catch (error) {
    console.warn(`Error stopping instance: ${error}`)
  }
}

// Helper function: Safely cleanup instance
function safeCleanupInstance(instance: PostgresInstance) {
  try {
    instance.cleanup()
  } catch (error) {
    console.warn(`Error cleaning up instance: ${error}`)
  }
}

test.serial('Error handling: Invalid configuration', (t) => {
  // Test invalid port number
  t.throws(() => {
    new PostgresInstance({
      port: -1,
      username: 'testuser',
      password: 'testpass',
    })
  })

  t.throws(() => {
    new PostgresInstance({
      port: 70000, // Port number out of valid range
      username: 'testuser',
      password: 'testpass',
    })
  })

  // Test empty username
  t.throws(() => {
    new PostgresInstance({
      port: 5443,
      username: '',
      password: 'testpass',
    })
  })
})

test.serial('Error handling: Repeated start/stop operations', async (t) => {
  const instance = new PostgresInstance({
    port: 5444,
    username: 'repeatuser',
    password: 'repeatpass',
    persistent: false,
    timeout: 60,
  })

  try {
    // Normal startup process
    await instance.startWithTimeout(60)
    t.is(instance.state, InstanceState.Running)

    // Repeated start should fail
    await t.throwsAsync(async () => {
      await instance.startWithTimeout(60)
    })

    // Normal stop
    await safeStopInstance(instance)
    t.is(instance.state, InstanceState.Stopped)

    // Repeated stop should fail
    await t.throwsAsync(async () => {
      await instance.stopWithTimeout(30)
    })

    // Database operations should fail when instance is stopped
    await t.throwsAsync(async () => {
      await instance.createDatabase('should_fail_db')
    })
  } finally {
    instance.cleanup()
  }
})

test.serial('Error handling: Database operations on stopped instance', async (t) => {
  const instance = new PostgresInstance({
    port: 5445,
    username: 'stoppeduser',
    password: 'stoppedpass',
    persistent: false,
    timeout: 60,
  })

  try {
    // Database operations should fail when instance is stopped
    await t.throwsAsync(async () => {
      await instance.createDatabase('should_fail_db')
    })

    await t.throwsAsync(async () => {
      await instance.databaseExists('any_db')
    })

    await t.throwsAsync(async () => {
      await instance.dropDatabase('any_db')
    })
  } finally {
    instance.cleanup()
  }
})

test.serial('Error handling: Duplicate database creation', async (t) => {
  const instance = new PostgresInstance({
    port: 5446,
    username: 'duplicateuser',
    password: 'duplicatepass',
    persistent: false,
    timeout: 60,
  })

  try {
    await instance.startWithTimeout(60)

    // Create database
    await instance.createDatabase('duplicate_test_db')

    // Attempt to create database with same name should fail
    await t.throwsAsync(async () => {
      await instance.createDatabase('duplicate_test_db')
    })

    // Cleanup
    await instance.dropDatabase('duplicate_test_db')
    await safeStopInstance(instance)
  } finally {
    safeCleanupInstance(instance)
  }
})

test.serial('Error handling: Connection info access when stopped', (t) => {
  const instance = new PostgresInstance({
    port: 5447,
    username: 'connectionuser',
    password: 'connectionpass',
    persistent: false,
  })

  try {
    // Accessing connection info should fail when stopped
    t.throws(() => {
      instance.connectionInfo
    })
  } finally {
    instance.cleanup()
  }
})

test.serial('Error handling: Health check on stopped instance', (t) => {
  const instance = new PostgresInstance({
    port: 5448,
    username: 'healthuser',
    password: 'healthpass',
    persistent: false,
  })

  try {
    // Should be unhealthy when stopped
    t.is(instance.isHealthy(), false)
  } finally {
    instance.cleanup()
  }
})
