/**
 * Performance benchmarks for database operations
 * Tests operation throughput and latency
 */

import test from 'ava'
import { initLogger, LogLevel } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { getPlatformConfig } from '../helpers/test-config.js'

// Initialize logger
initLogger(LogLevel.Info)

// Performance tests have longer timeout
test.serial.timeout = 300000 // 5 minutes

test.serial('Benchmark database creation', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    await startInstanceWithRetry(instance, config.maxRetries, config.startupTimeout)

    const iterations = 10
    const startTime = Date.now()

    for (let i = 0; i < iterations; i++) {
      await instance.createDatabase(`bench_create_db_${i}`)
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / iterations

    console.log(`Created ${iterations} databases in ${totalTime}ms (avg: ${avgTime.toFixed(2)}ms per database)`)

    t.log(`Database creation benchmark:`)
    t.log(`  - Total time: ${totalTime}ms`)
    t.log(`  - Average per database: ${avgTime.toFixed(2)}ms`)
    t.log(`  - Throughput: ${(iterations / (totalTime / 1000)).toFixed(2)} databases/sec`)

    // Cleanup
    for (let i = 0; i < iterations; i++) {
      await instance.dropDatabase(`bench_create_db_${i}`)
    }

    t.pass('Benchmark completed')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Benchmark database deletion', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    await startInstanceWithRetry(instance, config.maxRetries, config.startupTimeout)

    const iterations = 10

    // Create databases first
    for (let i = 0; i < iterations; i++) {
      await instance.createDatabase(`bench_drop_db_${i}`)
    }

    // Benchmark deletion
    const startTime = Date.now()

    for (let i = 0; i < iterations; i++) {
      await instance.dropDatabase(`bench_drop_db_${i}`)
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / iterations

    console.log(`Deleted ${iterations} databases in ${totalTime}ms (avg: ${avgTime.toFixed(2)}ms per database)`)

    t.log(`Database deletion benchmark:`)
    t.log(`  - Total time: ${totalTime}ms`)
    t.log(`  - Average per database: ${avgTime.toFixed(2)}ms`)
    t.log(`  - Throughput: ${(iterations / (totalTime / 1000)).toFixed(2)} databases/sec`)

    t.pass('Benchmark completed')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Benchmark database existence checks', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    await startInstanceWithRetry(instance, config.maxRetries, config.startupTimeout)

    // Create test databases
    const dbCount = 5
    for (let i = 0; i < dbCount; i++) {
      await instance.createDatabase(`bench_exists_db_${i}`)
    }

    // Benchmark existence checks
    const iterations = 50
    const startTime = Date.now()

    for (let i = 0; i < iterations; i++) {
      await instance.databaseExists(`bench_exists_db_${i % dbCount}`)
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / iterations

    console.log(`Performed ${iterations} existence checks in ${totalTime}ms (avg: ${avgTime.toFixed(2)}ms per check)`)

    t.log(`Database existence check benchmark:`)
    t.log(`  - Total time: ${totalTime}ms`)
    t.log(`  - Average per check: ${avgTime.toFixed(2)}ms`)
    t.log(`  - Throughput: ${(iterations / (totalTime / 1000)).toFixed(2)} checks/sec`)

    // Cleanup
    for (let i = 0; i < dbCount; i++) {
      await instance.dropDatabase(`bench_exists_db_${i}`)
    }

    t.pass('Benchmark completed')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Benchmark mixed operations', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    await startInstanceWithRetry(instance, config.maxRetries, config.startupTimeout)

    const iterations = 20
    const startTime = Date.now()

    for (let i = 0; i < iterations; i++) {
      const dbName = `bench_mixed_db_${i}`

      // Create
      await instance.createDatabase(dbName)

      // Check existence
      await instance.databaseExists(dbName)

      // Delete
      await instance.dropDatabase(dbName)

      // Check non-existence
      await instance.databaseExists(dbName)
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / iterations

    console.log(`Performed ${iterations} mixed operation cycles in ${totalTime}ms (avg: ${avgTime.toFixed(2)}ms per cycle)`)

    t.log(`Mixed operations benchmark:`)
    t.log(`  - Total time: ${totalTime}ms`)
    t.log(`  - Average per cycle: ${avgTime.toFixed(2)}ms`)
    t.log(`  - Throughput: ${(iterations / (totalTime / 1000)).toFixed(2)} cycles/sec`)

    t.pass('Benchmark completed')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Benchmark concurrent operations', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    await startInstanceWithRetry(instance, config.maxRetries, config.startupTimeout)

    const concurrency = 5
    const startTime = Date.now()

    // Create databases concurrently
    const createPromises = Array.from({ length: concurrency }, (_, i) =>
      instance.createDatabase(`bench_concurrent_db_${i}`)
    )
    await Promise.all(createPromises)

    // Check existence concurrently
    const existsPromises = Array.from({ length: concurrency }, (_, i) =>
      instance.databaseExists(`bench_concurrent_db_${i}`)
    )
    await Promise.all(existsPromises)

    // Delete concurrently
    const dropPromises = Array.from({ length: concurrency }, (_, i) =>
      instance.dropDatabase(`bench_concurrent_db_${i}`)
    )
    await Promise.all(dropPromises)

    const endTime = Date.now()
    const totalTime = endTime - startTime

    console.log(`Performed ${concurrency} concurrent operation cycles in ${totalTime}ms`)

    t.log(`Concurrent operations benchmark:`)
    t.log(`  - Concurrency level: ${concurrency}`)
    t.log(`  - Total time: ${totalTime}ms`)
    t.log(`  - Average per operation set: ${(totalTime / 3).toFixed(2)}ms`)

    t.pass('Benchmark completed')
  } finally {
    await cleanupTestInstance(instance)
  }
})
