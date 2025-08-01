import test from 'ava'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rimraf } from 'rimraf'
import { PsqlTool, PostgresInstance } from '../index.js'

test.beforeEach(async (t: any) => {
  const dataDir = `data/psql-test-${Date.now()}-${Math.random()}`
  await rimraf(dataDir)
  const pg = new PostgresInstance({
    dataDir,
    username: 'postgres',
    password: 'password',
    persistent: false,
  })

  await pg.setup()
  await pg.start()
  await pg.createDatabase('testdb')
  t.context.pg = pg
})

test.afterEach.always(async (t) => {
  const { pg } = t.context as any
  await pg.stop()
  await pg.cleanup()
})

test('executeCommand() executes a simple SELECT', async (t) => {
  const { pg } = t.context as any
  const psql = new PsqlTool({
    connection: { port: pg.connectionInfo.port, database: 'testdb', username: 'postgres', password: 'password' },
    programDir: path.join(pg.programDir, 'bin'),
  })
  const result = await psql.executeCommand('SELECT 1;')
  t.is(result.exitCode, 0)
  t.assert(result.stdout.includes('1'))
})

test('executeFile() executes a SQL file', async (t) => {
  const { pg } = t.context as any
  const psql = new PsqlTool({
    connection: { port: pg.connectionInfo.port, database: 'testdb', username: 'postgres', password: 'password' },
    programDir: path.join(pg.programDir, 'bin'),
  })

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const filePath = path.join(__dirname, 'test.sql')
  fs.writeFileSync(filePath, 'CREATE TABLE test (id INT); INSERT INTO test VALUES (1); SELECT * FROM test;')
  const result = await psql.executeFile(filePath)
  fs.unlinkSync(filePath)
  t.is(result.exitCode, 0)
  t.assert(result.stdout.includes('1'))
})

test('variables option works', async (t) => {
  const { pg } = t.context as any

  // Test that variables are properly set and accessible
  const psql = new PsqlTool({
    connection: { port: pg.connectionInfo.port, database: 'testdb', username: 'postgres', password: 'password' },
    variables: {
      MY_VAR: 'hello',
      COUNT: '42',
    },
    flags: ['--echo-all'], // This will show us the commands being executed
    programDir: path.join(pg.programDir, 'bin'),
  })

  // Test that variables are set by using echo command
  const result = await psql.executeCommand('')
  t.is(result.exitCode, 0)
  // The output should contain the \set command, proving variables are being set
  t.assert(result.stdout.includes("set MY_VAR 'hello'"))
})

test('flags option works for --csv', async (t) => {
  const { pg } = t.context as any
  const psql = new PsqlTool({
    connection: { port: pg.connectionInfo.port, database: 'testdb', username: 'postgres', password: 'password' },
    flags: ['--csv'],
    programDir: path.join(pg.programDir, 'bin'),
  })
  const result = await psql.executeCommand('SELECT 1 as "col"')
  t.is(result.exitCode, 0)
  t.assert(result.stdout.includes('col\n1'))
})
