import test from 'ava'
import process from 'node:process'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// 初始化日志记录器
initLogger(LogLevel.Info)

// 稳定性测试配置
const STABILITY_CONFIG = {
  DURATION_MS: 30000, // 30秒的稳定性测试
  OPERATION_INTERVAL_MS: 1000, // 每秒执行一次操作
  MEMORY_CHECK_INTERVAL_MS: 5000, // 每5秒检查一次内存
  MAX_MEMORY_GROWTH_MB: 100, // 最大内存增长100MB
}

test.serial('Stability: Long-running instance stability test', async (t) => {
  const instance = new PostgresInstance({
    port: 5600,
    username: 'stability_user',
    password: 'stability_pass',
    persistent: false,
  })

  const memorySnapshots: Array<{ time: number; heapUsed: number; operations: number }> = []
  let operationCount = 0
  let errorCount = 0

  try {
    console.log(`\n=== Long-Running Stability Test ===`)
    console.log(`Duration: ${STABILITY_CONFIG.DURATION_MS / 1000} seconds`)
    console.log(`Operation interval: ${STABILITY_CONFIG.OPERATION_INTERVAL_MS}ms`)

    await instance.start()
    t.is(instance.state, InstanceState.Running)

    const startTime = Date.now()
    const initialMemory = process.memoryUsage()

    memorySnapshots.push({
      time: 0,
      heapUsed: initialMemory.heapUsed,
      operations: 0,
    })

    // 设置内存监控
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

    // 设置操作循环
    const operationLoop = setInterval(async () => {
      try {
        const dbName = `stability_db_${operationCount}`

        // 执行数据库操作循环
        await instance.createDatabase(dbName)
        const exists = await instance.databaseExists(dbName)

        if (!exists) {
          errorCount++
          console.error(`Database ${dbName} was not created properly`)
        }

        await instance.dropDatabase(dbName)
        const existsAfterDrop = await instance.databaseExists(dbName)

        if (existsAfterDrop) {
          errorCount++
          console.error(`Database ${dbName} was not dropped properly`)
        }

        // 检查实例健康状态
        const isHealthy = instance.isHealthy()
        if (!isHealthy) {
          errorCount++
          console.error(`Instance health check failed at operation ${operationCount}`)
        }

        // 检查连接信息缓存
        const connectionInfo = instance.connectionInfo
        if (!connectionInfo || !connectionInfo.connectionString) {
          errorCount++
          console.error(`Connection info invalid at operation ${operationCount}`)
        }

        operationCount++
      } catch (error) {
        errorCount++
        console.error(`Operation ${operationCount} failed:`, error)
      }
    }, STABILITY_CONFIG.OPERATION_INTERVAL_MS)

    // 等待测试完成
    await new Promise((resolve) => setTimeout(resolve, STABILITY_CONFIG.DURATION_MS))

    // 清理定时器
    clearInterval(memoryMonitor)
    clearInterval(operationLoop)

    // 最终检查
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

    // 内存分析
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed
    console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`)

    // 检查内存泄漏
    const memoryGrowthMB = memoryGrowth / 1024 / 1024
    const maxAllowedGrowth = STABILITY_CONFIG.MAX_MEMORY_GROWTH_MB

    // 稳定性断言
    t.true(errorCount === 0, `Should have no errors, but got ${errorCount}`)
    t.true(operationCount > 0, 'Should have performed some operations')
    t.true(
      memoryGrowthMB < maxAllowedGrowth,
      `Memory growth (${memoryGrowthMB.toFixed(2)}MB) should be less than ${maxAllowedGrowth}MB`,
    )

    // 实例应该仍然健康
    t.is(instance.state, InstanceState.Running, 'Instance should still be running')
    t.is(instance.isHealthy(), true, 'Instance should still be healthy')

    // 连接信息应该仍然有效
    const finalConnectionInfo = instance.connectionInfo
    t.truthy(finalConnectionInfo)
    t.truthy(finalConnectionInfo.connectionString)

    await instance.stop()
    t.is(instance.state, InstanceState.Stopped)
  } finally {
    instance.cleanup()
  }
})

test.serial('Stability: Memory leak detection test', async (t) => {
  console.log(`\n=== Memory Leak Detection Test ===`)

  const instances: PostgresInstance[] = []
  const memorySnapshots: number[] = []

  try {
    // 执行多轮创建和销毁实例的操作
    const rounds = 5
    const instancesPerRound = 3

    for (let round = 0; round < rounds; round++) {
      console.log(`Round ${round + 1}/${rounds}`)

      // 记录开始内存
      const startMemory = process.memoryUsage().heapUsed

      // 创建实例
      for (let i = 0; i < instancesPerRound; i++) {
        const instance = new PostgresInstance({
          port: 5610 + round * instancesPerRound + i,
          username: `leak_test_${round}_${i}`,
          password: `leak_pass_${round}_${i}`,
          persistent: false,
        })

        instances.push(instance)
        await instance.start()

        // 执行一些操作
        await instance.createDatabase(`leak_test_db_${round}_${i}`)
        const exists = await instance.databaseExists(`leak_test_db_${round}_${i}`)
        t.is(exists, true)
        await instance.dropDatabase(`leak_test_db_${round}_${i}`)

        await instance.stop()
      }

      // 清理实例
      instances.forEach((instance) => instance.cleanup())
      instances.length = 0

      // 强制垃圾回收（如果可用）
      if (global.gc) {
        global.gc()
      }

      // 等待一下让垃圾回收完成
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 记录结束内存
      const endMemory = process.memoryUsage().heapUsed
      memorySnapshots.push(endMemory - startMemory)

      console.log(`Round ${round + 1} memory delta: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)}MB`)
    }

    // 分析内存增长趋势
    console.log(`\n=== Memory Leak Analysis ===`)
    memorySnapshots.forEach((delta, index) => {
      console.log(`Round ${index + 1}: ${(delta / 1024 / 1024).toFixed(2)}MB`)
    })

    // 计算平均内存增长
    const avgMemoryDelta = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length
    console.log(`Average memory delta per round: ${(avgMemoryDelta / 1024 / 1024).toFixed(2)}MB`)

    // 检查是否有持续的内存增长（可能的内存泄漏）
    const lastThreeRounds = memorySnapshots.slice(-3)
    const isIncreasing = lastThreeRounds.every((delta, index) => index === 0 || delta >= lastThreeRounds[index - 1])

    // 断言：不应该有持续的内存增长
    t.false(
      isIncreasing && avgMemoryDelta > 10 * 1024 * 1024,
      'Should not have consistent memory growth indicating a leak',
    )

    // 断言：平均内存增长应该在合理范围内
    t.true(
      avgMemoryDelta < 50 * 1024 * 1024,
      `Average memory delta (${(avgMemoryDelta / 1024 / 1024).toFixed(2)}MB) should be less than 50MB`,
    )
  } finally {
    // 确保清理所有实例
    instances.forEach((instance) => {
      try {
        instance.cleanup()
      } catch {
        // 忽略清理错误
      }
    })
  }
})

test.serial('Stability: Concurrent stress test', async (t) => {
  console.log(`\n=== Concurrent Stress Test ===`)

  const concurrentInstances = 8
  const operationsPerInstance = 10
  const instances: PostgresInstance[] = []

  try {
    // 创建多个实例
    for (let i = 0; i < concurrentInstances; i++) {
      const instance = new PostgresInstance({
        port: 5620 + i,
        username: `stress_user_${i}`,
        password: `stress_pass_${i}`,
        persistent: false,
      })
      instances.push(instance)
    }

    const startTime = Date.now()

    // 并发启动所有实例
    await Promise.all(instances.map((instance) => instance.start()))

    // 并发执行压力测试
    const stressPromises = instances.map(async (instance, instanceIndex) => {
      const errors: string[] = []

      for (let op = 0; op < operationsPerInstance; op++) {
        try {
          const dbName = `stress_db_${instanceIndex}_${op}`

          // 创建数据库
          await instance.createDatabase(dbName)

          // 检查存在性
          const exists = await instance.databaseExists(dbName)
          if (!exists) {
            errors.push(`Database ${dbName} creation failed`)
          }

          // 删除数据库
          await instance.dropDatabase(dbName)

          // 再次检查存在性
          const existsAfterDrop = await instance.databaseExists(dbName)
          if (existsAfterDrop) {
            errors.push(`Database ${dbName} deletion failed`)
          }

          // 检查实例健康状态
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

    // 分析结果
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

    // 并发停止所有实例
    await Promise.all(instances.map((instance) => instance.stop()))

    // 断言：错误率应该很低
    const errorRate = (totalErrors / totalOperations) * 100
    t.true(errorRate < 5, `Error rate (${errorRate.toFixed(2)}%) should be less than 5%`)

    // 断言：所有实例应该成功停止
    instances.forEach((instance, index) => {
      t.is(instance.state, InstanceState.Stopped, `Instance ${index} should be stopped`)
    })
  } finally {
    // 清理所有实例
    instances.forEach((instance) => {
      instance.cleanup()
    })
  }
})
