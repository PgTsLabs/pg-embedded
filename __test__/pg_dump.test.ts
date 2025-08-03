import anyTest, { type TestFn } from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PgDumpTool, PostgresInstance, PgDumpFormat } from '../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const test = anyTest as TestFn<{ pg: PostgresInstance; pgDump: PgDumpTool }>

test.before(async (t) => {
  const pg = new PostgresInstance({
    databaseName: 'test_db',
    username: 'postgres',
    password: 'password',
    port: 0, // Auto-assign available port to avoid conflicts
  })
  await pg.start()

  // Create the test database that we want to dump
  await pg.createDatabase('test_db')

  // Create some test data in the database
  const { PsqlTool } = await import('../index.js')
  const psql = new PsqlTool({
    connection: {
      host: pg.connectionInfo.host,
      port: pg.connectionInfo.port,
      username: pg.connectionInfo.username,
      password: pg.connectionInfo.password,
      database: 'test_db',
    },
    programDir: path.join(pg.programDir, 'bin'),
    config: {},
  })

  // Create a test table with some data
  await psql.executeCommand('CREATE SCHEMA IF NOT EXISTS test_schema;')
  await psql.executeCommand('SET search_path TO test_schema;')
  await psql.executeCommand('CREATE TABLE test_table (id SERIAL PRIMARY KEY, name VARCHAR(100));')
  await psql.executeCommand("INSERT INTO test_table (name) VALUES ('test1'), ('test2');")

  t.context.pg = pg
})

test.after.always(async (t) => {
  await t.context.pg.stop()
})

test('should dump database to a file', async (t) => {
  const dumpFile = path.resolve(__dirname, 'assets', 'dump.sql')
  const dumpTool = new PgDumpTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: 'test_db',
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      file: dumpFile,
      format: PgDumpFormat.Plain,
    },
  })
  const result = await dumpTool.execute()
  t.is(result.exitCode, 0)
  // Further checks could be added to verify the file content
})

test('should return dump as string', async (t) => {
  const dumpTool = new PgDumpTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: 'test_db',
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      create: true,
    },
  })
  const result = await dumpTool.execute()
  t.is(result.exitCode, 0)
  t.true(result.stdout.includes('CREATE DATABASE test_db'))
})

test('should dump only data', async (t) => {
  const dumpTool = new PgDumpTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: 'test_db',
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      dataOnly: true,
    },
  })
  const result = await dumpTool.execute()
  t.is(result.exitCode, 0)
  t.false(result.stdout.includes('CREATE TABLE'))
})

test('should dump only schema', async (t) => {
  const dumpTool = new PgDumpTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: 'test_db',
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      schemaOnly: true,
    },
  })
  const result = await dumpTool.execute()
  t.is(result.exitCode, 0)
  t.true(result.stdout.includes('CREATE TABLE'))
  t.false(result.stdout.includes('COPY'))
})

test('should return dump as string when calling executeToString', async (t) => {
  const dumpFile = path.resolve(__dirname, 'assets', 'dump_to_string.sql')
  const dumpTool = new PgDumpTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: 'test_db',
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      file: dumpFile, // this should be ignored
      create: true,
    },
  })
  const result = await dumpTool.executeToString()
  t.is(result.exitCode, 0)
  t.true(result.stdout.includes('CREATE DATABASE test_db'))
})

test('should exclude a specific table from the dump', async (t) => {
  const dumpTool = new PgDumpTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
      database: 'test_db',
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      excludeTable: 'public.test_table', // Table is actually in public schema
    },
  })
  const result = await dumpTool.executeToString()
  t.is(result.exitCode, 0)

  // Check that the table definition is not included
  t.false(
    result.stdout.includes('CREATE TABLE public.test_table'),
    'The dump should not include the excluded table definition',
  )
  // Check that the table data is not included
  t.false(result.stdout.includes('test1'), 'The dump should not include data from the excluded table')
  t.false(result.stdout.includes('test2'), 'The dump should not include data from the excluded table')

  // The sequence might still be there, but that's expected behavior for pg_dump
  // We mainly care that the table structure and data are excluded
})
