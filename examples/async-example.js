/**
 * Async/Await Example
 *
 * This example demonstrates how to use pg-embedded with async/await syntax.
 * This is the recommended approach for most applications.
 */

import { PostgresInstance, initLogger, LogLevel } from '../index.js'

// Enable logging to see what's happening
initLogger(LogLevel.Info)

async function asyncExample() {
  console.log('🚀 Starting async PostgreSQL example...\n')

  // Create a new PostgreSQL instance with custom settings
  const postgres = new PostgresInstance({
    port: 5432,
    username: 'demo_user',
    password: 'demo_password',
    persistent: false, // Don't persist data between runs
    timeout: 30,
  })

  try {
    console.log('📊 Instance created with ID:', postgres.instanceId)
    console.log('🔧 Configuration hash:', postgres.getConfigHash())
    console.log('📈 Initial state:', postgres.state)

    // Start the PostgreSQL server
    console.log('\n⏳ Starting PostgreSQL server...')
    const startTime = Date.now()

    await postgres.start()

    const externalStartupTime = Date.now() - startTime
    const internalStartupTime = postgres.getStartupTime()

    console.log('✅ PostgreSQL started successfully!')
    console.log(`⚡ External startup time: ${externalStartupTime}ms`)
    console.log(`⚡ Internal startup time: ${(internalStartupTime * 1000).toFixed(2)}ms`)
    console.log('📈 Current state:', postgres.state)
    console.log('💚 Health check:', postgres.isHealthy() ? 'Healthy' : 'Unhealthy')

    // Get connection information
    const connectionInfo = postgres.connectionInfo
    console.log('\n🔗 Connection Information:')
    console.log(`   Host: ${connectionInfo.host}`)
    console.log(`   Port: ${connectionInfo.port}`)
    console.log(`   Username: ${connectionInfo.username}`)
    console.log(`   Database: ${connectionInfo.databaseName}`)
    console.log(`   Connection String: ${connectionInfo.connectionString}`)

    // Test connection cache
    console.log('\n🗄️  Testing connection cache...')
    console.log('Cache valid:', postgres.isConnectionCacheValid())

    // Access connection info multiple times (should use cache)
    for (let i = 0; i < 3; i++) {
      const info = postgres.connectionInfo
      console.log(`Cache access ${i + 1}: ${info.host}:${info.port}`)
    }

    // Database operations
    console.log('\n🗃️  Testing database operations...')

    const databases = ['example_db', 'test_db', 'demo_db']

    // Create multiple databases
    console.log('Creating databases...')
    for (const dbName of databases) {
      await postgres.createDatabase(dbName)
      console.log(`✅ Created database: ${dbName}`)
    }

    // Check if databases exist
    console.log('\nChecking database existence...')
    for (const dbName of databases) {
      const exists = await postgres.databaseExists(dbName)
      console.log(`🔍 Database ${dbName} exists: ${exists}`)
    }

    // Test non-existent database
    const nonExistent = await postgres.databaseExists('non_existent_db')
    console.log(`🔍 Non-existent database exists: ${nonExistent}`)

    // Clean up databases
    console.log('\nCleaning up databases...')
    for (const dbName of databases) {
      await postgres.dropDatabase(dbName)
      console.log(`🗑️  Dropped database: ${dbName}`)

      // Verify deletion
      const stillExists = await postgres.databaseExists(dbName)
      console.log(`🔍 Database ${dbName} still exists: ${stillExists}`)
    }

    // Test timeout functionality
    console.log('\n⏱️  Testing timeout functionality...')
    await postgres.stop()

    try {
      await postgres.startWithTimeout(10) // 10 second timeout
      console.log('✅ Started with timeout successfully')

      await postgres.stopWithTimeout(5) // 5 second timeout
      console.log('✅ Stopped with timeout successfully')
    } catch (error) {
      console.error('❌ Timeout operation failed:', error.message)
    }

    console.log('\n📊 Final Statistics:')
    console.log(`Instance ID: ${postgres.instanceId}`)
    console.log(`Final state: ${postgres.state}`)
    console.log(`Last startup time: ${postgres.getStartupTime()?.toFixed(3)}s`)
  } catch (error) {
    console.error('❌ Error occurred:', error.message)
    console.error('Stack trace:', error.stack)
  } finally {
    // Always clean up resources
    console.log('\n🧹 Cleaning up resources...')
    try {
      if (postgres.state === 'Running') {
        await postgres.stop()
        console.log('✅ PostgreSQL stopped')
      }
    } catch (error) {
      console.warn('⚠️  Warning during stop:', error.message)
    }

    await postgres.cleanup()
    console.log('✅ Resources cleaned up')
  }

  console.log('\n🎉 Async example completed!')
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

// Run the example
asyncExample().catch((error) => {
  console.error('❌ Example failed:', error)
  process.exit(1)
})
