import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rimraf } from 'rimraf'
import { PostgresInstance, PgIsReadyTool } from '../index.js'
import { startInstanceWithRetry, safeCleanupInstance, safeStopInstance } from './_test-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.beforeEach(async (t) => {
  const dataDir = path.resolve(__dirname, 'tmp', `pg_isready_${Date.now()}_${Math.random()}`)
  await rimraf(dataDir)

  const pg = new PostgresInstance({ port: 0, persistent: false, timeout: 180, dataDir })

  try {
    await startInstanceWithRetry(pg, 3, 180)
    t.context = { pg, dataDir }
  } catch (error) {
    await safeStopInstance(pg)
    await safeCleanupInstance(pg)
    await rimraf(dataDir).catch(() => {})
    throw error
  }
})

test.afterEach.always(async (t) => {
  const { pg } = t.context as any
  if (pg) {
    await safeStopInstance(pg)
    await safeCleanupInstance(pg)
  }
  const { dataDir } = t.context as any
  if (dataDir) {
    await rimraf(dataDir).catch(() => {})
  }
})

test('check() returns true when server is ready', async (t) => {
  const { pg } = t.context as any

  const pgIsReady = new PgIsReadyTool({
    connection: { port: pg.connectionInfo.port },
    programDir: path.join(pg.programDir, 'bin'),
    config: {},
  })
  const isReady = await pgIsReady.check()
  t.true(isReady)
})

test('execute() returns exit code 0 when server is ready', async (t) => {
  const { pg } = t.context as any

  const pgIsReady = new PgIsReadyTool({
    connection: { port: pg.connectionInfo.port },
    programDir: path.join(pg.programDir, 'bin'),
    config: {},
  })
  const result = await pgIsReady.execute()
  t.is(result.exitCode, 0)
})

test('check() returns false when server is not ready', async (t) => {
  const { pg } = t.context as any
  const pgIsReady = new PgIsReadyTool({
    connection: { port: 1234 }, // Wrong port
    programDir: path.join(pg.programDir, 'bin'),
    config: {},
  })
  const isReady = await pgIsReady.check()
  t.false(isReady)
})

test('execute() returns a non-zero exit code when server is not ready', async (t) => {
  const { pg } = t.context as any

  const pgIsReady = new PgIsReadyTool({
    connection: { port: 1234 }, // Wrong port
    programDir: path.join(pg.programDir, 'bin'),
    config: {},
  })
  const result = await pgIsReady.execute()
  t.not(result.exitCode, 0)
})
