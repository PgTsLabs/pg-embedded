/**
 * Testing Framework Example
 *
 * This example demonstrates how to use pg-embedded with popular testing frameworks
 * like Jest, Mocha, or any other testing library.
 */

import { PostgresInstance, initLogger, LogLevel } from '../index.js'

// Enable minimal logging for testing
initLogger(LogLevel.Error)

/**
 * Test Suite Class
 *
 * This class demonstrates a pattern for using pg-embedded in test suites
 * with proper setup, teardown, and test isolation.
 */
class DatabaseTestSuite {
  constructor(options = {}) {
    this.postgres = null
    this.options = {
      port: 5434,
      username: 'test_user',
      password: 'test_password',
      persistent: false,
      ...options,
    }
    this.testDatabases = new Set()
  }

  /**
   * Setup method - call this before running tests
   */
  async setup() {
    console.log('🔧 Setting up test database instance...')

    this.postgres = new PostgresInstance(this.options)

    const startTime = Date.now()
    await this.postgres.start()
    const setupTime = Date.now() - startTime

    console.log(`✅ Test database ready in ${setupTime}ms`)
    console.log(`🔗 Connection: ${this.postgres.connectionInfo.connectionString}`)

    return this.postgres
  }

  /**
   * Teardown method - call this after all tests complete
   */
  async teardown() {
    console.log('🧹 Tearing down test database instance...')

    if (this.postgres) {
      // Clean up any remaining test databases
      for (const dbName of this.testDatabases) {
        try {
          await this.postgres.dropDatabase(dbName)
          console.log(`🗑️  Cleaned up test database: ${dbName}`)
        } catch (error) {
          console.warn(`⚠️  Failed to clean up database ${dbName}:`, error.message)
        }
      }

      await this.postgres.stop()
      this.postgres.cleanup()
      console.log('✅ Test database instance stopped')
    }
  }

  /**
   * Create a test database with automatic cleanup tracking
   */
  async createTestDatabase(name) {
    if (!this.postgres) {
      throw new Error('Test suite not initialized. Call setup() first.')
    }

    const dbName = `test_${name}_${Date.now()}`
    await this.postgres.createDatabase(dbName)
    this.testDatabases.add(dbName)

    console.log(`📝 Created test database: ${dbName}`)
    return dbName
  }

  /**
   * Clean up a specific test database
   */
  async cleanupTestDatabase(name) {
    if (!this.postgres) return

    try {
      await this.postgres.dropDatabase(name)
      this.testDatabases.delete(name)
      console.log(`🗑️  Cleaned up test database: ${name}`)
    } catch (error) {
      console.warn(`⚠️  Failed to cleanup database ${name}:`, error.message)
    }
  }

  /**
   * Get a fresh database for each test
   */
  async getTestDatabase(testName) {
    const dbName = await this.createTestDatabase(testName)
    return {
      name: dbName,
      connectionInfo: this.postgres.connectionInfo,
      cleanup: () => this.cleanupTestDatabase(dbName),
    }
  }
}

/**
 * Example test functions
 */
async function testDatabaseCreation(testSuite) {
  console.log('\n🧪 Test: Database Creation')

  const testDb = await testSuite.getTestDatabase('creation')

  try {
    // Test that database was created
    const exists = await testSuite.postgres.databaseExists(testDb.name)
    console.assert(exists === true, 'Database should exist after creation')
    console.log('✅ Database creation test passed')

    return true
  } catch (error) {
    console.error('❌ Database creation test failed:', error.message)
    return false
  } finally {
    await testDb.cleanup()
  }
}

async function testDatabaseDeletion(testSuite) {
  console.log('\n🧪 Test: Database Deletion')

  const testDb = await testSuite.getTestDatabase('deletion')

  try {
    // Verify database exists
    let exists = await testSuite.postgres.databaseExists(testDb.name)
    console.assert(exists === true, 'Database should exist before deletion')

    // Delete database
    await testSuite.postgres.dropDatabase(testDb.name)

    // Verify database no longer exists
    exists = await testSuite.postgres.databaseExists(testDb.name)
    console.assert(exists === false, 'Database should not exist after deletion')
    console.log('✅ Database deletion test passed')

    return true
  } catch (error) {
    console.error('❌ Database deletion test failed:', error.message)
    return false
  }
  // Note: No cleanup needed as we already deleted the database
}

