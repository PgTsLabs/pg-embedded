/**
 * Integration tests for pg_restore tool
 * Tests database restoration from dumps
 */

import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { PgDumpTool, PgRestoreTool, PgDumpFormat, PsqlTool } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { assertDatabaseExists } from '../helpers/test-assertions.js'
import { getTestTimeout } from '../helpers/test-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.join(__dirname, '../assets')

if (!existsSync(assetsDir)) {
  mkdirSync(assetsDir, { recursive: true })
}

test.serial.timeout = getTestTimeout()

test.serial('pg_restore can restore from custom format dump', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-restore-custom.dump')

  try {
    await startInstanceWithRetry(instance)

    // Create source database with data
    await instance.createDatabase('restore_source_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_source_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE restore_test (id SERIAL PRIMARY KEY, data TEXT);')
    await psql.executeCommand("INSERT INTO restore_test (data) VALUES ('restore1'), ('restore2');")

    // Dump the database
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_source_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        format: PgDumpFormat.Custom,
      },
    })

    await dumpTool.execute()
    t.true(existsSync(dumpFile), 'Dump file should exist')

    // Create target database
    await instance.createDatabase('restore_target_db')

    // Restore to target database
    const restoreTool = new PgRestoreTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_target_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
      },
    })

    const result = await restoreTool.execute()
    t.is(result.exitCode, 0, 'Restore should succeed')

    // Verify data was restored
    const verifyPsql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_target_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Just verify the command doesn't throw
    await t.notThrowsAsync(async () => {
      await verifyPsql.executeCommand('SELECT * FROM restore_test;')
    })

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('restore_source_db')
    await instance.dropDatabase('restore_target_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_restore can restore with clean option', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-restore-clean.dump')

  try {
    await startInstanceWithRetry(instance)

    // Create and dump source database
    await instance.createDatabase('restore_clean_source')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_clean_source',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE clean_test (id INT);')
    await psql.executeCommand('INSERT INTO clean_test VALUES (1);')

    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_clean_source',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        format: PgDumpFormat.Custom,
      },
    })

    await dumpTool.execute()

    // Create target and restore with clean
    await instance.createDatabase('restore_clean_target')

    const restoreTool = new PgRestoreTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_clean_target',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        clean: true,
      },
    })

    const result = await restoreTool.execute()
    t.is(result.exitCode, 0, 'Restore with clean should succeed')

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('restore_clean_source')
    await instance.dropDatabase('restore_clean_target')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_restore can restore data only', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-restore-data-only.dump')

  try {
    await startInstanceWithRetry(instance)

    // Create source with data
    await instance.createDatabase('restore_data_source')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_data_source',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE data_only_test (id INT);')
    await psql.executeCommand('INSERT INTO data_only_test VALUES (1), (2);')

    // Dump
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_data_source',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        format: PgDumpFormat.Custom,
      },
    })

    await dumpTool.execute()

    // Create target with schema
    await instance.createDatabase('restore_data_target')

    const targetPsql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_data_target',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await targetPsql.executeCommand('CREATE TABLE data_only_test (id INT);')

    // Restore data only
    const restoreTool = new PgRestoreTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_data_target',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        dataOnly: true,
      },
    })

    const result = await restoreTool.execute()
    t.is(result.exitCode, 0, 'Data-only restore should succeed')

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('restore_data_source')
    await instance.dropDatabase('restore_data_target')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_restore can restore schema only', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-restore-schema-only.dump')

  try {
    await startInstanceWithRetry(instance)

    // Create source
    await instance.createDatabase('restore_schema_source')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_schema_source',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE schema_only_test (id INT);')
    await psql.executeCommand('INSERT INTO schema_only_test VALUES (1);')

    // Dump
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_schema_source',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        format: PgDumpFormat.Custom,
      },
    })

    await dumpTool.execute()

    // Create target and restore schema only
    await instance.createDatabase('restore_schema_target')

    const restoreTool = new PgRestoreTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'restore_schema_target',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        schemaOnly: true,
      },
    })

    const result = await restoreTool.execute()
    t.is(result.exitCode, 0, 'Schema-only restore should succeed')

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('restore_schema_source')
    await instance.dropDatabase('restore_schema_target')
  } finally {
    await cleanupTestInstance(instance)
  }
})
