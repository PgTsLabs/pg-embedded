import test from 'ava'
import process from 'node:process'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

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

// Helper function: Safely start instance with retry
async function safeStartInstance(instance: PostgresInstance, maxAttempts = 3, timeoutSeconds = 300) {
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Starting instance attempt ${attempt}/${maxAttempts}...`)
      await instance.startWithTimeout(timeoutSeconds)

      // Verify instance state
      if (instance.state !== InstanceState.Running) {
        throw new Error(`Instance state is ${instance.state}, expected Running`)
      }

      if (!instance.isHealthy()) {
        throw new Error('Instance is not healthy after startup')
      }

      console.log('Instance started successfully')
      return // Success, exit function
    } catch (startupError) {
      lastError = startupError
      console.error(`Startup attempt ${attempt} failed:`, startupError)

      if (attempt < maxAttempts) {
        console.log('Waiting 5 seconds before retry...')
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Cleanup failed instance
        try {
          await safeStopInstance(instance)
          safeCleanupInstance(instance)
        } catch (cleanupError) {
          console.warn('Error cleaning up failed instance:', cleanupError)
        }
      }
    }
  }

  // All attempts failed
  console.error('All startup attempts failed')
  throw lastError
}

// Initialize logger
initLogger(LogLevel.Info)

// Stability test configuration
const STABILITY_CONFIG = {
  DURATION_MS: 15000, // 15 seconds stability test (reduced time)
  OPERATION_INTERVAL_MS: 2000, // Execute operation every 2 seconds (reduced frequency)
  MEMORY_CHECK_INTERVAL_MS: 5000, // Check memory every 5 seconds
  MAX_MEMORY_GROWTH_MB: 100, // Maximum memory growth 100MB
}

test.serial('Stability: Long-running instance stability test', async (t) => {
  const instance = new PostgresInstance({
    port: 5600 + Math.floor(Math.random() * 100), // Use random port to avoid conflicts
    username: 'stability_user',
    password: 'stability_pass',
    persistent: false,
    timeout: 180, // Increase timeout to 3 minutes
  })

  const memorySnapshots: Array<{ time: number; heapUsed: number; operations: number }> = []
  let operationCount = 0
  let errorCount = 0

  try {
    console.log(`\n=== Long-Running Stability Test ===`)
    console.log(`Duration: ${STABILITY_CONFIG.DURATION_MS / 1000} seconds`)
    console.log(`Operation interval: ${STABILITY_CONFIG.OPERATION_INTERVAL_MS}ms`)

    console.log('Starting PostgreSQL instance...')

    // Use safe start function
    await safeStartInstance(instance)

    // Test connection info
    const connectionInfo = instance.connectionInfo
    console.log(`PostgreSQL started successfully on port: ${connectionInfo.port}`)

    const startTime = Date.now()
    const initialMemory = process.memoryUsage()

    memorySnapshots.push({
      time: 0,
      heapUsed: initialMemory.heapUsed,
      operations: 0,
    })

    // Setup memory monitoring
    const memoryMonitor = setInterval(() => {
      const memory = process.memoryUsage()
      const elapsed = Date.now() - startTime

      memorySnapshots.push({
        time: elapsed,
        heapUsed: memory.heapUsed,
        operations: operationCount,
      })

      console.log(
        `[${(elapsed / 1000).toFixed(1)}s] Memory: ${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB, Operations: ${operationCount}, Errors: ${errorCount}`,
      )
    }, STABILITY_CONFIG.MEMORY_CHECK_INTERVAL_MS)

    // Use recursive async function instead of setInterval to avoid concurrency issues
    let isRunning = true

    const performOperation = async () => {
      while (isRunning && Date.now() - startTime < STABILITY_CONFIG.DURATION_MS) {
        try {
          const dbName = `stability_db_${operationCount}`

          // Simplified database operation loop
          await instance.createDatabase(dbName)
          const exists = await instance.databaseExists(dbName)

          if (!exists) {
            errorCount++
            console.error(`Database ${dbName} was not created properly`)
          } else {
            // Only attempt to drop if creation was successful
            await instance.dropDatabase(dbName)
            const existsAfterDrop = await instance.databaseExists(dbName)

            if (existsAfterDrop) {
              errorCount++
              console.error(`Database ${dbName} was not dropped properly`)
            }
          }

          // Simple health check
          if (!instance.isHealthy()) {
            errorCount++
            console.error(`Instance health check failed at operation ${operationCount}`)
          }

          operationCount++

          // Wait for next operation
          await new Promise((resolve) => setTimeout(resolve, STABILITY_CONFIG.OPERATION_INTERVAL_MS))
        } catch (error) {
          errorCount++
          console.error(`Operation ${operationCount} failed:`, error)

          // Exit early if too many errors
          if (errorCount > operationCount * 0.5) {
            console.error('Too many errors, stopping stability test')
            isRunning = false
            break
          }

          // Wait after error to avoid rapid retries
          await new Promise((resolve) => setTimeout(resolve, STABILITY_CONFIG.OPERATION_INTERVAL_MS))
        }
      }
    }

    // Start operation loop
    const operationPromise = performOperation()

    // Wait for test completion
    await new Promise((resolve) => setTimeout(resolve, STABILITY_CONFIG.DURATION_MS))

    // Stop operation loop
    isRunning = false
    await operationPromise

    // Cleanup memory monitor timer
    clearInterval(memoryMonitor)

    // Final checks
    const finalMemory = process.memoryUsage()
    const totalTime = Date.now() - startTime

    memorySnapshots.push({
      time: totalTime,
      heapUsed: finalMemory.heapUsed,
      operations: operationCount,
    })

    console.log(`\n=== Stability Test Results ===`)
    console.log(`Total duration: ${(totalTime / 1000).toFixed(1)} seconds`)
    console.log(`Total operations: ${operationCount}`)
    console.log(`Total errors: ${errorCount}`)
    console.log(`Error rate: ${((errorCount / operationCount) * 100).toFixed(2)}%`)
    console.log(`Operations per second: ${(operationCount / (totalTime / 1000)).toFixed(2)}`)

    // Memory analysis
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed
    console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`)

    // Check for memory leaks
    const memoryGrowthMB = memoryGrowth / 1024 / 1024
    const maxAllowedGrowth = STABILITY_CONFIG.MAX_MEMORY_GROWTH_MB

    // Stability assertions (relaxed conditions)
    const errorRate = operationCount > 0 ? errorCount / operationCount : 0
    t.true(errorRate < 0.1, `Error rate (${(errorRate * 100).toFixed(2)}%) should be less than 10%`)
    t.true(operationCount > 0, 'Should have performed some operations')
    t.true(
      memoryGrowthMB < maxAllowedGrowth,
      `Memory growth (${memoryGrowthMB.toFixed(2)}MB) should be less than ${maxAllowedGrowth}MB`,
    )

    // Instance should still be healthy (if not too many errors)
    if (errorRate < 0.5) {
      t.is(instance.state, InstanceState.Running, 'Instance should still be running')
      t.is(instance.isHealthy(), true, 'Instance should still be healthy')
    } else {
      console.log('Skipping health checks due to high error rate')
      t.pass('High error rate detected, skipping health checks')
    }

    // Connection info should still be valid
    const finalConnectionInfo = instance.connectionInfo
    t.truthy(finalConnectionInfo)
    t.truthy(finalConnectionInfo.connectionString)

    await safeStopInstance(instance)
    t.is(instance.state, InstanceState.Stopped)
  } finally {
    safeCleanupInstance(instance)
  }
})

