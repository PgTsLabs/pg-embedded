/**
 * Integration tests for psql tool
 * Tests SQL command execution and database operations
 */

import test from 'ava'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initLogger, LogLevel, PsqlTool } from '../../index.js'
import {
  createTestInstance,
  startInstanceWithRetry,
  cleanupTestInstance,
} from '../helpers/test-instance.js'
import { getTestTimeout } from '../helpers/test-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Initialize logger
initLogger(LogLevel.Info)

// Set test timeout
test.serial.timeout = getTestTimeout()

test.serial('psql can execute basic SQL commands', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_basic_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_basic_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Create table
    await psql.executeCommand('CREATE TABLE test_table (id SERIAL PRIMARY KEY, name VARCHAR(100));')

    // Insert data
    await psql.executeCommand("INSERT INTO test_table (name) VALUES ('test1'), ('test2');")

    // Query
    await t.notThrowsAsync(async () => {
      await psql.executeCommand('SELECT * FROM test_table;')
    })

    // Cleanup
    await instance.dropDatabase('psql_basic_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql can create tables with various data types', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_datatypes_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_datatypes_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Create table with various data types
    await psql.executeCommand(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL,
        age INTEGER,
        balance DECIMAL(10, 2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Insert test data
    await psql.executeCommand(`
      INSERT INTO users (username, email, age, balance) VALUES
        ('user1', 'user1@example.com', 25, 100.50),
        ('user2', 'user2@example.com', 30, 200.75),
        ('user3', 'user3@example.com', 35, 300.00);
    `)

    t.pass('Table with various data types created successfully')

    // Cleanup
    await instance.dropDatabase('psql_datatypes_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql can work with schemas', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_schema_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_schema_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Create custom schema
    await psql.executeCommand('CREATE SCHEMA test_schema;')

    // Create table in custom schema
    await psql.executeCommand('CREATE TABLE test_schema.test_table (id SERIAL PRIMARY KEY, data TEXT);')

    // Insert data
    await psql.executeCommand("INSERT INTO test_schema.test_table (data) VALUES ('test data');")

    // Set search path
    await psql.executeCommand('SET search_path TO test_schema;')

    t.pass('Schema operations succeeded')

    // Cleanup
    await instance.dropDatabase('psql_schema_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql can execute transactions', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_transaction_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_transaction_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE transaction_test (id INT);')

    // Transaction
    await psql.executeCommand('BEGIN;')
    await psql.executeCommand('INSERT INTO transaction_test VALUES (1);')
    await psql.executeCommand('INSERT INTO transaction_test VALUES (2);')
    await psql.executeCommand('COMMIT;')

    t.pass('Transaction executed successfully')

    // Cleanup
    await instance.dropDatabase('psql_transaction_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql can create and use indexes', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_index_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_index_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    await psql.executeCommand('CREATE TABLE indexed_table (id INT, name TEXT);')
    await psql.executeCommand('CREATE INDEX idx_name ON indexed_table(name);')
    await psql.executeCommand("INSERT INTO indexed_table VALUES (1, 'test');")

    t.pass('Index operations succeeded')

    // Cleanup
    await instance.dropDatabase('psql_index_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql can execute multiple sequential operations', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_sequential_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_sequential_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Sequence of operations
    await psql.executeCommand('CREATE TABLE seq_test (id SERIAL PRIMARY KEY);')
    await psql.executeCommand('INSERT INTO seq_test DEFAULT VALUES;')
    await psql.executeCommand('INSERT INTO seq_test DEFAULT VALUES;')
    await psql.executeCommand('INSERT INTO seq_test DEFAULT VALUES;')
    await psql.executeCommand('ALTER TABLE seq_test ADD COLUMN data TEXT;')
    await psql.executeCommand("UPDATE seq_test SET data = 'updated';")

    t.pass('Sequential operations succeeded')

    // Cleanup
    await instance.dropDatabase('psql_sequential_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})

test.serial('psql can handle complex queries', async (t) => {
  const instance = createTestInstance()

  try {
    await startInstanceWithRetry(instance)

    await instance.createDatabase('psql_complex_db')

    const info = instance.connectionInfo
    const psql = new PsqlTool({
      connection: {
        host: info.host,
        port: info.port,
        username: info.username,
        password: info.password,
        database: 'psql_complex_db',
      },
      programDir: path.join(instance.programDir, 'bin'),
      config: {},
    })

    // Create related tables
    await psql.executeCommand(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INT,
        total DECIMAL(10, 2)
      );
    `)

    await psql.executeCommand(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100)
      );
    `)

    // Insert data
    await psql.executeCommand("INSERT INTO customers (name) VALUES ('Customer 1'), ('Customer 2');")
    await psql.executeCommand('INSERT INTO orders (customer_id, total) VALUES (1, 100.00), (1, 200.00), (2, 150.00);')

    // Complex query with JOIN
    await t.notThrowsAsync(async () => {
      await psql.executeCommand(`
        SELECT c.name, SUM(o.total) as total_orders
        FROM customers c
        JOIN orders o ON c.id = o.customer_id
        GROUP BY c.name;
      `)
    })

    t.pass('Complex query executed successfully')

    // Cleanup
    await instance.dropDatabase('psql_complex_db')
  } finally {
    await cleanupTestInstance(instance)
  }
})
