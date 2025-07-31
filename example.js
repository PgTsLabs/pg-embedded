import { PostgresInstance, initLogger, LogLevel } from './index.js'

async function main() {
  // Initialize logging
  initLogger(LogLevel.Info)
  
  // Create PostgreSQL instance
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
    // Note: Actual startup requires PostgreSQL binary files
    // This is just demonstrating API usage
    console.log('Setting up PostgreSQL...')
    // await postgres.setup()
    
    console.log('Starting PostgreSQL...')
    // await postgres.start()
    
    // If startup is successful, you can perform database operations
    // await postgres.createDatabase('myapp')
    // const exists = await postgres.databaseExists('myapp')
    // console.log('Database exists:', exists)
    
    // Stop the instance
    // await postgres.stop()
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    // Clean up resources
    await postgres.cleanup()
    console.log('Final state:', postgres.state)
  }
}

// Run the example
main().catch(console.error)