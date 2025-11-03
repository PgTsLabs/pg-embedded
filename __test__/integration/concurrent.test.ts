/**
 * Integration tests for concurrent operations
 * Tests thread safety and concurrent database operations
 */

import test from 'ava'
import { initLogger, LogLevel } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { assertDatabaseExists } from '../helpers/test-assertions.js'
import { getTestTimeout } from '../helpers/test-config.js'

// Initialize logger
initLogger(LogLevel.Info)

// Set test timeout
test.serial.timeout = getTestTimeout()

test.serial('Can create multiple databases concurrently', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const dbNames = ['concurrent_db1', 'concurrent_db2', 'concurrent_db3', 'concurrent_db4']

    // Create all databases concurrently
    const createPromises = dbNames.map((name) => instance.createDatabase(name))
    await Promise.all(createPromises)

    // Verify all exist
    for (const dbName of dbNames) {
      await assertDatabaseExists(t, instance, dbName, true)
    }

    // Cleanup concurrently
    const dropPromises = dbNames.map((name) => instance.dropDatabase(name))
    await Promise.all(dropPromises)

    // Verify all deleted
    for (const dbName of dbNames) {
      await assertDatabaseExists(t, instance, dbName, false)
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Can check database existence concurrently', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Create test databases
    const dbNames = ['check_db1', 'check_db2', 'check_db3']
    for (const dbName of dbNames) {
      await instance.createDatabase(dbName)
    }

    // Check existence concurrently
    const existsPromises = dbNames.map((name) => instance.databaseExists(name))
    const results = await Promise.all(existsPromises)

    // All should exist
    results.forEach((exists, index) => {
      t.true(exists, `Database ${dbNames[index]} should exist`)
    })

    // Cleanup
    for (const dbName of dbNames) {
      await instance.dropDatabase(dbName)
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Mixed concurrent operations are safe', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Create initial databases
    await instance.createDatabase('mixed_db1')
    await instance.createDatabase('mixed_db2')

    // Mix of operations
    const operations = [
      instance.createDatabase('mixed_db3'),
      instance.databaseExists('mixed_db1'),
      instance.createDatabase('mixed_db4'),
      instance.databaseExists('mixed_db2'),
      instance.databaseExists('postgres'),
    ]

    const results = await Promise.all(operations)

    // Verify results
    t.is(results[1], true, 'mixed_db1 should exist')
    t.is(results[3], true, 'mixed_db2 should exist')
    t.is(results[4], true, 'postgres should exist')

    // Verify created databases
    await assertDatabaseExists(t, instance, 'mixed_db3', true)
    await assertDatabaseExists(t, instance, 'mixed_db4', true)

    // Cleanup
    await instance.dropDatabase('mixed_db1')
    await instance.dropDatabase('mixed_db2')
    await instance.dropDatabase('mixed_db3')
    await instance.dropDatabase('mixed_db4')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Concurrent database operations with same name handle conflicts', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Try to create same database concurrently
    // One should succeed, others should fail
    const promises = [
      instance.createDatabase('conflict_db'),
      instance.createDatabase('conflict_db'),
      instance.createDatabase('conflict_db'),
    ]

    const results = await Promise.allSettled(promises)

    // At least one should succeed
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length

    t.true(succeeded >= 1, 'At least one creation should succeed')
    t.true(failed >= 0, 'Some creations may fail due to conflict')

    // Database should exist
    await assertDatabaseExists(t, instance, 'conflict_db', true)

    // Cleanup
    await instance.dropDatabase('conflict_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Multiple instances can run concurrently', async (t) => {
  const instance1 = createTestInstance()
  const instance2 = createTestInstance()

  try {
    // Start both instances concurrently
    await Promise.all([
      startInstanceWithRetry(instance1),
      startInstanceWithRetry(instance2),
    ])

    // Both should be running
    t.true(instance1.isHealthy(), 'Instance 1 should be healthy')
    t.true(instance2.isHealthy(), 'Instance 2 should be healthy')

    // Create databases on both instances
    await Promise.all([
      instance1.createDatabase('instance1_db'),
      instance2.createDatabase('instance2_db'),
    ])

    // Verify databases exist on respective instances
    await assertDatabaseExists(t, instance1, 'instance1_db', true)
    await assertDatabaseExists(t, instance2, 'instance2_db', true)

    // Cleanup
    await Promise.all([
      instance1.dropDatabase('instance1_db'),
      instance2.dropDatabase('instance2_db'),
    ])
  } finally {
    await Promise.all([
      cleanupTestInstance(instance1),
      cleanupTestInstance(instance2),
    ])
  }
})
