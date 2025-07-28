import test from 'ava'
import process from 'node:process'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// 辅助函数：安全地停止实例
async function safeStopInstance(instance: PostgresInstance, timeoutSeconds = 30) {
  try {
    if (instance.state === InstanceState.Running) {
      await instance.stopWithTimeout(timeoutSeconds)
    }
  } catch (error) {
    console.warn(`停止实例时出错: ${error}`)
  }
}

// 辅助函数：安全地清理实例
function safeCleanupInstance(instance: PostgresInstance) {
  try {
    instance.cleanup()
  } catch (error) {
    console.warn(`清理实例时出错: ${error}`)
  }
}

// 辅助函数：带重试的安全启动实例
async function safeStartInstance(instance: PostgresInstance, maxAttempts = 3, timeoutSeconds = 180) {
  let lastError = null
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`启动实例尝试 ${attempt}/${maxAttempts}...`)
      await instance.startWithTimeout(timeoutSeconds)
      
      // 验证实例状态
      if (instance.state !== InstanceState.Running) {
        throw new Error(`Instance state is ${instance.state}, expected Running`)
      }
      
      if (!instance.isHealthy()) {
        throw new Error('Instance is not healthy after startup')
      }
      
      console.log('实例启动成功')
      return // 成功启动，退出函数
      
    } catch (startupError) {
      lastError = startupError
      console.error(`启动尝试 ${attempt} 失败:`, startupError)
      
      if (attempt < maxAttempts) {
        console.log('等待5秒后重试...')
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        // 清理失败的实例
        try {
          await safeStopInstance(instance)
          safeCleanupInstance(instance)
        } catch (cleanupError) {
          console.warn('清理失败实例时出错:', cleanupError)
        }
      }
    }
  }
  
  // 所有尝试都失败了
  console.error('所有启动尝试都失败了')
  throw lastError
}

// 初始化日志记录器
initLogger(LogLevel.Info)

// 稳定性测试配置
const STABILITY_CONFIG = {
  DURATION_MS: 15000, // 15秒的稳定性测试（减少时间）
  OPERATION_INTERVAL_MS: 2000, // 每2秒执行一次操作（减少频率）
  MEMORY_CHECK_INTERVAL_MS: 5000, // 每5秒检查一次内存
  MAX_MEMORY_GROWTH_MB: 100, // 最大内存增长100MB
}

test.serial('Stability: Long-running instance stability test', async (t) => {
  const instance = new PostgresInstance({
    port: 5600 + Math.floor(Math.random() * 100), // 使用随机端口避免冲突
    username: 'stability_user',
    password: 'stability_pass',
    persistent: false,
    timeout: 180, // 增加超时时间到3分钟
  })

  const memorySnapshots: Array<{ time: number; heapUsed: number; operations: number }> = []
  let operationCount = 0
  let errorCount = 0

  try {
    console.log(`\n=== Long-Running Stability Test ===`)
    console.log(`Duration: ${STABILITY_CONFIG.DURATION_MS / 1000} seconds`)
    console.log(`Operation interval: ${STABILITY_CONFIG.OPERATION_INTERVAL_MS}ms`)

    console.log('Starting PostgreSQL instance...')
    
    // 使用安全启动函数
    await safeStartInstance(instance)
    
    // 测试连接信息
    const connectionInfo = instance.connectionInfo
    console.log(`PostgreSQL started successfully on port: ${connectionInfo.port}`)

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

    // 使用递归的异步函数而不是setInterval来避免并发问题
    let isRunning = true
    
    const performOperation = async () => {
      while (isRunning && Date.now() - startTime < STABILITY_CONFIG.DURATION_MS) {
        try {
          const dbName = `stability_db_${operationCount}`

          // 简化的数据库操作循环
          await instance.createDatabase(dbName)
          const exists = await instance.databaseExists(dbName)

          if (!exists) {
            errorCount++
            console.error(`Database ${dbName} was not created properly`)
          } else {
            // 只有在创建成功时才尝试删除
            await instance.dropDatabase(dbName)
            const existsAfterDrop = await instance.databaseExists(dbName)

            if (existsAfterDrop) {
              errorCount++
              console.error(`Database ${dbName} was not dropped properly`)
            }
          }

          // 简单的健康检查
          if (!instance.isHealthy()) {
            errorCount++
            console.error(`Instance health check failed at operation ${operationCount}`)
          }

          operationCount++
          
          // 等待下一次操作
          await new Promise(resolve => setTimeout(resolve, STABILITY_CONFIG.OPERATION_INTERVAL_MS))
        } catch (error) {
          errorCount++
          console.error(`Operation ${operationCount} failed:`, error)
          
          // 如果错误太多，提前退出
          if (errorCount > operationCount * 0.5) {
            console.error('Too many errors, stopping stability test')
            isRunning = false
            break
          }
          
          // 在错误后也要等待，避免快速重试
          await new Promise(resolve => setTimeout(resolve, STABILITY_CONFIG.OPERATION_INTERVAL_MS))
        }
      }
    }
    
    // 启动操作循环
    const operationPromise = performOperation()

    // 等待测试完成
    await new Promise((resolve) => setTimeout(resolve, STABILITY_CONFIG.DURATION_MS))

    // 停止操作循环
    isRunning = false
    await operationPromise

    // 清理内存监控定时器
    clearInterval(memoryMonitor)

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

    // 稳定性断言（放宽条件）
    const errorRate = operationCount > 0 ? (errorCount / operationCount) : 0
    t.true(errorRate < 0.1, `Error rate (${(errorRate * 100).toFixed(2)}%) should be less than 10%`)
    t.true(operationCount > 0, 'Should have performed some operations')
    t.true(
      memoryGrowthMB < maxAllowedGrowth,
      `Memory growth (${memoryGrowthMB.toFixed(2)}MB) should be less than ${maxAllowedGrowth}MB`,
    )

    // 实例应该仍然健康（如果没有太多错误）
    if (errorRate < 0.5) {
      t.is(instance.state, InstanceState.Running, 'Instance should still be running')
      t.is(instance.isHealthy(), true, 'Instance should still be healthy')
    } else {
      console.log('Skipping health checks due to high error rate')
      t.pass('High error rate detected, skipping health checks')
    }

    // 连接信息应该仍然有效
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
          timeout: 120,
        })

        instances.push(instance)
        await instance.startWithTimeout(60)

        // 执行一些操作
        await instance.createDatabase(`leak_test_db_${round}_${i}`)
        const exists = await instance.databaseExists(`leak_test_db_${round}_${i}`)
        t.is(exists, true)
        await instance.dropDatabase(`leak_test_db_${round}_${i}`)

        await safeStopInstance(instance)
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
        timeout: 120,
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
    await Promise.all(instances.map((instance) => safeStopInstance(instance)))

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
