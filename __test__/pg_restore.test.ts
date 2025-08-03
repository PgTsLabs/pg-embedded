import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PgDumpTool, PostgresInstance, PgRestoreTool, PsqlTool, PgDumpFormat, PgRestoreFormat } from '../index.js'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let pg: PostgresInstance
const dbName = `test_db_restore_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
const dumpFilePath = path.join(__dirname, 'test_restore_dump.sql')

test.before(async () => {
  pg = new PostgresInstance({
    dataDir: path.join(__dirname, 'data', dbName),
    port: 5433,
  })
  await pg.start()
  await pg.createDatabase(dbName)

  const programDir = path.join(pg.programDir, 'bin')

  // Manually construct connection config to ensure it's correct
  const connectionConfig = {
    host: pg.connectionInfo.host || 'localhost',
    port: pg.connectionInfo.port || 5433,
    username: pg.connectionInfo.username || 'postgres',
    password: pg.connectionInfo.password || '',
    database: dbName,
  }

  const psql = new PsqlTool({ connection: connectionConfig, programDir, config: {} })
  await psql.executeCommand(`
      CREATE TABLE test_table (id INT, name VARCHAR(255));
      INSERT INTO test_table VALUES (1, 'test1'), (2, 'test2');
    `)

  const pgDump = new PgDumpTool({
    connection: connectionConfig,
    programDir,
    config: {
      file: dumpFilePath,
      format: PgDumpFormat.Custom, // Use custom format for pg_restore compatibility
    },
  })
  const dumpResult = await pgDump.execute()
  if (dumpResult.exitCode !== 0) {
    throw new Error(`Failed to create dump: ${dumpResult.stderr}`)
  }
})

test.after.always(async () => {
  if (pg) {
    await pg.stop()
  }
  if (fs.existsSync(dumpFilePath)) {
    fs.unlinkSync(dumpFilePath)
  }
})

test('should restore the database from a file', async (t) => {
  const restoreDbName = `${dbName}_restore1`
  await pg.createDatabase(restoreDbName)

  const restoreConnectionConfig = {
    host: pg.connectionInfo.host || 'localhost',
    port: pg.connectionInfo.port || 5433,
    username: pg.connectionInfo.username || 'postgres',
    password: pg.connectionInfo.password || '',
    database: restoreDbName,
  }

  const programDir = path.join(pg.programDir, 'bin')
  const pgRestore = new PgRestoreTool({
    connection: restoreConnectionConfig,
    programDir,
    config: {
      file: dumpFilePath,
      format: PgRestoreFormat.Custom,
      clean: false, // Don't clean since database is empty
      create: false, // Don't create database, we already created it
      exitOnError: false, // Allow warnings
      singleTransaction: true,
      verbose: false,
      dataOnly: false,
      schemaOnly: false,
      noOwner: true, // Ignore ownership issues
      noPrivileges: true, // Ignore privilege issues
      table: [],
      trigger: [],
    },
  })

  const result = await pgRestore.execute()
  t.is(result.exitCode, 0)

  const psql = new PsqlTool({ connection: restoreConnectionConfig, programDir, config: {} })
  const { stdout } = await psql.executeCommand('SELECT * FROM test_table;')

  t.true(stdout.includes('test1'))
  t.true(stdout.includes('test2'))

  // Clean up
  await pg.dropDatabase(restoreDbName)
})

test('should restore with clean and ifExists options', async (t) => {
  const restoreDbName = `${dbName}_restore3`
  await pg.createDatabase(restoreDbName)

  const restoreConnectionConfig = {
    host: pg.connectionInfo.host || 'localhost',
    port: pg.connectionInfo.port || 5433,
    username: pg.connectionInfo.username || 'postgres',
    password: pg.connectionInfo.password || '',
    database: restoreDbName,
  }

  const programDir = path.join(pg.programDir, 'bin')

  // Pre-create a table with the same name to test the clean and ifExists functionality
  const psql = new PsqlTool({ connection: restoreConnectionConfig, programDir, config: {} })
  await psql.executeCommand('CREATE TABLE test_table (id INT, name VARCHAR(255));')

  const pgRestore = new PgRestoreTool({
    connection: restoreConnectionConfig,
    programDir,
    config: {
      file: dumpFilePath,
      format: PgRestoreFormat.Custom,
      clean: true,
      ifExists: true, // This should prevent errors from DROP TABLE on a non-existent table if it were the case
      noOwner: true,
      noPrivileges: true,
    },
  })

  const result = await pgRestore.execute()
  t.is(result.exitCode, 0, `pg_restore failed: ${result.stderr}`)

  // Verify that the data was restored correctly
  const { stdout } = await psql.executeCommand('SELECT COUNT(*) FROM test_table;')
  t.true(stdout.includes('2'), 'Expected the table to be dropped, recreated, and repopulated with 2 rows.')

  // Clean up
  await pg.dropDatabase(restoreDbName)
})

test('should restore data only', async (t) => {
  const restoreDbName = `${dbName}_restore2`
  await pg.createDatabase(restoreDbName)

  const restoreConnectionConfig2 = {
    host: pg.connectionInfo.host || 'localhost',
    port: pg.connectionInfo.port || 5433,
    username: pg.connectionInfo.username || 'postgres',
    password: pg.connectionInfo.password || '',
    database: restoreDbName,
  }

  const programDir = path.join(pg.programDir, 'bin')
  const psql = new PsqlTool({ connection: restoreConnectionConfig2, programDir, config: {} })
  await psql.executeCommand('CREATE TABLE test_table (id INT, name VARCHAR(255));')

  const pgRestore = new PgRestoreTool({
    connection: restoreConnectionConfig2,
    programDir,
    config: {
      file: dumpFilePath,
      format: PgRestoreFormat.Custom,
      dataOnly: true,
      clean: false,
      create: false,
      exitOnError: false, // Allow warnings
      singleTransaction: true,
      verbose: false,
      schemaOnly: false,
      noOwner: true, // Ignore ownership issues
      noPrivileges: true, // Ignore privilege issues
      table: [],
      trigger: [],
    },
  })

  const result = await pgRestore.execute()
  t.is(result.exitCode, 0)

  const { stdout } = await new PsqlTool({
    connection: restoreConnectionConfig2,
    programDir,
    config: {},
  }).executeCommand('SELECT * FROM test_table;')

  t.true(stdout.includes('test1'))
  t.true(stdout.includes('test2'))

  // Clean up
  await pg.dropDatabase(restoreDbName)
})
