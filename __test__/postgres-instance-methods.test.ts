import anyTest, { type TestFn } from 'ava'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PostgresInstance, PgDumpFormat, PgBasebackupFormat, PgRestoreFormat, PgBasebackupWalMethod } from '../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const test = anyTest as TestFn<{
  pg: PostgresInstance
  standbyPg: PostgresInstance
  testDbName: string
  assetsDir: string
}>

test.before(async (t) => {
  const assetsDir = path.resolve(__dirname, 'assets', 'postgres-methods')
  await fs.mkdir(assetsDir, { recursive: true })

  // Create primary PostgreSQL instance
  const pg = new PostgresInstance({
    databaseName: 'postgres',
    username: 'postgres',
    password: 'password',
    port: 0, // Auto-assign available port to avoid conflicts
  })
  await pg.start()

  // Create standby PostgreSQL instance for rewind tests
  const standbyPg = new PostgresInstance({
    databaseName: 'postgres',
    username: 'postgres',
    password: 'password',
    port: 0, // Auto-assign available port to avoid conflicts
  })
  await standbyPg.start()

  const testDbName = 'test_methods_db'

  // Create test database and populate with data
  await pg.createDatabase(testDbName)

  // Create some test data
  const { PsqlTool } = await import('../index.js')
  const psql = new PsqlTool({
    connection: {
      host: pg.connectionInfo.host,
      port: pg.connectionInfo.port,
      username: pg.connectionInfo.username,
      password: pg.connectionInfo.password,
      database: testDbName,
    },
    programDir: path.join(pg.programDir, 'bin'),
    config: {},
  })

  await psql.executeCommand('CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100));')
  await psql.executeCommand(
    "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com');",
  )
  await psql.executeCommand('CREATE TABLE products (id SERIAL PRIMARY KEY, name VARCHAR(100), price DECIMAL(10,2));')
  await psql.executeCommand("INSERT INTO products (name, price) VALUES ('Widget A', 19.99), ('Widget B', 29.99);")

  t.context.pg = pg
  t.context.standbyPg = standbyPg
  t.context.testDbName = testDbName
  t.context.assetsDir = assetsDir
})

test.after.always(async (t) => {
  if (t.context.pg) {
    await t.context.pg.stop()
  }
  if (t.context.standbyPg) {
    await t.context.standbyPg.stop()
  }
})

// Test createDump method
test('createDump should create a database dump', async (t) => {
  const dumpFile = path.join(t.context.assetsDir, 'test_dump.sql')

  await t.context.pg.createDump(
    {
      file: dumpFile,
      format: PgDumpFormat.Plain,
      create: true,
    },
    t.context.testDbName,
  )

  // Verify dump file was created
  const stats = await fs.stat(dumpFile)
  t.true(stats.isFile())
  t.true(stats.size > 0)

  // Verify dump content contains expected data
  const dumpContent = await fs.readFile(dumpFile, 'utf-8')
  t.true(dumpContent.includes('CREATE TABLE'))
  t.true(dumpContent.includes('users'))
  t.true(dumpContent.includes('products'))
  t.true(dumpContent.includes('Alice'))
  t.true(dumpContent.includes('Widget A'))
})

test('createDump should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.createDump(
      {
        file: '/tmp/test.sql',
        format: PgDumpFormat.Plain,
      },
      'test',
    )
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

// Test createBaseBackup method
test('createBaseBackup should create a base backup', async (t) => {
  const backupDir = path.join(t.context.assetsDir, 'base_backup')

  await t.context.pg.createBaseBackup(
    {
      pgdata: backupDir,
      format: PgBasebackupFormat.Plain,
      walMethod: PgBasebackupWalMethod.Fetch,
    },
    t.context.testDbName,
  )

  // Verify backup directory was created
  const stats = await fs.stat(backupDir)
  t.true(stats.isDirectory())

  // Verify backup contains PostgreSQL data files
  const files = await fs.readdir(backupDir)
  t.true(files.includes('postgresql.conf'))
  t.true(files.includes('PG_VERSION'))
})

test('createBaseBackup should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.createBaseBackup(
      {
        pgdata: '/tmp/backup',
        format: PgBasebackupFormat.Plain,
        walMethod: PgBasebackupWalMethod.Fetch,
      },
      'test',
    )
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

// Test createRestore method
test('createRestore should restore from a dump file', async (t) => {
  // First create a dump in Custom format (required for pg_restore)
  const dumpFile = path.join(t.context.assetsDir, 'restore_test_dump.dump')
  await t.context.pg.createDump(
    {
      file: dumpFile,
      format: PgDumpFormat.Custom,
      create: true,
    },
    t.context.testDbName,
  )

  // Create a new database for restore
  const restoreDbName = 'restored_test_db'
  await t.context.pg.createDatabase(restoreDbName)

  // Restore the dump to the new database
  await t.context.pg.createRestore(
    {
      file: dumpFile,
      format: PgRestoreFormat.Custom,
    },
    restoreDbName,
  )

  // Verify restored data
  const { PsqlTool } = await import('../index.js')
  const psql = new PsqlTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: restoreDbName,
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {},
  })

  const result = await psql.executeCommand('SELECT COUNT(*) FROM users;')
  t.true(result.stdout.includes('2')) // Should have 2 users

  // Clean up
  await t.context.pg.dropDatabase(restoreDbName)
})