async function testConcurrentOperations(testSuite) {
  console.log('\n🧪 Test: Concurrent Operations')

  try {
    const dbNames = []
    const promises = []

    // Create multiple databases concurrently
    for (let i = 0; i < 3; i++) {
      const dbName = `concurrent_test_${i}_${Date.now()}`
      dbNames.push(dbName)
      promises.push(testSuite.postgres.createDatabase(dbName))
    }

    await Promise.all(promises)
    console.log('✅ Concurrent database creation completed')

    // Verify all databases exist
    const existsPromises = dbNames.map((name) => testSuite.postgres.databaseExists(name))
    const results = await Promise.all(existsPromises)

    const allExist = results.every((exists) => exists === true)
    console.assert(allExist, 'All databases should exist')
    console.log('✅ Concurrent existence check passed')

    // Clean up concurrently
    const cleanupPromises = dbNames.map((name) => testSuite.postgres.dropDatabase(name))
    await Promise.all(cleanupPromises)
    console.log('✅ Concurrent cleanup completed')

    return true
  } catch (error) {
    console.error('❌ Concurrent operations test failed:', error.message)
    return false
  }
}

async function testErrorHandling(testSuite) {
  console.log('\n🧪 Test: Error Handling')

  try {
    // Test invalid database name
    try {
      await testSuite.postgres.createDatabase('')
      console.assert(false, 'Should have thrown error for empty database name')
    } catch (error) {
      console.log('✅ Correctly caught error for empty database name', error)
    }

    // Test dropping non-existent database
    try {
      await testSuite.postgres.dropDatabase('non_existent_database_12345')
      console.log('✅ Dropping non-existent database handled gracefully')
    } catch (error) {
      console.log('✅ Dropping non-existent database threw expected error', error)
    }

    // Test checking non-existent database
    const exists = await testSuite.postgres.databaseExists('definitely_does_not_exist')
    console.assert(exists === false, 'Non-existent database should return false')
    console.log('✅ Non-existent database check returned false')

    return true
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message)
    return false
  }
}

async function testPerformance(testSuite) {
  console.log('\n🧪 Test: Performance Benchmarks')

  try {
    const iterations = 10
    const dbName = `perf_test_${Date.now()}`

    // Measure database creation/deletion performance
    const startTime = Date.now()

    for (let i = 0; i < iterations; i++) {
      const iterDbName = `${dbName}_${i}`
      await testSuite.postgres.createDatabase(iterDbName)
      const exists = await testSuite.postgres.databaseExists(iterDbName)
      console.assert(exists === true, `Database ${iterDbName} should exist`)
      await testSuite.postgres.dropDatabase(iterDbName)
    }

    const totalTime = Date.now() - startTime
    const avgTime = totalTime / iterations

    console.log(`✅ Performance test completed:`)
    console.log(`   Total time: ${totalTime}ms`)
    console.log(`   Average per operation: ${avgTime.toFixed(2)}ms`)
    console.log(`   Operations per second: ${(1000 / avgTime).toFixed(2)}`)

    // Performance assertion (adjust threshold as needed)
    const maxAvgTime = 1000 // 1 second per operation
    console.assert(avgTime < maxAvgTime, `Average operation time (${avgTime}ms) should be less than ${maxAvgTime}ms`)

    return true
  } catch (error) {
    console.error('❌ Performance test failed:', error.message)
    return false
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting pg-embedded testing example...\n')

  const testSuite = new DatabaseTestSuite({
    port: 5434, // Use different port for testing
    persistent: false,
  })

  let testResults = []

  try {
    // Setup test environment
    await testSuite.setup()

    // Run all tests
    const tests = [
      { name: 'Database Creation', fn: testDatabaseCreation },
      { name: 'Database Deletion', fn: testDatabaseDeletion },
      { name: 'Concurrent Operations', fn: testConcurrentOperations },
      { name: 'Error Handling', fn: testErrorHandling },
      { name: 'Performance Benchmarks', fn: testPerformance },
    ]

    console.log(`\n📋 Running ${tests.length} tests...\n`)

    for (const test of tests) {
      try {
        const result = await test.fn(testSuite)
        testResults.push({ name: test.name, passed: result })
      } catch (error) {
        console.error(`❌ Test "${test.name}" threw unexpected error:`, error.message)
        testResults.push({ name: test.name, passed: false, error: error.message })
      }
    }
  } finally {
    // Always cleanup
    await testSuite.teardown()
  }

  // Print test summary
  console.log('\n📊 Test Results Summary:')
  console.log('========================')

  let passed = 0
  let failed = 0

  for (const result of testResults) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL'
    console.log(`${status} ${result.name}`)
    if (result.error) {
      console.log(`      Error: ${result.error}`)
    }

    if (result.passed) passed++
    else failed++
  }

  console.log('========================')
  console.log(`Total: ${testResults.length}, Passed: ${passed}, Failed: ${failed}`)

  if (failed === 0) {
    console.log('🎉 All tests passed!')
    return true
  } else {
    console.log(`❌ ${failed} test(s) failed`)
    return false
  }
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

// Run the tests
runTests()
  .then((success) => {
    process.exit(success ? 0 : 1)
  })
  .catch((error) => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
