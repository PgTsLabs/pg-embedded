import test from 'ava'
import { PostgresInstance, InstanceState, initLogger, LogLevel } from '../index.js'

// 初始化日志记录器
initLogger(LogLevel.Info)

test.serial('Error handling: Invalid configuration', (t) => {
  // 测试无效端口号
  t.throws(() => {
    new PostgresInstance({
      port: -1,
      username: 'testuser',
      password: 'testpass'
    })
  })

  t.throws(() => {
    new PostgresInstance({
      port: 70000, // 超出有效端口范围
      username: 'testuser',
      password: 'testpass'
    })
  })

  // 测试空用户名
  t.throws(() => {
    new PostgresInstance({
      port: 5443,
      username: '',
      password: 'testpass'
    })
  })
})

test.serial('Error handling: Repeated start/stop operations', async (t) => {
  const instance = new PostgresInstance({
    port: 5444,
    username: 'repeatuser',
    password: 'repeatpass',
    persistent: false
  })

  try {
    // 正常启动流程
    await instance.start()
    t.is(instance.state, InstanceState.Running)

    // 重复启动应该失败
    await t.throwsAsync(async () => {
      await instance.start()
    })

    // 正常停止
    await instance.stop()
    t.is(instance.state, InstanceState.Stopped)

    // 重复停止应该失败
    await t.throwsAsync(async () => {
      await instance.stop()
    })

    // 在停止状态下尝试数据库操作应该失败
    await t.throwsAsync(async () => {
      await instance.createDatabase('should_fail_db')
    })

  } finally {
    instance.cleanup()
  }
})

test.serial('Error handling: Database operations on stopped instance', async (t) => {
  const instance = new PostgresInstance({
    port: 5445,
    username: 'stoppeduser',
    password: 'stoppedpass',
    persistent: false
  })

  try {
    // 在停止状态下尝试数据库操作应该失败
    await t.throwsAsync(async () => {
      await instance.createDatabase('should_fail_db')
    })

    await t.throwsAsync(async () => {
      await instance.databaseExists('any_db')
    })

    await t.throwsAsync(async () => {
      await instance.dropDatabase('any_db')
    })

  } finally {
    instance.cleanup()
  }
})

test.serial('Error handling: Duplicate database creation', async (t) => {
  const instance = new PostgresInstance({
    port: 5446,
    username: 'duplicateuser',
    password: 'duplicatepass',
    persistent: false
  })

  try {
    await instance.start()

    // 创建数据库
    await instance.createDatabase('duplicate_test_db')
    
    // 尝试创建同名数据库应该失败
    await t.throwsAsync(async () => {
      await instance.createDatabase('duplicate_test_db')
    })

    // 清理
    await instance.dropDatabase('duplicate_test_db')
    await instance.stop()

  } finally {
    instance.cleanup()
  }
})

test.serial('Error handling: Connection info access when stopped', (t) => {
  const instance = new PostgresInstance({
    port: 5447,
    username: 'connectionuser',
    password: 'connectionpass',
    persistent: false
  })

  try {
    // 在停止状态下访问连接信息应该失败
    t.throws(() => {
      instance.connectionInfo
    })

  } finally {
    instance.cleanup()
  }
})

test.serial('Error handling: Health check on stopped instance', (t) => {
  const instance = new PostgresInstance({
    port: 5448,
    username: 'healthuser',
    password: 'healthpass',
    persistent: false
  })

  try {
    // 停止状态下应该不健康
    t.is(instance.isHealthy(), false)

  } finally {
    instance.cleanup()
  }
})