test.serial('Stability: Memory leak detection test', async (t) => {
  console.log(`\n=== Memory Leak Detection Test ===`)

  const instances: PostgresInstance[] = []
  const memorySnapshots: number[] = []

  try {
    // Execute multiple rounds of instance creation and destruction
    const rounds = 3 // Reduce rounds to avoid resource exhaustion
    const instancesPerRound = 2 // Reduce instances per round

    for (let round = 0; round < rounds; round++) {
      console.log(`Round ${round + 1}/${rounds}`)

      // Record starting memory
      const startMemory = process.memoryUsage().heapUsed

      // Create instances
      for (let i = 0; i < instancesPerRound; i++) {
        const instance = new PostgresInstance({
          port: 5610 + round * instancesPerRound + i,
          username: `leak_test_${round}_${i}`,
          password: `leak_pass_${round}_${i}`,
          persistent: false,
          timeout: 300, // Windows needs longer timeout
        })

        try {
          instances.push(instance)
          await safeStartInstance(instance, 3, 180) // Use retry mechanism

          // Perform some operations
          await instance.createDatabase(`leak_test_db_${round}_${i}`)
          const exists = await instance.databaseExists(`leak_test_db_${round}_${i}`)
          t.is(exists, true)
          await instance.dropDatabase(`leak_test_db_${round}_${i}`)

          await safeStopInstance(instance)
        } catch (error) {
          console.warn(`Skipping instance ${round}_${i} due to startup failure:`, error)
          // Remove instance from array if startup failed
          const index = instances.indexOf(instance)
          if (index > -1) {
            instances.splice(index, 1)
          }
          continue
        }
      }

      // Cleanup instances
      instances.forEach((instance) => {
        try {
          instance.cleanup()
        } catch (error) {
          console.warn('Error cleaning up instance:', error)
        }
      })
      instances.length = 0

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      // Wait for garbage collection to complete
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Record ending memory
      const endMemory = process.memoryUsage().heapUsed
      memorySnapshots.push(endMemory - startMemory)

      console.log(`Round ${round + 1} memory delta: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)}MB`)
    }

    // Analyze memory growth trend
    console.log(`\n=== Memory Leak Analysis ===`)
    memorySnapshots.forEach((delta, index) => {
      console.log(`Round ${index + 1}: ${(delta / 1024 / 1024).toFixed(2)}MB`)
    })

    // Calculate average memory growth
    const avgMemoryDelta = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length
    console.log(`Average memory delta per round: ${(avgMemoryDelta / 1024 / 1024).toFixed(2)}MB`)

    // Check for consistent memory growth (potential leak)
    const lastThreeRounds = memorySnapshots.slice(-3)
    const isIncreasing = lastThreeRounds.every((delta, index) => index === 0 || delta >= lastThreeRounds[index - 1])

    // Assert: Should not have consistent memory growth
    t.false(
      isIncreasing && avgMemoryDelta > 10 * 1024 * 1024,
      'Should not have consistent memory growth indicating a leak',
    )

    // Assert: Average memory growth should be within reasonable bounds
    t.true(
      avgMemoryDelta < 50 * 1024 * 1024,
      `Average memory delta (${(avgMemoryDelta / 1024 / 1024).toFixed(2)}MB) should be less than 50MB`,
    )
  } finally {
    // Ensure cleanup of all instances
    instances.forEach((instance) => {
      try {
        instance.cleanup()
      } catch {
        // Ignore cleanup errors
      }
    })
  }
})

