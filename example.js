import { PostgresInstance, initLogger, LogLevel } from './index.js'

async function main() {
  // 初始化日志记录
  initLogger(LogLevel.Info)
  
  // 创建 PostgreSQL 实例
  const postgres = new PostgresInstance({
    port: 5433,
    username: 'testuser',
    password: 'testpass',
    persistent: false
  })
  
  console.log('Instance ID:', postgres.instanceId)
  console.log('Initial state:', postgres.state)
  console.log('Is healthy:', postgres.isHealthy())
  
  try {
    // 注意：实际启动需要 PostgreSQL 二进制文件
    // 这里只是演示 API 的使用
    console.log('Setting up PostgreSQL...')
    // await postgres.setup()
    
    console.log('Starting PostgreSQL...')
    // await postgres.start()
    
    // 如果启动成功，可以进行数据库操作
    // await postgres.createDatabase('myapp')
    // const exists = await postgres.databaseExists('myapp')
    // console.log('Database exists:', exists)
    
    // 停止实例
    // await postgres.stop()
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    // 清理资源
    postgres.cleanup()
    console.log('Final state:', postgres.state)
  }
}

// 同步 API 示例
function syncExample() {
  const postgres = new PostgresInstance()
  
  try {
    console.log('Sync example - Initial state:', postgres.state)
    
    // 同步操作（需要实际的 PostgreSQL 环境）
    // postgres.setupSync()
    // postgres.startSync()
    // postgres.createDatabaseSync('syncdb')
    // postgres.stopSync()
    
  } catch (error) {
    console.error('Sync error:', error.message)
  } finally {
    postgres.cleanup()
  }
}

// 运行示例
main().catch(console.error)
syncExample()