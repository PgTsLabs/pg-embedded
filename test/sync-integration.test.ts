import test from 'ava'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// Initialize logger
initLogger(LogLevel.Info)

// Helper function: safely stop instance
async function safeStopInstance(instance: PostgresInstance, timeoutSeconds = 30) {
  try {
    if (instance.state === InstanceState.Running) {
      await instance.stopWithTimeout(timeoutSeconds)
    }
  } catch (error) {
    console.warn(`Error stopping instance: ${error}`)
  }
}

test.serial('Complete sync workflow: setup -> start -> database operations -> stop', (t) => {
  const instance = new PostgresInstance({
    port: 5438,
    username: 'syncuser',
    password: 'syncpass',
    persistent: false,
    timeout: 60,
  })

  try {
    // Initial state should be stopped
    t.is(instance.state, InstanceState.Stopped)

    // Direct start (will automatically setup)
    instance.startSync()
    t.is(instance.state, InstanceState.Running)

    // Verify connection info is available
    const connectionInfo = instance.connectionInfo
    t.truthy(connectionInfo)
    t.truthy(connectionInfo.connectionString)
    t.truthy(connectionInfo.safeConnectionString)
    t.truthy(connectionInfo.jdbcUrl)
    t.is(connectionInfo.host, 'localhost')
    t.is(connectionInfo.port, 5438)
    t.is(connectionInfo.username, 'syncuser')
    t.is(connectionInfo.databaseName, 'postgres')

    // 3. Database operations
    // Check if default database exists
    const defaultExists = instance.databaseExistsSync('postgres')
    t.is(defaultExists, true)

    // Create new database
    instance.createDatabaseSync('test_sync_db')
    const newDbExists = instance.databaseExistsSync('test_sync_db')
    t.is(newDbExists, true)

    // Drop database
    instance.dropDatabaseSync('test_sync_db')
    const deletedDbExists = instance.databaseExistsSync('test_sync_db')
    t.is(deletedDbExists, false)

    // 4. Stop phase
    instance.stopSync()
    t.is(instance.state, InstanceState.Stopped)

    // Connection info should not be available after stopping
    const error = t.throws(() => {
      instance.connectionInfo
    })
    t.truthy(error)
    t.true(error.message.includes('not running'))
  } finally {
    // Ensure cleanup
    instance.cleanup()
  }
})

test.serial('Sync exception throwing behavior', (t) => {
  const instance = new PostgresInstance({
    port: 5439,
    username: 'exceptionuser',
    password: 'exceptionpass',
    persistent: false,
  })

  try {
    // startSync() will automatically call setupSync(), so it won't fail
    instance.startSync()
    t.is(instance.state, InstanceState.Running)

    // Attempting to create an existing database should throw an exception
    instance.createDatabaseSync('exception_test_db')
    t.throws(() => {
      instance.createDatabaseSync('exception_test_db')
    })

    // Attempting to drop a non-existent database (PostgreSQL will skip, won't throw error)
    instance.dropDatabaseSync('nonexistent_sync_db') // This won't throw an error

    // Cleanup
    instance.dropDatabaseSync('exception_test_db')
    instance.stopSync()
  } finally {
    instance.cleanup()
  }
})

test.serial('Sync and async method consistency', async (t) => {
  const syncInstance = new PostgresInstance({
    port: 5440,
    username: 'consistencyuser1',
    password: 'consistencypass1',
    persistent: false,
  })

  const asyncInstance = new PostgresInstance({
    port: 5441,
    username: 'consistencyuser2',
    password: 'consistencypass2',
    persistent: false,
  })

  try {
    // Sync setup
    syncInstance.startSync()

    // Async setup
    await asyncInstance.start()

    // Verify both instances are running
    t.is(syncInstance.state, InstanceState.Running)
    t.is(asyncInstance.state, InstanceState.Running)

    // Sync database creation
    syncInstance.createDatabaseSync('consistency_sync_db')
    const syncDbExists = syncInstance.databaseExistsSync('consistency_sync_db')
    t.is(syncDbExists, true)

    // Async database creation
    await asyncInstance.createDatabase('consistency_async_db')
    const asyncDbExists = await asyncInstance.databaseExists('consistency_async_db')
    t.is(asyncDbExists, true)

    // Verify connection info format consistency
    const syncConnectionInfo = syncInstance.connectionInfo
    const asyncConnectionInfo = asyncInstance.connectionInfo

    t.is(typeof syncConnectionInfo.connectionString, 'string')
    t.is(typeof asyncConnectionInfo.connectionString, 'string')
    t.is(typeof syncConnectionInfo.safeConnectionString(), 'string')
    t.is(typeof asyncConnectionInfo.safeConnectionString(), 'string')
    t.is(typeof syncConnectionInfo.jdbcUrl(), 'string')
    t.is(typeof asyncConnectionInfo.jdbcUrl(), 'string')

    // Cleanup databases
    syncInstance.dropDatabaseSync('consistency_sync_db')
    await asyncInstance.dropDatabase('consistency_async_db')

    // Stop instances
    syncInstance.stopSync()
    await safeStopInstance(asyncInstance)

    // Verify both instances are stopped
    t.is(syncInstance.state, InstanceState.Stopped)
    t.is(asyncInstance.state, InstanceState.Stopped)
  } finally {
    syncInstance.cleanup()
    asyncInstance.cleanup()
  }
})

test.serial('Sync method correctness validation', (t) => {
  const instance = new PostgresInstance({
    port: 5442,
    username: 'validationuser',
    password: 'validationpass',
    persistent: false,
  })

  try {
    // Validate sync method return type
    instance.startSync()
    t.is(instance.state, InstanceState.Running)

    // Validate database operation returns
    const dbName = 'validation_test_db'

    // createDatabaseSync should return undefined
    const createResult = instance.createDatabaseSync(dbName)
    t.is(createResult, undefined)

    // databaseExistsSync should return boolean
    const existsResult = instance.databaseExistsSync(dbName)
    t.is(typeof existsResult, 'boolean')
    t.is(existsResult, true)

    // dropDatabaseSync should return undefined
    const dropResult = instance.dropDatabaseSync(dbName)
    t.is(dropResult, undefined)

    // Verify database has been deleted
    const deletedExistsResult = instance.databaseExistsSync(dbName)
    t.is(typeof deletedExistsResult, 'boolean')
    t.is(deletedExistsResult, false)

    // stopSync should return undefined
    const stopResult = instance.stopSync()
    t.is(stopResult, undefined)
    t.is(instance.state, InstanceState.Stopped)
  } finally {
    instance.cleanup()
  }
})