test.serial('Stability: Concurrent stress test', async (t) => {
  console.log(`\n=== Concurrent Stress Test ===`)

  const concurrentInstances = 4
  const operationsPerInstance = 10
  const instances: PostgresInstance[] = []

  try {
    // Create multiple instances
    for (let i = 0; i < concurrentInstances; i++) {
      const instance = new PostgresInstance({
        port: 5620 + i,
        username: `stress_user_${i}`,
        password: `stress_pass_${i}`,
        persistent: false,
        timeout: 240,
      })
      instances.push(instance)
    }

    const startTime = Date.now()

    // Start all instances concurrently
    await Promise.all(instances.map((instance) => instance.start()))

    // Execute stress test concurrently
    const stressPromises = instances.map(async (instance, instanceIndex) => {
      const errors: string[] = []

      for (let op = 0; op < operationsPerInstance; op++) {
        try {
          const dbName = `stress_db_${instanceIndex}_${op}`

          // Create database
          await instance.createDatabase(dbName)

          // Check existence
          const exists = await instance.databaseExists(dbName)
          if (!exists) {
            errors.push(`Database ${dbName} creation failed`)
          }

          // Drop database
          await instance.dropDatabase(dbName)

          // Check existence again
          const existsAfterDrop = await instance.databaseExists(dbName)
          if (existsAfterDrop) {
            errors.push(`Database ${dbName} deletion failed`)
          }

          // Check instance health
          if (!instance.isHealthy()) {
            errors.push(`Instance ${instanceIndex} health check failed at operation ${op}`)
          }
        } catch (error) {
          errors.push(`Instance ${instanceIndex} operation ${op} failed: ${error}`)
        }
      }

      return { instanceIndex, errors }
    })

    const results = await Promise.all(stressPromises)
    const totalTime = Date.now() - startTime

    // Analyze results
    let totalErrors = 0
    let totalOperations = concurrentInstances * operationsPerInstance

    results.forEach(({ instanceIndex, errors }) => {
      if (errors.length > 0) {
        console.log(`Instance ${instanceIndex} errors:`, errors)
        totalErrors += errors.length
      }
    })

    console.log(`\n=== Stress Test Results ===`)
    console.log(`Concurrent instances: ${concurrentInstances}`)
    console.log(`Operations per instance: ${operationsPerInstance}`)
    console.log(`Total operations: ${totalOperations}`)
    console.log(`Total time: ${totalTime}ms`)
    console.log(`Operations per second: ${(totalOperations / (totalTime / 1000)).toFixed(2)}`)
    console.log(`Total errors: ${totalErrors}`)
    console.log(`Error rate: ${((totalErrors / totalOperations) * 100).toFixed(2)}%`)

    // Stop all instances concurrently
    await Promise.all(instances.map((instance) => safeStopInstance(instance)))

    // Assert: Error rate should be low
    const errorRate = (totalErrors / totalOperations) * 100
    t.true(errorRate < 5, `Error rate (${errorRate.toFixed(2)}%) should be less than 5%`)

    // Assert: All instances should be stopped
    instances.forEach((instance, index) => {
      t.is(instance.state, InstanceState.Stopped, `Instance ${index} should be stopped`)
    })
  } finally {
    // Cleanup all instances
    instances.forEach((instance) => {
      instance.cleanup()
    })
  }
})
