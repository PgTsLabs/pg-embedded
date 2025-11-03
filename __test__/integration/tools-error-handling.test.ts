/**
 * Integration tests for tool error handling
 * Tests error cases and edge conditions for all PostgreSQL tools
 */

import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PgDumpTool, PgRestoreTool, PgIsReadyTool, PsqlTool, PgDumpFormat } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { getTestTimeout } from '../helpers/test-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.serial.timeout = getTestTimeout()

test.serial('pg_dump fails gracefully with non-existent database', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'nonexistent_database_12345',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        format: PgDumpFormat.Plain,
      },
    })

    await t.throwsAsync(async () => {
      await dumpTool.executeToString()
    }, undefined, 'Should throw error for non-existent database')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_restore fails gracefully with invalid dump file', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('restore_error_db')

    const info = instance.connectionInfo

    const restoreTool = new PgRestoreTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_error_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: '/nonexistent/path/to/dump.sql',
      },
    })

    await t.throwsAsync(async () => {
      await restoreTool.execute()
    }, undefined, 'Should throw error for invalid dump file')

    await instance.dropDatabase('restore_error_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready detects wrong port correctly', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: { port: 9999 },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const isReady = await pgIsReady.check()
    t.false(isReady, 'Should return false for wrong port')

    const result = await pgIsReady.execute()
    t.not(result.exitCode, 0, 'Exit code should be non-zero for wrong port')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_isready detects wrong host correctly', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const pgIsReady = new PgIsReadyTool({
      connection: {
        host: 'nonexistent.host.invalid',
        port: instance.connectionInfo.port,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const isReady = await pgIsReady.check()
    t.false(isReady, 'Should return false for wrong host')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql fails gracefully with invalid SQL', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_error_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_error_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Invalid SQL syntax
    await t.throwsAsync(async () => {
      await psql.executeCommand('INVALID SQL SYNTAX HERE;')
    }, undefined, 'Should throw error for invalid SQL')

    await instance.dropDatabase('psql_error_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql fails gracefully with non-existent table', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_table_error_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_table_error_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Query non-existent table
    await t.throwsAsync(async () => {
      await psql.executeCommand('SELECT * FROM nonexistent_table_12345;')
    }, undefined, 'Should throw error for non-existent table')

    await instance.dropDatabase('psql_table_error_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql handles constraint violations', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_constraint_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_constraint_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Create table with unique constraint
    await psql.executeCommand('CREATE TABLE constraint_test (id INT UNIQUE);')
    await psql.executeCommand('INSERT INTO constraint_test VALUES (1);')

    // Attempt to insert duplicate
    await t.throwsAsync(async () => {
      await psql.executeCommand('INSERT INTO constraint_test VALUES (1);')
    }, undefined, 'Should throw error for constraint violation')

    await instance.dropDatabase('psql_constraint_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql handles foreign key violations', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_fk_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_fk_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Create tables with foreign key
    await psql.executeCommand('CREATE TABLE parent (id INT PRIMARY KEY);')
    await psql.executeCommand('CREATE TABLE child (id INT, parent_id INT REFERENCES parent(id));')

    // Attempt to insert with non-existent parent
    await t.throwsAsync(async () => {
      await psql.executeCommand('INSERT INTO child VALUES (1, 999);')
    }, undefined, 'Should throw error for foreign key violation')

    await instance.dropDatabase('psql_fk_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dump handles permission errors gracefully', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('dump_permission_db')

    const info = instance.connectionInfo

    // Try to dump with wrong credentials
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: 'nonexistent_user',
        password: 'wrong_password',
        database: 'dump_permission_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        format: PgDumpFormat.Plain,
      },
    })

    await t.throwsAsync(async () => {
      await dumpTool.executeToString()
    }, undefined, 'Should throw error for authentication failure')

    await instance.dropDatabase('dump_permission_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('Tools handle connection timeout gracefully', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Stop the instance to simulate connection failure
    await instance.stopWithTimeout(30)

    const info = instance.connectionInfo

    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'postgres',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await t.throwsAsync(async () => {
      await psql.executeCommand('SELECT 1;')
    }, undefined, 'Should throw error when server is stopped')
  } finally {
    await cleanupTestInstance(instance)
  }
})
