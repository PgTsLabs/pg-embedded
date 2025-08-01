import test from 'ava'
import { PostgresInstance, PgIsReadyTool } from '../index.js'
import path from 'node:path'

test.beforeEach(async (t) => {
  const pg = new PostgresInstance({ port: 0, persistent: false })

  await pg.start()
  t.context = { pg }
})

test.afterEach.always(async (t) => {
  const { pg } = t.context as any
  if (pg) {
    await pg.stop()
  }
})

test('check() returns true when server is ready', async (t) => {
  const { pg } = t.context as any

  const pgIsReady = new PgIsReadyTool({
    connection: { port: pg.connectionInfo.port },
    programDir: path.join(pg.programDir, 'bin'),
  })
  const isReady = await pgIsReady.check()
  t.true(isReady)
})

test('execute() returns exit code 0 when server is ready', async (t) => {
  const { pg } = t.context as any

  const pgIsReady = new PgIsReadyTool({
    connection: { port: pg.connectionInfo.port },
    programDir: path.join(pg.programDir, 'bin'),
  })
  const result = await pgIsReady.execute()
  t.is(result.exitCode, 0)
})

test('check() returns false when server is not ready', async (t) => {
  const { pg } = t.context as any
  const pgIsReady = new PgIsReadyTool({
    connection: { port: 1234 }, // Wrong port
    programDir: path.join(pg.programDir, 'bin'),
  })
  const isReady = await pgIsReady.check()
  t.false(isReady)
})

test('execute() returns a non-zero exit code when server is not ready', async (t) => {
  const { pg } = t.context as any

  const pgIsReady = new PgIsReadyTool({
    connection: { port: 1234 }, // Wrong port
    programDir: path.join(pg.programDir, 'bin'),
  })
  const result = await pgIsReady.execute()
  t.not(result.exitCode, 0)
})
