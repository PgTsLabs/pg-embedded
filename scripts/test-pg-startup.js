#!/usr/bin/env node

// 简单的PostgreSQL启动测试脚本
import { PostgresInstance, initLogger, LogLevel } from '../index.js'

// 启用详细日志
initLogger(LogLevel.Info)

async function testStartup() {
  console.log('Testing PostgreSQL startup...')
  
  const instance = new PostgresInstance({
    port: 5999,
    username: 'testuser',
    password: 'testpass',
    persistent: false,
    timeout: 300, // 5分钟超时，Windows可能需要更长时间
  })

  try {
    console.log('Creating instance...')
    console.log('Instance state:', instance.state)
    
    console.log('Starting PostgreSQL with extended timeout...')
    const startTime = Date.now()
    await instance.startWithTimeout(300) // 5分钟超时，Windows可能需要更长时间
    const startupTime = Date.now() - startTime
    
    console.log(`PostgreSQL started successfully in ${startupTime}ms!`)
    console.log('Instance state:', instance.state)
    console.log('Is healthy:', instance.isHealthy())
    
    const connectionInfo = instance.connectionInfo
    console.log('Connection info:', {
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      username: connectionInfo.username
    })
    
    // 测试基本数据库操作
    console.log('Testing database operations...')
    await instance.createDatabase('test_db')
    const exists = await instance.databaseExists('test_db')
    console.log('Database created and exists:', exists)
    
    console.log('Stopping PostgreSQL...')
    await instance.stopWithTimeout(60)
    
    console.log('PostgreSQL stopped successfully!')
    console.log('Instance state:', instance.state)
    
  } catch (error) {
    console.error('Error during PostgreSQL startup test:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    })
    process.exit(1)
  } finally {
    try {
      instance.cleanup()
    } catch (cleanupError) {
      console.warn('Cleanup error:', cleanupError)
    }
  }
}

testStartup().then(() => {
  console.log('Test completed successfully!')
  process.exit(0)
}).catch((error) => {
  console.error('Test failed:', error)
  process.exit(1)
})