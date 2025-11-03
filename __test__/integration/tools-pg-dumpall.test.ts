/**
 * Integration tests for pg_dumpall tool
 * Tests cluster-wide database backup functionality
 */

import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { PgDumpallTool, PsqlTool } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { getTestTimeout } from '../helpers/test-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.join(__dirname, '../assets')

if (!existsSync(assetsDir)) {
  mkdirSync(assetsDir, { recursive: true })
}

test.serial.timeout = getTestTimeout()

test.serial('pg_dumpall can dump entire cluster', async (t) => {
  const instance = createTestInstance()
  const dumpFile = path.join(assetsDir, 'test-dumpall-cluster.sql')

  try {
    await startInstanceWithRetry(instance)

    // Create multiple databases
    await instance.createDatabase('dumpall_db1')
    await instance.createDatabase('dumpall_db2')

    const info = instance.connectionInfo

    // Add data to first database
    const psql1 = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dumpall_db1',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql1.executeCommand('CREATE TABLE db1_table (id INT);')
    await psql1.executeCommand('INSERT INTO db1_table VALUES (1);')

    // Add data to second database
    const psql2 = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dumpall_db2',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql2.executeCommand('CREATE TABLE db2_table (id INT);')
    await psql2.executeCommand('INSERT INTO db2_table VALUES (2);')

    // Dump entire cluster
    const dumpallTool = new PgDumpallTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        file: dumpFile,
      },
    })

    const result = await dumpallTool.execute()
    t.is(result.exitCode, 0, 'Cluster dump should succeed')
    t.true(existsSync(dumpFile), 'Cluster dump file should exist')

    // Cleanup
    if (existsSync(dumpFile)) unlinkSync(dumpFile)
    await instance.dropDatabase('dumpall_db1')
    await instance.dropDatabase('dumpall_db2')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dumpall can return dump as string', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Create test database
    await instance.createDatabase('dumpall_string_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dumpall_string_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE string_table (id INT);')

    // Get dump as string
    const dumpallTool = new PgDumpallTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    const dumpString = await dumpallTool.executeToString()
    t.truthy(dumpString, 'Dump string should not be empty')
    t.true(dumpString.includes('CREATE DATABASE'), 'Dump should contain CREATE DATABASE')
    t.true(dumpString.includes('dumpall_string_db'), 'Dump should contain database name')

    // Cleanup
    await instance.dropDatabase('dumpall_string_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dumpall can dump globals only', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Dump globals only
    const dumpallTool = new PgDumpallTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        globalsOnly: true,
      },
    })

    const dumpString = await dumpallTool.executeToString()
    t.truthy(dumpString, 'Globals dump should not be empty')
    // Globals dump should not contain CREATE DATABASE for user databases
    t.false(dumpString.includes('CREATE TABLE'), 'Globals dump should not contain CREATE TABLE')

    t.pass('Globals-only dump succeeded')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dumpall can dump roles only', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    const info = instance.connectionInfo

    // Dump roles only
    const dumpallTool = new PgDumpallTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        rolesOnly: true,
      },
    })

    const dumpString = await dumpallTool.executeToString()
    t.truthy(dumpString, 'Roles dump should not be empty')
    t.true(dumpString.includes('CREATE ROLE') || dumpString.includes('ALTER ROLE'), 'Roles dump should contain role commands')

    t.pass('Roles-only dump succeeded')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('pg_dumpall can dump schema only', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    // Create test database with data
    await instance.createDatabase('dumpall_schema_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'dumpall_schema_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE schema_table (id INT);')
    await psql.executeCommand('INSERT INTO schema_table VALUES (1), (2);')

    // Dump schema only
    const dumpallTool = new PgDumpallTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {
        schemaOnly: true,
      },
    })

    const dumpString = await dumpallTool.executeToString()
    t.truthy(dumpString, 'Schema-only dump should not be empty')
    t.true(dumpString.includes('CREATE'), 'Schema-only dump should contain CREATE statements')
    t.false(dumpString.includes('INSERT') && dumpString.includes('COPY'), 'Schema-only dump should not contain data')

    // Cleanup
    await instance.dropDatabase('dumpall_schema_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})
