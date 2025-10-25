import test from 'ava'
import process from 'node:process'
import os from 'node:os'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// Initialize logger
initLogger(LogLevel.Info)

// Skip tests if not on Windows
const isWindows = os.platform() === 'win32'

const windowsTest = isWindows ? test.serial : test.serial.skip

windowsTest('Windows Performance: Optimized startup time', async (t) => {
  console.log(`\n=== Windows Performance Test ===`)
  console.log(`Platform: ${os.platform()}`)
  console.log(`Architecture: ${os.arch()}`)
  console.log(`CPUs: ${os.cpus().length}`)
  console.log(`Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`)
  console.log(`Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`)

  const instance = new PostgresInstance({
    port: 5555,
    username: 'wintest',
    password: 'winpass',
    persistent: false,
    // setupTimeout will be automatically optimized for Windows
  })

  try {
    const startTime = process.hrtime.bigint()
    
    // Start instance with optimizations
    await instance.startWithTimeout(120) // 2 minutes max
    
    const endTime = process.hrtime.bigint()
    const startupTimeMs = Number(endTime - startTime) / 1e6
    
    console.log(`PostgreSQL started in ${startupTimeMs.toFixed(2)}ms`)
    
    // Verify instance is running
    t.is(instance.state, InstanceState.Running)
    t.true(instance.isHealthy())
    
    // Get internal startup time
    const recordedStartupTime = instance.getStartupTime()
    console.log(`Internal startup time: ${recordedStartupTime?.toFixed(3)}s`)
    
    // Test database operations
    const dbStartTime = process.hrtime.bigint()
    await instance.createDatabase('winperf_db')
    const dbEndTime = process.hrtime.bigint()
    const dbCreateTimeMs = Number(dbEndTime - dbStartTime) / 1e6
    
    console.log(`Database creation time: ${dbCreateTimeMs.toFixed(2)}ms`)
    
    const exists = await instance.databaseExists('winperf_db')
    t.true(exists)
    
    // Performance assertions for Windows
    // With optimizations, startup should be under 60 seconds on SSD
    t.true(startupTimeMs < 60000, `Startup time (${startupTimeMs.toFixed(2)}ms) should be under 60 seconds`)
    
    // Database creation should be fast
    t.true(dbCreateTimeMs < 5000, `Database creation (${dbCreateTimeMs.toFixed(2)}ms) should be under 5 seconds`)
    
    // Cleanup
    await instance.dropDatabase('winperf_db')
    await instance.stopWithTimeout(30)
    
  } finally {
    instance.cleanup()
  }
})

windowsTest('Windows Performance: Multiple instance startup', async (t) => {
  const instanceCount = 3
  const instances: PostgresInstance[] = []
  
  console.log(`\n=== Windows Multiple Instance Test ===`)
  console.log(`Starting ${instanceCount} PostgreSQL instances...`)
  
  try {
    const overallStartTime = process.hrtime.bigint()
    
    // Create instances
    for (let i = 0; i < instanceCount; i++) {
      instances.push(new PostgresInstance({
        port: 5560 + i,
        username: `winuser${i}`,
        password: `winpass${i}`,
        persistent: false,
      }))
    }
    
    // Start all instances concurrently
    const startPromises = instances.map(async (instance, idx) => {
      const instanceStartTime = process.hrtime.bigint()
      await instance.startWithTimeout(180) // 3 minutes each
      const instanceEndTime = process.hrtime.bigint()
      const startupTimeMs = Number(instanceEndTime - instanceStartTime) / 1e6
      console.log(`Instance ${idx} started in ${startupTimeMs.toFixed(2)}ms`)
      return startupTimeMs
    })
    
    const startupTimes = await Promise.all(startPromises)
    const overallEndTime = process.hrtime.bigint()
    const overallTimeMs = Number(overallEndTime - overallStartTime) / 1e6
    
    console.log(`\nAll instances started in ${overallTimeMs.toFixed(2)}ms`)
    console.log(`Average startup time: ${(startupTimes.reduce((a, b) => a + b, 0) / instanceCount).toFixed(2)}ms`)
    
    // Verify all instances are running
    instances.forEach((instance, idx) => {
      t.is(instance.state, InstanceState.Running, `Instance ${idx} should be running`)
      t.true(instance.isHealthy(), `Instance ${idx} should be healthy`)
    })
    
    // Performance assertion
    // With optimizations, parallel startup should be efficient
    t.true(overallTimeMs < 180000, `Overall startup time (${overallTimeMs.toFixed(2)}ms) should be under 3 minutes`)
    
    // Stop all instances
    await Promise.all(instances.map(instance => instance.stopWithTimeout(30)))
    
  } finally {
    instances.forEach(instance => instance.cleanup())
  }
})

windowsTest('Windows Performance: Memory usage optimization', async (t) => {
  console.log(`\n=== Windows Memory Usage Test ===`)
  
  const instance = new PostgresInstance({
    port: 5570,
    username: 'memtest',
    password: 'mempass',
    persistent: false,
  })
  
  try {
    // Record initial memory
    const initialMemory = process.memoryUsage()
    console.log(`Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
    
    // Start instance
    await instance.startWithTimeout(120)
    
    // Record memory after startup
    const afterStartMemory = process.memoryUsage()
    const startupMemoryDelta = afterStartMemory.heapUsed - initialMemory.heapUsed
    console.log(`Memory after startup: ${(afterStartMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Startup memory delta: ${(startupMemoryDelta / 1024 / 1024).toFixed(2)} MB`)
    
    // Perform some operations
    for (let i = 0; i < 5; i++) {
      const dbName = `memtest_db_${i}`
      await instance.createDatabase(dbName)
      await instance.dropDatabase(dbName)
    }
    
    // Record memory after operations
    const afterOpsMemory = process.memoryUsage()
    const opsMemoryDelta = afterOpsMemory.heapUsed - afterStartMemory.heapUsed
    console.log(`Memory after operations: ${(afterOpsMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Operations memory delta: ${(opsMemoryDelta / 1024 / 1024).toFixed(2)} MB`)
    
    // Stop instance
    await instance.stopWithTimeout(30)
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }
    
    // Final memory check
    const finalMemory = process.memoryUsage()
    const totalMemoryDelta = finalMemory.heapUsed - initialMemory.heapUsed
    console.log(`Final memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Total memory delta: ${(totalMemoryDelta / 1024 / 1024).toFixed(2)} MB`)
    
    // Performance assertions
    // Memory usage should be reasonable
    t.true(startupMemoryDelta / 1024 / 1024 < 200, `Startup memory delta should be under 200 MB`)
    t.true(opsMemoryDelta / 1024 / 1024 < 50, `Operations memory delta should be under 50 MB`)
    
  } finally {
    instance.cleanup()
  }
})
