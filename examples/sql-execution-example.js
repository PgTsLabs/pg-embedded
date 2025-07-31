import { PostgresInstance, initLogger, LogLevel } from '../index.js'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Initialize logger
initLogger(LogLevel.Info)

async function sqlExecutionExample() {
  console.log('🚀 Starting SQL Execution Example...\n')

  // Create a new PostgreSQL instance
  const instance = new PostgresInstance({
    port: 0, // Use random port
    username: 'postgres',
    password: 'password',
    persistent: false,
  })

  try {
    // Start the instance
    console.log('📦 Starting PostgreSQL instance...')
    await instance.start()
    console.log(`✅ PostgreSQL started on port ${instance.connectionInfo.port}\n`)

    // Execute a simple query
    console.log('🔍 Executing simple query...')
    const versionResult = await instance.executeSql('SELECT version();')
    console.log('Query result:', versionResult.stdout.trim())
    console.log('Success:', versionResult.success, '\n')

    // Create a test database
    console.log('🗄️  Creating test database...')
    await instance.createDatabase('example_db')
    console.log('Database created successfully\n')

    // Create a table and insert data
    console.log('📋 Creating table and inserting data...')
    const createTableResult = await instance.executeSql(
      `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
      'example_db',
    )

    if (createTableResult.success) {
      console.log('✅ Table created successfully')
    }

    // Insert sample data
    const insertResult = await instance.executeSql(
      `
      INSERT INTO users (name, email) VALUES 
      ('Alice Johnson', 'alice@example.com'),
      ('Bob Smith', 'bob@example.com'),
      ('Charlie Brown', 'charlie@example.com');
    `,
      'example_db',
    )

    if (insertResult.success) {
      console.log('✅ Sample data inserted successfully')
    }

    // Query the data
    console.log('\n📊 Querying user data...')
    const selectResult = await instance.executeSql('SELECT id, name, email FROM users ORDER BY id;', 'example_db')

    if (selectResult.success) {
      console.log('Query results:')
      console.log(selectResult.stdout)
    }

    // Demonstrate SQL file execution
    console.log('📄 Creating and executing SQL file...')

    // Create a temporary SQL file
    const sqlContent = `
-- Add a new column to users table
ALTER TABLE users ADD COLUMN age INTEGER;

-- Update users with sample ages
UPDATE users SET age = 25 WHERE name = 'Alice Johnson';
UPDATE users SET age = 30 WHERE name = 'Bob Smith';
UPDATE users SET age = 28 WHERE name = 'Charlie Brown';

-- Query updated data
SELECT name, email, age FROM users WHERE age > 26 ORDER BY age;
`

    const tempSqlFile = path.join(__dirname, 'temp_update.sql')
    fs.writeFileSync(tempSqlFile, sqlContent)

    const fileResult = await instance.executeSqlFile(tempSqlFile, 'example_db')
    if (fileResult.success) {
      console.log('✅ SQL file executed successfully')
      console.log('Results:')
      console.log(fileResult.stdout)
    }

    // Clean up the temporary file
    fs.unlinkSync(tempSqlFile)

    // Demonstrate error handling
    console.log('\n❌ Demonstrating error handling (this is expected to fail)...')
    try {
      await instance.executeSql('SELECT * FROM non_existent_table;', 'example_db')
      console.log('❌ This should not happen - query should have failed!')
    } catch (error) {
      console.log('✅ Expected error caught successfully:', error.message.split('\n')[0])
      console.log('   This demonstrates proper error handling for invalid SQL queries.')
    }

    // Clean up
    console.log('\n🧹 Cleaning up...')
    await instance.dropDatabase('example_db')
    console.log('Database dropped successfully')
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    // Stop the instance
    console.log('🛑 Stopping PostgreSQL instance...')
    await instance.stop()
    console.log('✅ PostgreSQL stopped successfully')
  }
}

// Run the example
sqlExecutionExample().catch(console.error)
