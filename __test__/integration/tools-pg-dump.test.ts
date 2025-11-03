/**
 * Integration tests for pg_dump tool
 * Tests database backup functionality with various formats and options
 */

import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { PgDumpTool, PgDumpFormat, PsqlTool } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { getTestTimeout } from '../helpers/test-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.join(__dirname, '../assets')

// Ensure assets directory exists
if (!existsSync(assetsDir)) {
  mkdirSync(assetsDir, { recursive: true })
}

test.serial.timeout = getTestTimeout()

test.serial('pg_dump can dump database to plain SQL file', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-dump-plain.sql')

  try {
    await startInstanceWithRetry(instance)

    // Create test database with data
    await instance.createDatabase('dump_test_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_test_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE test_data (id SERIAL PRIMARY KEY, value TEXT);')
    await psql.executeCommand("INSERT INTO test_data (value) VALUES ('test1'), ('test2'), ('test3');")

    // Dump database
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_test_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        format: PgDumpFormat.Plain,
      },
    })

    const result = await dumpTool.execute()
    t.is(result.exitCode, 0, 'Dump should succeed')
    t.true(existsSync(dumpFile), 'Dump file should exist')

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('dump_test_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dump can dump database to custom format', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-dump-custom.dump')

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('dump_custom_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_custom_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE custom_data (id INT, name TEXT);')
    await psql.executeCommand("INSERT INTO custom_data VALUES (1, 'custom1'), (2, 'custom2');")

    // Dump in custom format
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_custom_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        format: PgDumpFormat.Custom,
      },
    })

    const result = await dumpTool.execute()
    t.is(result.exitCode, 0, 'Custom format dump should succeed')
    t.true(existsSync(dumpFile), 'Custom dump file should exist')

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('dump_custom_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dump can return dump as string', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('dump_string_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_string_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE string_data (id INT);')
    await psql.executeCommand('INSERT INTO string_data VALUES (1), (2);')

    // Get dump as string
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_string_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        format: PgDumpFormat.Plain,
      },
    })

    const dumpString = await dumpTool.executeToString()
    t.truthy(dumpString, 'Dump string should not be empty')
    t.true(dumpString.includes('string_data'), 'Dump should contain table name')
    t.true(dumpString.includes('CREATE TABLE'), 'Dump should contain CREATE TABLE')

    // Cleanup
    await instance.dropDatabase('dump_string_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dump can dump specific schema', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-dump-schema.sql')

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('dump_schema_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_schema_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE SCHEMA test_schema;')
    await psql.executeCommand('CREATE TABLE test_schema.schema_data (id INT);')
    await psql.executeCommand('INSERT INTO test_schema.schema_data VALUES (1);')

    // Dump specific schema
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_schema_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
        format: PgDumpFormat.Plain,
        schema: 'test_schema',
      },
    })

    const result = await dumpTool.execute()
    t.is(result.exitCode, 0, 'Schema dump should succeed')
    t.true(existsSync(dumpFile), 'Schema dump file should exist')

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('dump_schema_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dump can dump data only', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('dump_data_only_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_data_only_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE data_only (id INT);')
    await psql.executeCommand('INSERT INTO data_only VALUES (1), (2), (3);')

    // Dump data only
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_data_only_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        format: PgDumpFormat.Plain,
        dataOnly: true,
      },
    })

    const dumpString = await dumpTool.executeToString()
    t.truthy(dumpString, 'Data-only dump should not be empty')
    t.false(dumpString.includes('CREATE TABLE'), 'Data-only dump should not contain CREATE TABLE')
    t.true(dumpString.includes('INSERT') || dumpString.includes('COPY'), 'Data-only dump should contain data')

    // Cleanup
    await instance.dropDatabase('dump_data_only_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dump can dump schema only', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('dump_schema_only_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_schema_only_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE schema_only (id INT);')
    await psql.executeCommand('INSERT INTO schema_only VALUES (1), (2);')

    // Dump schema only
    const dumpTool = new PgDumpTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dump_schema_only_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        format: PgDumpFormat.Plain,
        schemaOnly: true,
      },
    })

    const dumpString = await dumpTool.executeToString()
    t.truthy(dumpString, 'Schema-only dump should not be empty')
    t.true(dumpString.includes('CREATE TABLE'), 'Schema-only dump should contain CREATE TABLE')
    t.false(dumpString.includes('INSERT') && dumpString.includes('COPY'), 'Schema-only dump should not contain data')

    // Cleanup
    await instance.dropDatabase('dump_schema_only_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})