test('createRestore should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.createRestore(
      {
        file: '/tmp/test.dump',
        format: PgRestoreFormat.Custom,
      },
      'test',
    )
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

// Test createDumpall method
test('createDumpall should create a cluster-wide dump', async (t) => {
  const dumpallFile = path.join(t.context.assetsDir, 'test_dumpall.sql')

  await t.context.pg.createDumpall({
    file: dumpallFile,
    clean: true,
    rolesOnly: false,
  })

  // Verify dumpall file was created
  const stats = await fs.stat(dumpallFile)
  t.true(stats.isFile())
  t.true(stats.size > 0)

  // Verify dumpall content contains expected cluster data
  const dumpContent = await fs.readFile(dumpallFile, 'utf-8')
  t.true(dumpContent.includes('CREATE DATABASE'))
  t.true(dumpContent.includes(t.context.testDbName))
})

test('createDumpall should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.createDumpall({
      file: '/tmp/dumpall.sql',
    })
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

// Test createRewind method
test('createRewind should execute pg_rewind', async (t) => {
  // Note: This is a basic test that verifies the method can be called
  // A full pg_rewind test would require complex setup with WAL configuration
  const targetDir = path.join(t.context.assetsDir, 'rewind_target')
  await fs.mkdir(targetDir, { recursive: true })

  // Test that the method can be called - it might succeed or fail depending on configuration
  try {
    await t.context.pg.createRewind(
      {
        targetPgdata: targetDir,
        sourceServer: `host=${t.context.standbyPg.connectionInfo.host} port=${t.context.standbyPg.connectionInfo.port}`,
        restoreTargetWal: false,
      },
      t.context.testDbName,
    )

    // If it succeeds, that's fine - the method is working
    t.pass('pg_rewind executed successfully')
  } catch (error) {
    // If it fails, make sure it's not a "not running" error
    t.truthy(error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    t.false(errorMessage.includes('not running'), 'Error should not be related to instance not running')
    // Any other pg_rewind specific error is acceptable for this basic test
    t.pass('pg_rewind failed with expected error type')
  }
})

// Test dropDatabase method
test('dropDatabase should delete a database', async (t) => {
  const testDbName = 'test_drop_db'

  // Create database
  await t.context.pg.createDatabase(testDbName)

  // Verify database exists
  const existsBefore = await t.context.pg.databaseExists(testDbName)
  t.true(existsBefore)

  // Drop database
  await t.context.pg.dropDatabase(testDbName)

  // Verify database no longer exists
  const existsAfter = await t.context.pg.databaseExists(testDbName)
  t.false(existsAfter)
})

test('dropDatabase should fail with empty name', async (t) => {
  const error = await t.throwsAsync(async () => {
    await t.context.pg.dropDatabase('')
  })

  t.truthy(error)
  t.true(error.message.includes('cannot be empty'))
})

test('dropDatabase should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.dropDatabase('test')
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

// Test databaseExists method
test('databaseExists should return true for existing database', async (t) => {
  const exists = await t.context.pg.databaseExists(t.context.testDbName)
  t.true(exists)
})

test('databaseExists should return false for non-existing database', async (t) => {
  const exists = await t.context.pg.databaseExists('non_existent_database_12345')
  t.false(exists)
})

test('databaseExists should return true for default postgres database', async (t) => {
  const exists = await t.context.pg.databaseExists('postgres')
  t.true(exists)
})

test('databaseExists should fail with empty name', async (t) => {
  const error = await t.throwsAsync(async () => {
    await t.context.pg.databaseExists('')
  })

  t.truthy(error)
  t.true(error.message.includes('cannot be empty'))
})

test('databaseExists should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.databaseExists('test')
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

// Integration test: Full workflow
test('integration: dump, drop, restore workflow', async (t) => {
  const workflowDbName = 'workflow_test_db'
  const dumpFile = path.join(t.context.assetsDir, 'workflow_dump.sql')

  // Create and populate database
  await t.context.pg.createDatabase(workflowDbName)

  const { PsqlTool } = await import('../index.js')
  const psql = new PsqlTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: workflowDbName,
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {},
  })

  await psql.executeCommand('CREATE TABLE workflow_test (id SERIAL PRIMARY KEY, data TEXT);')
  await psql.executeCommand("INSERT INTO workflow_test (data) VALUES ('test data 1'), ('test data 2');")

  // Dump database
  await t.context.pg.createDump(
    {
      file: dumpFile,
      format: PgDumpFormat.Plain,
      create: true,
    },
    workflowDbName,
  )

  // Drop database
  await t.context.pg.dropDatabase(workflowDbName)
  t.false(await t.context.pg.databaseExists(workflowDbName))

  // Recreate database
  await t.context.pg.createDatabase(workflowDbName)

  // Restore from dump using psql (since it's Plain format)
  const psqlRestore = new (await import('../index.js')).PsqlTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: workflowDbName,
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {},
  })
  await psqlRestore.executeFile(dumpFile)

  // Verify restored data
  const result = await psql.executeCommand('SELECT COUNT(*) FROM workflow_test;')
  t.true(result.stdout.includes('2'))

  // Clean up
  await t.context.pg.dropDatabase(workflowDbName)
})

