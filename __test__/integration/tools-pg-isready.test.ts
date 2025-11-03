/**
 * Integration tests for pg_isready tool
 * Tests PostgreSQL server readiness checking
 */

import test from 'ava'
import path from 'node:path'
import { PgIsReadyTool } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { getTestTimeout } from '../helpers/test-config.js'

test.serial.timeout = getTestTimeout()

test.serial('pg_isready returns true when server is ready', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: { port: instance.connectionInfo.port },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const isReady = await pgIsReady.check()
    t.true(isReady, 'Server should be ready')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready execute returns exit code 0 when ready', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: { port: instance.connectionInfo.port },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const result = await pgIsReady.execute()
    t.is(result.exitCode, 0, 'Exit code should be 0 when ready')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready returns false when server is not ready', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: { port: 9999 }, // Wrong port
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const isReady = await pgIsReady.check()
    t.false(isReady, 'Server should not be ready on wrong port')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready execute returns non-zero exit code when not ready', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: { port: 9999 }, // Wrong port
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const result = await pgIsReady.execute()
    t.not(result.exitCode, 0, 'Exit code should be non-zero when not ready')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready can check with host and port', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: {
        host: 'localhost',
        port: instance.connectionInfo.port,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const isReady = await pgIsReady.check()
    t.true(isReady, 'Server should be ready with host and port')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready can check with database name', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: {
        port: instance.connectionInfo.port,
        database: 'postgres',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const isReady = await pgIsReady.check()
    t.true(isReady, 'Server should be ready with database name')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready can check with username', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: {
        port: instance.connectionInfo.port,
        username: instance.connectionInfo.username,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const isReady = await pgIsReady.check()
    t.true(isReady, 'Server should be ready with username')
  } finally {
    await cleanupTestInstance(instance)
  }
})
