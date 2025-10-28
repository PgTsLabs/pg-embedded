import anyTest, { type TestFn } from 'ava'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { rimraf } from 'rimraf'
import { PgBasebackupTool, PgBasebackupWalMethod, PostgresInstance } from '../index.js'
import { startInstanceWithRetry, safeCleanupInstance, safeStopInstance } from './_test-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const test = anyTest as TestFn<{ pg: PostgresInstance; pgBasebackup: PgBasebackupTool }>

test.before(async (t) => {
  const dataDir = path.resolve(__dirname, 'tmp', `pg_basebackup_instance_${Date.now()}_${Math.random()}`)
  const tempDir = path.resolve(__dirname, 'tmp', `pg_basebackup_output_${Date.now()}_${Math.random()}`)

  await rimraf(dataDir)
  await rimraf(tempDir)

  const pg = new PostgresInstance({
    databaseName: 'test_db',
    username: 'postgres',
    password: 'password',
    port: 0, // Auto-assign available port to avoid conflicts
    dataDir,
    persistent: false,
    timeout: 180,
  })

  try {
    await startInstanceWithRetry(pg, 3, 180)
    await fs.mkdir(tempDir, { recursive: true })

    t.context.pg = pg
    t.context.dataDir = dataDir
    t.context.tempDir = tempDir
  } catch (error) {
    await safeStopInstance(pg)
    await safeCleanupInstance(pg)
    await rimraf(dataDir).catch(() => {})
    await rimraf(tempDir).catch(() => {})
    throw error
  }
})

test.after.always(async (t) => {
  if (t.context.pg) {
    await safeStopInstance(t.context.pg)
    await safeCleanupInstance(t.context.pg)
  }
  if (t.context.dataDir) {
    await rimraf(t.context.dataDir).catch(() => {})
  }
  if (t.context.tempDir) {
    await rimraf(t.context.tempDir).catch(() => {})
  }
})

test('should take a base backup', async (t) => {
  const backupDir = path.join(t.context.tempDir, 'backup')

  // Clean up any existing backup directory
  await fs.rm(backupDir, { recursive: true, force: true })

  const basebackupTool = new PgBasebackupTool({
    connection: {
      host: t.context.pg.connectionInfo.host,
      port: t.context.pg.connectionInfo.port,
      username: t.context.pg.connectionInfo.username,
      password: t.context.pg.connectionInfo.password,
    },
    programDir: path.join(t.context.pg.programDir, 'bin'),
    config: {
      pgdata: backupDir,
      walMethod: PgBasebackupWalMethod.Fetch, // PgBasebackupWalMethod.Fetch
    },
  })
  const result = await basebackupTool.execute()

  // Log the result for debugging
  if (result.exitCode !== 0) {
    console.log('pg_basebackup failed:')
    console.log('Exit code:', result.exitCode)
    console.log('Stdout:', result.stdout)
    console.log('Stderr:', result.stderr)
  }

  t.is(result.exitCode, 0)
  const files = await fs.readdir(backupDir)
  t.true(files.includes('PG_VERSION'))
  await fs.rm(backupDir, { recursive: true, force: true })
})
