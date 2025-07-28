import test from 'ava'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// 初始化日志记录器
initLogger(LogLevel.Info)

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

test.serial('Complete async workflow: setup -> start -> database operations -> stop', async (t) => {
  const instance = new PostgresInstance({
    port: 5434,
    username: 'testuser',
    password: 'testpass',
    persistent: false,
    timeout: 60,
  })

  try {
    // 初始状态应该是停止
    t.is(instance.state, InstanceState.Stopped)

    // 直接启动（会自动进行 setup）
    await instance.startWithTimeout(60)
    t.is(instance.state, InstanceState.Running)

    // 验证连接信息可用
    const connectionInfo = instance.connectionInfo
    t.truthy(connectionInfo)
    t.truthy(connectionInfo.connectionString)
    t.truthy(connectionInfo.safeConnectionString())
    t.truthy(connectionInfo.jdbcUrl())
    t.is(connectionInfo.host, 'localhost')
    t.is(connectionInfo.port, 5434)
    t.is(connectionInfo.username, 'testuser')
    t.is(connectionInfo.databaseName, 'postgres')

    // 3. 数据库操作
    // 检查默认数据库是否存在
    const defaultExists = await instance.databaseExists('postgres')
    t.is(defaultExists, true)

    // 创建新数据库
    await instance.createDatabase('test_async_db')
    const newDbExists = await instance.databaseExists('test_async_db')
    t.is(newDbExists, true)

    // 删除数据库
    await instance.dropDatabase('test_async_db')
    const deletedDbExists = await instance.databaseExists('test_async_db')
    t.is(deletedDbExists, false)

    // 4. Stop 阶段
    await safeStopInstance(instance)
    t.is(instance.state, InstanceState.Stopped)

    // 停止后连接信息应该不可用
    const error = t.throws(() => {
      instance.connectionInfo
    })
    t.truthy(error)
    t.true(error.message.includes('not running'))
  } finally {
    // 确保清理
    instance.cleanup()
  }
})

test.serial('Async Promise behavior validation', async (t) => {
  const instance = new PostgresInstance({
    port: 5435,
    username: 'promiseuser',
    password: 'promisepass',
    persistent: false,
  })

  try {
    // 验证所有异步方法返回 Promise
    const startPromise = instance.start()
    t.true(startPromise instanceof Promise)
    await startPromise

    const createDbPromise = instance.createDatabase('promise_test_db')
    t.true(createDbPromise instanceof Promise)
    await createDbPromise

    const existsPromise = instance.databaseExists('promise_test_db')
    t.true(existsPromise instanceof Promise)
    const exists = await existsPromise
    t.is(exists, true)

    const dropDbPromise = instance.dropDatabase('promise_test_db')
    t.true(dropDbPromise instanceof Promise)
    await dropDbPromise

    const stopPromise = safeStopInstance(instance)
    t.true(stopPromise instanceof Promise)
    await stopPromise
  } finally {
    instance.cleanup()
  }
})

test.serial('Async error handling', async (t) => {
  const instance = new PostgresInstance({
    port: 5436,
    username: 'erroruser',
    password: 'errorpass',
    persistent: false,
  })

  try {
    // start() 方法会自动调用 setup()，所以不会失败
    await instance.startWithTimeout(60)
    t.is(instance.state, InstanceState.Running)

    // 尝试创建已存在的数据库应该失败
    await instance.createDatabase('error_test_db')
    await t.throwsAsync(async () => {
      await instance.createDatabase('error_test_db')
    })

    // 尝试删除不存在的数据库（PostgreSQL 会跳过，不会抛出错误）
    await instance.dropDatabase('nonexistent_db') // 这不会抛出错误

    // 清理
    await instance.dropDatabase('error_test_db')
    await safeStopInstance(instance)
  } finally {
    safeCleanupInstance(instance)
  }
})

test.serial('Async concurrent safety', async (t) => {
  const instance = new PostgresInstance({
    port: 5437,
    username: 'concurrentuser',
    password: 'concurrentpass',
    persistent: false,
  })

  try {
    await instance.startWithTimeout(60)

    // 并发创建多个数据库
    const dbNames = ['concurrent_db1', 'concurrent_db2', 'concurrent_db3']
    const createPromises = dbNames.map((name) => instance.createDatabase(name))

    // 等待所有创建操作完成
    await Promise.all(createPromises)

    // 验证所有数据库都被创建
    const existsPromises = dbNames.map((name) => instance.databaseExists(name))
    const existsResults = await Promise.all(existsPromises)
    existsResults.forEach((exists) => t.is(exists, true))

    // 并发删除所有数据库
    const dropPromises = dbNames.map((name) => instance.dropDatabase(name))
    await Promise.all(dropPromises)

    // 验证所有数据库都被删除
    const deletedExistsPromises = dbNames.map((name) => instance.databaseExists(name))
    const deletedExistsResults = await Promise.all(deletedExistsPromises)
    deletedExistsResults.forEach((exists) => t.is(exists, false))

    await safeStopInstance(instance)
  } finally {
    safeCleanupInstance(instance)
  }
})
