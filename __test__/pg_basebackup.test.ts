import anyTest, { type TestFn } from 'ava'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PgBasebackupTool, PostgresInstance } from '../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const test = anyTest as TestFn<{ pg: PostgresInstance; pgBasebackup: PgBasebackupTool }>

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

test('should take a base backup', async (t) => {
  const backupDir = path.resolve(__dirname, 'assets', 'backup')
  await fs.mkdir(backupDir, { recursive: true })
  const basebackupTool = new PgBasebackupTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
    },
    pgdata: backupDir,
    programDir: path.join(t.context.pg.programDir, 'bin'),
    walMethod: 'fetch',
  })
  const result = await basebackupTool.execute()
  t.is(result.exitCode, 0)
  const files = await fs.readdir(backupDir)
  t.true(files.includes('PG_VERSION'))
  await fs.rm(backupDir, { recursive: true, force: true })
})