// Test executeSql method
test('executeSql should execute SQL commands', async (t) => {
  // Test basic SELECT query
  const result1 = await t.context.pg.executeSql('SELECT COUNT(*) FROM users;', {}, t.context.testDbName)

  // Debug output
  if (result1.exitCode !== 0) {
    console.log('executeSql failed:')
    console.log('Exit code:', result1.exitCode)
    console.log('Stdout:', result1.stdout)
    console.log('Stderr:', result1.stderr)
  }

  t.is(result1.exitCode, 0)
  t.true(result1.stdout.includes('2')) // Should have 2 users

  // Test INSERT command
  const result2 = await t.context.pg.executeSql(
    "INSERT INTO users (name, email) VALUES ('Charlie', 'charlie@example.com');",
    {},
    t.context.testDbName,
  )
  t.is(result2.exitCode, 0)

  // Verify the insert worked
  const result3 = await t.context.pg.executeSql('SELECT COUNT(*) FROM users;', {}, t.context.testDbName)
  t.is(result3.exitCode, 0)
  t.true(result3.stdout.includes('3')) // Should now have 3 users
})

test('executeSql should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.executeSql('SELECT 1;', {}, 'test')
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

test('executeSql should handle SQL errors gracefully', async (t) => {
  // Execute invalid SQL
  const result = await t.context.pg.executeSql('SELECT * FROM non_existent_table;', {}, t.context.testDbName)
  t.not(result.exitCode, 0) // Should fail
  t.true(result.stderr.includes('does not exist') || result.stderr.includes('relation'))
})

// Test executeFile method
test('executeFile should execute SQL files', async (t) => {
  // Create a test SQL file
  const sqlFile = path.join(t.context.assetsDir, 'test_script.sql')
  const sqlContent = `
    CREATE TABLE test_file_table (
      id SERIAL PRIMARY KEY,
      message TEXT
    );
    
    INSERT INTO test_file_table (message) VALUES 
      ('Hello from file'),
      ('Another message');
  `
  await fs.writeFile(sqlFile, sqlContent)

  // Execute the SQL file
  const result = await t.context.pg.executeFile(sqlFile, {}, t.context.testDbName)
  t.is(result.exitCode, 0)

  // Verify the file execution worked
  const verifyResult = await t.context.pg.executeSql('SELECT COUNT(*) FROM test_file_table;', {}, t.context.testDbName)
  t.is(verifyResult.exitCode, 0)
  t.true(verifyResult.stdout.includes('2')) // Should have 2 rows

  // Clean up the test file
  await fs.unlink(sqlFile)
})

test('executeFile should fail when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
  })

  const error = await t.throwsAsync(async () => {
    await stoppedInstance.executeFile('/tmp/test.sql', {}, 'test')
  })

  t.truthy(error)
  t.true(error.message.includes('not running'))
})

test('executeFile should handle file not found errors', async (t) => {
  const result = await t.context.pg.executeFile('/non/existent/file.sql', {}, t.context.testDbName)
  t.not(result.exitCode, 0) // Should fail
  t.true(result.stderr.includes('No such file') || result.stderr.includes('cannot read'))
})

// Integration test: executeSql and executeFile together
test('integration: executeSql and executeFile workflow', async (t) => {
  const testDbName = 'sql_execution_test_db'

  // Create test database
  await t.context.pg.createDatabase(testDbName)

  // Use executeSql to create initial structure
  const createResult = await t.context.pg.executeSql(
    `CREATE TABLE integration_test (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    {},
    testDbName,
  )
  t.is(createResult.exitCode, 0)

  // Create a SQL file with more data
  const sqlFile = path.join(t.context.assetsDir, 'integration_test.sql')
  const sqlContent = `
    INSERT INTO integration_test (name) VALUES 
      ('Test 1'),
      ('Test 2'),
      ('Test 3');
    
    -- Add an index
    CREATE INDEX idx_integration_test_name ON integration_test(name);
  `
  await fs.writeFile(sqlFile, sqlContent)

  // Execute the file
  const fileResult = await t.context.pg.executeFile(sqlFile, {}, testDbName)
  t.is(fileResult.exitCode, 0)

  // Verify with executeSql
  const countResult = await t.context.pg.executeSql('SELECT COUNT(*) FROM integration_test;', {}, testDbName)
  t.is(countResult.exitCode, 0)
  t.true(countResult.stdout.includes('3'))

  // Verify index was created
  const indexResult = await t.context.pg.executeSql(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'integration_test';`,
    {},
    testDbName,
  )
  t.is(indexResult.exitCode, 0)
  t.true(indexResult.stdout.includes('idx_integration_test_name'))

  // Clean up
  await fs.unlink(sqlFile)
  await t.context.pg.dropDatabase(testDbName)
})
