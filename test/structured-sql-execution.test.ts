import test from 'ava'
import { PostgresInstance, initLogger, LogLevel } from '../index.js'

// Initialize logger for tests
initLogger(LogLevel.Error)

let instance: PostgresInstance

test.before(async () => {
  instance = new PostgresInstance({
    port: 0, // Use random port
    username: 'postgres',
    password: 'password',
    persistent: false,
  })
  await instance.start()

  // Create test database and table
  await instance.createDatabase('structured_test_db')
  await instance.executeSql(
    `
    CREATE TABLE test_users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      age INTEGER,
      email VARCHAR(100),
      active BOOLEAN DEFAULT true,
      salary DECIMAL(10,2)
    );
    
    INSERT INTO test_users (name, age, email, active, salary) VALUES 
    ('Alice Johnson', 28, 'alice@example.com', true, 75000.50),
    ('Bob Smith', 35, 'bob@example.com', false, 82000.00),
    ('Charlie Brown', 42, 'charlie@example.com', true, 95000.75),
    ('Diana Prince', 30, NULL, true, 68000.25);
  `,
    'structured_test_db',
  )
})

test.after(async () => {
  if (instance) {
    await instance.dropDatabase('structured_test_db')
    await instance.stop()
  }
})

test('should execute SQL with JSON results', async (t) => {
  const result = await instance.executeSqlJson(
    'SELECT id, name, age, active FROM test_users ORDER BY id LIMIT 2;',
    'structured_test_db',
  )

  t.is(result.success, true)
  t.truthy(result.data)
  t.is(result.rowCount, 2)

  const users = JSON.parse(result.data!)
  t.is(Array.isArray(users), true)
  t.is(users.length, 2)

  // Check first user
  t.is(users[0].name, 'Alice Johnson')
  t.is(users[0].age, 28)
  t.is(users[0].active, true)

  // Check second user
  t.is(users[1].name, 'Bob Smith')
  t.is(users[1].age, 35)
  t.is(users[1].active, false)
})

test('should handle empty JSON results', async (t) => {
  const result = await instance.executeSqlJson('SELECT * FROM test_users WHERE id > 1000;', 'structured_test_db')

  t.is(result.success, true)
  t.truthy(result.data)
  t.is(result.rowCount, 0)

  const users = JSON.parse(result.data!)
  t.is(Array.isArray(users), true)
  t.is(users.length, 0)
})

test('should handle NULL values in JSON results', async (t) => {
  const result = await instance.executeSqlJson(
    'SELECT name, email FROM test_users WHERE email IS NULL;',
    'structured_test_db',
  )

  t.is(result.success, true)
  t.truthy(result.data)
  t.is(result.rowCount, 1)

  const users = JSON.parse(result.data!)
  t.is(users.length, 1)
  t.is(users[0].name, 'Diana Prince')
  t.is(users[0].email, null)
})

test('should handle different data types in JSON results', async (t) => {
  const result = await instance.executeSqlJson(
    'SELECT name, age, salary, active FROM test_users WHERE id = 1;',
    'structured_test_db',
  )

  t.is(result.success, true)
  t.truthy(result.data)

  const users = JSON.parse(result.data!)
  t.is(users.length, 1)

  const user = users[0]
  t.is(typeof user.name, 'string')
  t.is(typeof user.age, 'number')
  t.is(typeof user.salary, 'number')
  t.is(typeof user.active, 'boolean')

  t.is(user.name, 'Alice Johnson')
  t.is(user.age, 28)
  t.is(user.salary, 75000.5)
  t.is(user.active, true)
})

test('should execute structured SQL with JSON parsing', async (t) => {
  const result = await instance.executeSqlStructured(
    'SELECT id, name, age FROM test_users ORDER BY id LIMIT 2',
    'structured_test_db',
  )

  t.is(result.success, true)
  t.truthy(result.data)
  t.is(result.rowCount, 2)

  const users = JSON.parse(result.data!)
  t.is(Array.isArray(users), true)
  t.is(users.length, 2)
  
  // Verify proper JSON types
  t.is(typeof users[0].id, 'number')
  t.is(typeof users[0].name, 'string')
  t.is(typeof users[0].age, 'number')
})

test('should reject structured SQL execution when instance is not running', async (t) => {
  const stoppedInstance = new PostgresInstance()

  const error1 = await t.throwsAsync(async () => {
    await stoppedInstance.executeSqlJson('SELECT 1;')
  })

  const error2 = await t.throwsAsync(async () => {
    await stoppedInstance.executeSqlStructured('SELECT 1;')
  })

  t.true(error1.message.includes('PostgreSQL instance is not running'))
  t.true(error2.message.includes('PostgreSQL instance is not running'))
})

test('should reject empty SQL commands for structured execution', async (t) => {
  const error1 = await t.throwsAsync(async () => {
    await instance.executeSqlJson('')
  })

  const error2 = await t.throwsAsync(async () => {
    await instance.executeSqlStructured('')
  })

  t.true(error1.message.includes('SQL command cannot be empty'))
  t.true(error2.message.includes('SQL command cannot be empty'))
})

test('should handle complex queries with joins', async (t) => {
  // Create a second table for join testing
  await instance.executeSql(
    `
    CREATE TABLE departments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    );
    
    INSERT INTO departments (name) VALUES ('Engineering'), ('Marketing');
    
    ALTER TABLE test_users ADD COLUMN department_id INTEGER;
    UPDATE test_users SET department_id = 1 WHERE id IN (1, 3);
    UPDATE test_users SET department_id = 2 WHERE id IN (2, 4);
  `,
    'structured_test_db',
  )

  const result = await instance.executeSqlJson(
    `
    SELECT u.name as user_name, u.age, d.name as department_name
    FROM test_users u
    JOIN departments d ON u.department_id = d.id
    ORDER BY u.id
  `,
    'structured_test_db',
  )

  t.is(result.success, true)
  t.truthy(result.data)
  t.is(result.rowCount, 4)

  const results = JSON.parse(result.data!)
  t.is(results.length, 4)

  // Check join results
  t.is(results[0].user_name, 'Alice Johnson')
  t.is(results[0].department_name, 'Engineering')
  t.is(results[1].user_name, 'Bob Smith')
  t.is(results[1].department_name, 'Marketing')
})
