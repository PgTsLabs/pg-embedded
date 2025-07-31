/**
 * Simple Example
 *
 * This is a minimal example showing the basic usage of pg-embedded.
 * Perfect for getting started quickly.
 */

import { PostgresInstance } from '../index.js'

async function simpleExample() {
  console.log('🚀 Simple PostgreSQL example\n')

  // Create instance with minimal configuration
  const postgres = new PostgresInstance({
    port: 5432,
    persistent: false, // Don't save data between runs
  })

  try {
    // Start PostgreSQL
    console.log('⏳ Starting PostgreSQL...')
    await postgres.start()
    console.log('✅ PostgreSQL started!')

    // Get connection info
    const info = postgres.connectionInfo
    console.log(`🔗 Connection: ${info.connectionString}`)

    // Create a database
    await postgres.createDatabase('example')
    console.log('✅ Database "example" created')

    // Check if it exists
    const exists = await postgres.databaseExists('example')
    console.log(`🔍 Database exists: ${exists}`)

    // Clean up
    await postgres.dropDatabase('example')
    console.log('🗑️  Database dropped')

    // Stop PostgreSQL
    await postgres.stop()
    console.log('✅ PostgreSQL stopped')
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    // Always cleanup
    await postgres.cleanup()
    console.log('🧹 Cleanup complete')
  }

  console.log('\n🎉 Example completed!')
}

simpleExample().catch(console.error)