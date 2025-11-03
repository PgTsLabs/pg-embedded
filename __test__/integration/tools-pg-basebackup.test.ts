/**
 * Integration tests for pg_basebackup tool
 * Tests physical backup functionality
 */

import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { PgBasebackupTool, PgBasebackupFormat, PgBasebackupWalMethod } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { getTestTimeout } from '../helpers/test-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backupDir = path.join(__dirname, '../tmp/backups')

// Ensure backup directory exists
if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true })
}

test.serial.timeout = getTestTimeout()

test.serial('pg_basebackup can create plain format backup', async (t) => {
  const instance = createTestInstance()
  const targetDir = path.join(backupDir, 'plain-backup')

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Create backup
    const basebackupTool = new PgBasebackupTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        pgdata: targetDir,
        format: PgBasebackupFormat.Plain,
        walMethod: PgBasebackupWalMethod.Fetch,
      },
    })

    const result = await basebackupTool.execute()
    t.is(result.exitCode, 0, 'Backup should succeed')
    t.true(existsSync(targetDir), 'Backup directory should exist')
    t.true(existsSync(path.join(targetDir, 'PG_VERSION')), 'PG_VERSION file should exist')

    // Cleanup
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_basebackup can create tar format backup', async (t) => {
  const instance = createTestInstance()
  const targetDir = path.join(backupDir, 'tar-backup')

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Create tar backup
    const basebackupTool = new PgBasebackupTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        pgdata: targetDir,
        format: PgBasebackupFormat.Tar,
        walMethod: PgBasebackupWalMethod.Fetch,
      },
    })

    const result = await basebackupTool.execute()
    t.is(result.exitCode, 0, 'Tar backup should succeed')
    t.true(existsSync(targetDir), 'Backup directory should exist')

    // Cleanup
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_basebackup can use stream WAL method', async (t) => {
  const instance = createTestInstance()
  const targetDir = path.join(backupDir, 'stream-backup')

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Create backup with stream WAL method
    const basebackupTool = new PgBasebackupTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        pgdata: targetDir,
        format: PgBasebackupFormat.Plain,
        walMethod: PgBasebackupWalMethod.Stream,
      },
    })

    const result = await basebackupTool.execute()
    t.is(result.exitCode, 0, 'Stream backup should succeed')
    t.true(existsSync(targetDir), 'Backup directory should exist')

    // Cleanup
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_basebackup can create compressed backup', async (t) => {
  const instance = createTestInstance()
  const targetDir = path.join(backupDir, 'compressed-backup')

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Create compressed backup
    const basebackupTool = new PgBasebackupTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        pgdata: targetDir,
        format: PgBasebackupFormat.Tar,
        walMethod: PgBasebackupWalMethod.Fetch,
        compress: 1, // Compression level 1-9
      },
    })

    const result = await basebackupTool.execute()
    t.is(result.exitCode, 0, 'Compressed backup should succeed')
    t.true(existsSync(targetDir), 'Backup directory should exist')

    // Cleanup
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_basebackup can show progress', async (t) => {
  const instance = createTestInstance()
  const targetDir = path.join(backupDir, 'progress-backup')

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Create backup with progress
    const basebackupTool = new PgBasebackupTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        pgdata: targetDir,
        format: PgBasebackupFormat.Plain,
        walMethod: PgBasebackupWalMethod.Fetch,
        progress: true,
      },
    })

    const result = await basebackupTool.execute()
    t.is(result.exitCode, 0, 'Backup with progress should succeed')
    t.true(existsSync(targetDir), 'Backup directory should exist')

    // Cleanup
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_basebackup can create backup with checkpoint', async (t) => {
  const instance = createTestInstance()
  const targetDir = path.join(backupDir, 'checkpoint-backup')

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Create backup with fast checkpoint
    const basebackupTool = new PgBasebackupTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        pgdata: targetDir,
        format: PgBasebackupFormat.Plain,
        walMethod: PgBasebackupWalMethod.Fetch,
        checkpoint: 'fast',
      },
    })

    const result = await basebackupTool.execute()
    t.is(result.exitCode, 0, 'Backup with checkpoint should succeed')
    t.true(existsSync(targetDir), 'Backup directory should exist')

    // Cleanup
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_basebackup validates required pgdata parameter', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Attempt to create backup without pgdata should fail
    t.throws(() => {
      new PgBasebackupTool({
        connection: {
          host: info.host,
          port: info.port,
          username: info.username,
          password: info.password,
        },
        programDir: path.join(instance.programDir, 'bin'),
        config: {
          // Missing pgdata
          format: PgBasebackupFormat.Plain,
        } as any,
      })
    })
  } finally {
    await cleanupTestInstance(instance)
  }
})
