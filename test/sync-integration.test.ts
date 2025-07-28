import test from 'ava'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// 初始化日志记录器
initLogger(LogLevel.Info)

test.serial('Complete sync workflow: setup -> start -> database operations -> stop', (t) => {
  const instance = new PostgresInstance({
    port: 5438,
    username: 'syncuser',
    password: 'syncpass',
    persistent: false,
  })

  try {
    // 初始状态应该是停止
    t.is(instance.state, InstanceState.Stopped)

    // 直接启动（会自动进行 setup）
    instance.startSync()
    t.is(instance.state, InstanceState.Running)

    // 验证连接信息可用
    const connectionInfo = instance.connectionInfo
    t.truthy(connectionInfo)
    t.truthy(connectionInfo.connectionString)
    t.truthy(connectionInfo.safeConnectionString)
    t.truthy(connectionInfo.jdbcUrl)
    t.is(connectionInfo.host, 'localhost')
    t.is(connectionInfo.port, 5438)
    t.is(connectionInfo.username, 'syncuser')
    t.is(connectionInfo.databaseName, 'postgres')

    // 3. 数据库操作
    // 检查默认数据库是否存在
    const defaultExists = instance.databaseExistsSync('postgres')
    t.is(defaultExists, true)

    // 创建新数据库
    instance.createDatabaseSync('test_sync_db')
    const newDbExists = instance.databaseExistsSync('test_sync_db')
    t.is(newDbExists, true)

    // 删除数据库
    instance.dropDatabaseSync('test_sync_db')
    const deletedDbExists = instance.databaseExistsSync('test_sync_db')
    t.is(deletedDbExists, false)

    // 4. Stop 阶段
    instance.stopSync()
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

test.serial('Sync exception throwing behavior', (t) => {
  const instance = new PostgresInstance({
    port: 5439,
    username: 'exceptionuser',
    password: 'exceptionpass',
    persistent: false,
  })

  try {
    // startSync() 方法会自动调用 setupSync()，所以不会失败
    instance.startSync()
    t.is(instance.state, InstanceState.Running)

    // 尝试创建已存在的数据库应该抛出异常
    instance.createDatabaseSync('exception_test_db')
    t.throws(() => {
      instance.createDatabaseSync('exception_test_db')
    })

    // 尝试删除不存在的数据库（PostgreSQL 会跳过，不会抛出错误）
    instance.dropDatabaseSync('nonexistent_sync_db') // 这不会抛出错误

    // 清理
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
    // 同步方式设置
    syncInstance.startSync()

    // 异步方式设置
    await asyncInstance.start()

    // 验证两个实例都在运行
    t.is(syncInstance.state, InstanceState.Running)
    t.is(asyncInstance.state, InstanceState.Running)

    // 同步创建数据库
    syncInstance.createDatabaseSync('consistency_sync_db')
    const syncDbExists = syncInstance.databaseExistsSync('consistency_sync_db')
    t.is(syncDbExists, true)

    // 异步创建数据库
    await asyncInstance.createDatabase('consistency_async_db')
    const asyncDbExists = await asyncInstance.databaseExists('consistency_async_db')
    t.is(asyncDbExists, true)

    // 验证连接信息格式一致
    const syncConnectionInfo = syncInstance.connectionInfo
    const asyncConnectionInfo = asyncInstance.connectionInfo

    t.is(typeof syncConnectionInfo.connectionString, 'string')
    t.is(typeof asyncConnectionInfo.connectionString, 'string')
    t.is(typeof syncConnectionInfo.safeConnectionString(), 'string')
    t.is(typeof asyncConnectionInfo.safeConnectionString(), 'string')
    t.is(typeof syncConnectionInfo.jdbcUrl(), 'string')
    t.is(typeof asyncConnectionInfo.jdbcUrl(), 'string')

    // 清理数据库
    syncInstance.dropDatabaseSync('consistency_sync_db')
    await asyncInstance.dropDatabase('consistency_async_db')

    // 停止实例
    syncInstance.stopSync()
    await asyncInstance.stop()

    // 验证两个实例都已停止
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
    // 验证同步方法的返回值类型
    instance.startSync()
    t.is(instance.state, InstanceState.Running)

    // 验证数据库操作的返回值
    const dbName = 'validation_test_db'

    // createDatabaseSync 应该没有返回值（undefined）
    const createResult = instance.createDatabaseSync(dbName)
    t.is(createResult, undefined)

    // databaseExistsSync 应该返回 boolean
    const existsResult = instance.databaseExistsSync(dbName)
    t.is(typeof existsResult, 'boolean')
    t.is(existsResult, true)

    // dropDatabaseSync 应该没有返回值（undefined）
    const dropResult = instance.dropDatabaseSync(dbName)
    t.is(dropResult, undefined)

    // 验证数据库已被删除
    const deletedExistsResult = instance.databaseExistsSync(dbName)
    t.is(typeof deletedExistsResult, 'boolean')
    t.is(deletedExistsResult, false)

    // stopSync 应该没有返回值（undefined）
    const stopResult = instance.stopSync()
    t.is(stopResult, undefined)
    t.is(instance.state, InstanceState.Stopped)
  } finally {
    instance.cleanup()
  }
})
