/**
 * Performance tests for instance startup
 * Tests startup time and resource initialization
 */

import test from 'ava'
import { initLogger, LogLevel } from '../../index.js'
import {
  createTestInstance,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { assertInstanceRunning } from '../helpers/test-assertions.js'
import { getPlatformConfig } from '../helpers/test-config.js'

// Initialize logger
initLogger(LogLevel.Info)

// Performance tests have longer timeout
test.serial.timeout = 300000 // 5 minutes

test.serial('Measure instance startup time', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    const startTime = Date.now()

    await instance.startWithTimeout(config.startupTimeout)

    const endTime = Date.now()
    const startupTime = endTime - startTime

    assertInstanceRunning(t, instance)

    console.log(`Startup time: ${startupTime}ms`)

    // Startup should complete within reasonable time
    // Windows: 180s, Unix: 60s
    const maxStartupTime = config.startupTimeout * 1000
    t.true(startupTime < maxStartupTime, `Startup should complete within ${maxStartupTime}ms`)

    // Log performance metrics
    t.log(`Instance started in ${startupTime}ms`)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Measure stop time', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    await instance.startWithTimeout(config.startupTimeout)

    const startTime = Date.now()

    await instance.stopWithTimeout(config.stopTimeout)

    const endTime = Date.now()
    const stopTime = endTime - startTime

    console.log(`Stop time: ${stopTime}ms`)

    // Stop should complete within reasonable time
    const maxStopTime = config.stopTimeout * 1000
    t.true(stopTime < maxStopTime, `Stop should complete within ${maxStopTime}ms`)

    t.log(`Instance stopped in ${stopTime}ms`)
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Measure complete lifecycle time', async (t) => {
  const instance = createTestInstance()
  const config = getPlatformConfig()

  try {
    const startTime = Date.now()

    // Start
    await instance.startWithTimeout(config.startupTimeout)

    const startupEndTime = Date.now()
    const startupTime = startupEndTime - startTime

    // Perform some operations
    await instance.createDatabase('perf_test_db')
    await instance.databaseExists('perf_test_db')
    await instance.dropDatabase('perf_test_db')

    const opsEndTime = Date.now()
    const opsTime = opsEndTime - startupEndTime

    // Stop
    await instance.stopWithTimeout(config.stopTimeout)

    const endTime = Date.now()
    const stopTime = endTime - opsEndTime
    const totalTime = endTime - startTime

    console.log(`Lifecycle times - Startup: ${startupTime}ms, Operations: ${opsTime}ms, Stop: ${stopTime}ms, Total: ${totalTime}ms`)

    t.log(`Complete lifecycle: ${totalTime}ms`)
    t.log(`  - Startup: ${startupTime}ms`)
    t.log(`  - Operations: ${opsTime}ms`)
    t.log(`  - Stop: ${stopTime}ms`)

    t.pass('Lifecycle completed successfully')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Startup time is consistent across multiple runs', async (t) => {
  const config = getPlatformConfig()
  const runs = 3
  const startupTimes: number[] = []

  for (let i = 0; i < runs; i++) {
    const instance = createTestInstance()

    try {
      const startTime = Date.now()
      await instance.startWithTimeout(config.startupTimeout)
      const endTime = Date.now()

      const startupTime = endTime - startTime
      startupTimes.push(startupTime)

      console.log(`Run ${i + 1} startup time: ${startupTime}ms`)
    } finally {
      await cleanupTestInstance(instance)
    }

    // Wait between runs to avoid resource conflicts
    if (i < runs - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // Calculate statistics
  const avgTime = startupTimes.reduce((a, b) => a + b, 0) / runs
  const maxTime = Math.max(...startupTimes)
  const minTime = Math.min(...startupTimes)
  const variance = maxTime - minTime

  t.log(`Startup time statistics over ${runs} runs:`)
  t.log(`  - Average: ${avgTime.toFixed(2)}ms`)
  t.log(`  - Min: ${minTime}ms`)
  t.log(`  - Max: ${maxTime}ms`)
  t.log(`  - Variance: ${variance}ms`)

  // Variance should be reasonable (not more than 50% of average)
  t.true(variance < avgTime * 0.5, 'Startup time should be relatively consistent')
})
