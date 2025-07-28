/**
 * Synchronous Example
 * 
 * This example demonstrates how to use pg-embedded with synchronous operations.
 * This approach is useful for simple scripts or when you prefer synchronous flow.
 */

import { PostgresInstance, initLogger, LogLevel } from '../index.js';

// Enable logging to see what's happening
initLogger(LogLevel.Info);

function syncExample() {
  console.log('🚀 Starting synchronous PostgreSQL example...\n');

  // Create a new PostgreSQL instance
  const postgres = new PostgresInstance({
    port: 5433, // Different port to avoid conflicts
    username: 'sync_user',
    password: 'sync_password',
    persistent: false
  });

  try {
    console.log('📊 Instance created with ID:', postgres.instanceId);
    console.log('🔧 Configuration hash:', postgres.getConfigHash());
    console.log('📈 Initial state:', postgres.state);

    // Start the PostgreSQL server synchronously
    console.log('\n⏳ Starting PostgreSQL server synchronously...');
    const startTime = Date.now();
    
    postgres.startSync();
    
    const startupTime = Date.now() - startTime;
    console.log('✅ PostgreSQL started successfully!');
    console.log(`⚡ Startup time: ${startupTime}ms`);
    console.log('📈 Current state:', postgres.state);
    console.log('💚 Health check:', postgres.isHealthy() ? 'Healthy' : 'Unhealthy');

    // Get connection information
    const connectionInfo = postgres.connectionInfo;
    console.log('\n🔗 Connection Information:');
    console.log(`   Host: ${connectionInfo.host}`);
    console.log(`   Port: ${connectionInfo.port}`);
    console.log(`   Username: ${connectionInfo.username}`);
    console.log(`   Database: ${connectionInfo.database}`);
    console.log(`   Connection String: ${connectionInfo.connectionString}`);

    // Test connection cache
    console.log('\n🗄️  Testing connection cache...');
    console.log('Cache valid before:', postgres.isConnectionCacheValid());
    
    // Clear cache and test
    postgres.clearConnectionCache();
    console.log('Cache valid after clear:', postgres.isConnectionCacheValid());
    
    // Access connection info again (should rebuild cache)
    const newConnectionInfo = postgres.connectionInfo;
    console.log('Cache valid after access:', postgres.isConnectionCacheValid());
    console.log('Connection info consistent:', 
      connectionInfo.connectionString === newConnectionInfo.connectionString);

    // Synchronous database operations
    console.log('\n🗃️  Testing synchronous database operations...');
    
    const testDatabases = ['sync_db1', 'sync_db2', 'sync_db3'];
    
    // Create databases synchronously
    console.log('Creating databases synchronously...');
    for (const dbName of testDatabases) {
      try {
        postgres.createDatabaseSync(dbName);
        console.log(`✅ Created database: ${dbName}`);
      } catch (error) {
        console.error(`❌ Failed to create database ${dbName}:`, error.message);
      }
    }

    // Check database existence synchronously
    console.log('\nChecking database existence synchronously...');
    for (const dbName of testDatabases) {
      try {
        const exists = postgres.databaseExistsSync(dbName);
        console.log(`🔍 Database ${dbName} exists: ${exists}`);
      } catch (error) {
        console.error(`❌ Failed to check database ${dbName}:`, error.message);
      }
    }

    // Test error handling with invalid database name
    console.log('\nTesting error handling...');
    try {
      const exists = postgres.databaseExistsSync('');
      console.log('Empty database name check result:', exists);
    } catch (error) {
      console.log('✅ Correctly caught error for empty database name:', error.message);
    }

    // Performance test: multiple rapid operations
    console.log('\n⚡ Performance test: rapid database operations...');
    const perfTestStart = Date.now();
    const perfDbName = 'perf_test_db';
    
    for (let i = 0; i < 5; i++) {
      postgres.createDatabaseSync(perfDbName);
      const exists = postgres.databaseExistsSync(perfDbName);
      if (!exists) {
        console.error('❌ Database should exist after creation');
      }
      postgres.dropDatabaseSync(perfDbName);
      const stillExists = postgres.databaseExistsSync(perfDbName);
      if (stillExists) {
        console.error('❌ Database should not exist after deletion');
      }
    }
    
    const perfTestTime = Date.now() - perfTestStart;
    console.log(`✅ Performance test completed in ${perfTestTime}ms (5 create/drop cycles)`);

    // Clean up test databases
    console.log('\nCleaning up test databases...');
    for (const dbName of testDatabases) {
      try {
        postgres.dropDatabaseSync(dbName);
        console.log(`🗑️  Dropped database: ${dbName}`);
        
        // Verify deletion
        const stillExists = postgres.databaseExistsSync(dbName);
        if (stillExists) {
          console.warn(`⚠️  Warning: Database ${dbName} still exists after deletion`);
        } else {
          console.log(`✅ Confirmed deletion of database: ${dbName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to drop database ${dbName}:`, error.message);
      }
    }

    // Test state management
    console.log('\n📊 Testing state management...');
    console.log('Current state before stop:', postgres.state);
    
    postgres.stopSync();
    console.log('✅ PostgreSQL stopped synchronously');
    console.log('Current state after stop:', postgres.state);
    console.log('Health check after stop:', postgres.isHealthy() ? 'Healthy' : 'Unhealthy');

    // Test restart
    console.log('\n🔄 Testing restart...');
    postgres.startSync();
    console.log('✅ PostgreSQL restarted successfully');
    console.log('Current state after restart:', postgres.state);
    console.log('Health check after restart:', postgres.isHealthy() ? 'Healthy' : 'Unhealthy');

    console.log('\n📊 Final Statistics:');
    console.log(`Instance ID: ${postgres.instanceId}`);
    console.log(`Final state: ${postgres.state}`);
    console.log(`Configuration hash: ${postgres.getConfigHash()}`);

  } catch (error) {
    console.error('❌ Error occurred:', error.message);
    console.error('Error code:', error.code || 'Unknown');
    console.error('Stack trace:', error.stack);
  } finally {
    // Always clean up resources
    console.log('\n🧹 Cleaning up resources...');
    try {
      if (postgres.state === 'Running') {
        postgres.stopSync();
        console.log('✅ PostgreSQL stopped');
      }
    } catch (error) {
      console.warn('⚠️  Warning during stop:', error.message);
    }
    
    postgres.cleanup();
    console.log('✅ Resources cleaned up');
  }

  console.log('\n🎉 Synchronous example completed!');
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the example
try {
  syncExample();
} catch (error) {
  console.error('❌ Example failed:', error);
  process.exit(1);
}