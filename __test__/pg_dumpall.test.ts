import anyTest, { type TestFn } from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PgDumpallTool, PostgresInstance } from '../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const test = anyTest as TestFn<{ pg: PostgresInstance; pgDumpall: PgDumpallTool }>

test.before(async (t) => {
  const pg = new PostgresInstance({
    databaseName: 'test_db',
    username: 'postgres',
    password: 'password',
    port: 0, // Auto-assign available port to avoid conflicts
  })
  await pg.start()
  t.context.pg = pg
})

test.after.always(async (t) => {
  await t.context.pg.stop()
})

test('should dump all databases to a file', async (t) => {
  const dumpFile = path.resolve(__dirname, 'assets', 'dumpall.sql')
  const dumpallTool = new PgDumpallTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      file: dumpFile,
    },
  })
  const result = await dumpallTool.execute()
  t.is(result.exitCode, 0)
})

test('should return dump as string', async (t) => {
  const dumpallTool = new PgDumpallTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {},
  })
  const result = await dumpallTool.executeToString()
  t.is(result.exitCode, 0)
  t.true(result.stdout.includes('CREATE ROLE postgres;'))
})

test('should dump only globals', async (t) => {
  const dumpallTool = new PgDumpallTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      globalsOnly: true,
    },
  })
  const result = await dumpallTool.executeToString()
  t.is(result.exitCode, 0)
  t.true(result.stdout.includes('CREATE ROLE postgres;'))
  t.false(result.stdout.includes('CREATE DATABASE'))
})
