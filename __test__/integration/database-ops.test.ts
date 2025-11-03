/**
 * Integration tests for database operations
 * Tests database creation, deletion, and existence checks
 */

import test from 'ava'
import { initLogger, LogLevel } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { assertDatabaseExists, assertThrowsAsync } from '../helpers/test-assertions.js'
import { getTestTimeout } from '../helpers/test-config.js'

// Initialize logger
initLogger(LogLevel.Info)

// Set test timeout
test.serial.timeout = getTestTimeout()

test.serial('Default database exists after startup', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await assertDatabaseExists(t, instance, 'postgres', true)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Can create a new database', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Create database
    await instance.createDatabase('test_create_db')

    // Verify it exists
    await assertDatabaseExists(t, instance, 'test_create_db', true)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Can delete a database', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Create database
    await instance.createDatabase('test_delete_db')
    await assertDatabaseExists(t, instance, 'test_delete_db', true)

    // Delete database
    await instance.dropDatabase('test_delete_db')

    // Verify it no longer exists
    await assertDatabaseExists(t, instance, 'test_delete_db', false)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Can check if database exists', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Check existing database
    const existsDefault = await instance.databaseExists('postgres')
    t.true(existsDefault, 'Default database should exist')

    // Check non-existent database
    const existsNonExistent = await instance.databaseExists('nonexistent_db_12345')
    t.false(existsNonExistent, 'Non-existent database should not exist')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Creating duplicate database throws error', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Create database
    await instance.createDatabase('test_duplicate_db')

    // Attempt to create again should throw
    await assertThrowsAsync(t, async () => {
      await instance.createDatabase('test_duplicate_db')
    })
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Deleting non-existent database does not throw', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // PostgreSQL DROP DATABASE IF EXISTS does not throw error
    await t.notThrowsAsync(async () => {
      await instance.dropDatabase('nonexistent_db_67890')
    })
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Can create multiple databases', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const dbNames = ['test_multi_db1', 'test_multi_db2', 'test_multi_db3']

    // Create all databases
    for (const dbName of dbNames) {
      await instance.createDatabase(dbName)
    }

    // Verify all exist
    for (const dbName of dbNames) {
      await assertDatabaseExists(t, instance, dbName, true)
    }

    // Cleanup
    for (const dbName of dbNames) {
      await instance.dropDatabase(dbName)
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Database operations work with custom database name', async (t) => {
  const instance = createTestInstance({
    databaseName: 'custom_default_db',
  })

  try {
    await startInstanceWithRetry(instance)

    // Default database should still exist
    await assertDatabaseExists(t, instance, 'postgres', true)

    // Can create new database
    await instance.createDatabase('test_custom_db')
    await assertDatabaseExists(t, instance, 'test_custom_db', true)

    // Can delete database
    await instance.dropDatabase('test_custom_db')
    await assertDatabaseExists(t, instance, 'test_custom_db', false)
  } finally {
    await cleanupTestInstance(instance)
  }
})
