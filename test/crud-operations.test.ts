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

  // Create test database
  await instance.createDatabase('crud_test_db')
})

test.after(async () => {
  if (instance) {
    await instance.dropDatabase('crud_test_db')
    await instance.stop()
  }
})

// Helper function to create a fresh test table for each test
async function createTestTable(tableName: string) {
  await instance.executeSql(
    `
    DROP TABLE IF EXISTS ${tableName};
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    INSERT INTO ${tableName} (name, email, age) VALUES 
    ('John Doe', 'john@example.com', 30),
    ('Alice Smith', 'alice@example.com', 25),
    ('Bob Johnson', 'bob@example.com', 35),
    ('Carol Williams', 'carol@example.com', 28);
  `,
    'crud_test_db',
  )
}

// CREATE operations
test('CREATE: should insert new record using executeSqlJson', async (t) => {
  await createTestTable('users_create')

  // Insert single record with RETURNING clause using executeSqlJson
  const insertResult = await instance.executeSqlJson(
    `
    INSERT INTO users_create (name, email, age) 
    VALUES ('New User', 'new@example.com', 40)
    RETURNING id, name, email, age
  `,
    'crud_test_db',
  )

  t.is(insertResult.success, true)
  t.is(insertResult.rowCount, 1)

  const insertedUser = JSON.parse(insertResult.data!)
  t.is(insertedUser[0].name, 'New User')
  t.is(insertedUser[0].email, 'new@example.com')
  t.is(insertedUser[0].age, 40)
})

// READ operations
test('READ: should select all records using executeSqlJson', async (t) => {
  await createTestTable('users_read_all')

  const selectResult = await instance.executeSqlJson(
    'SELECT id, name, email, age FROM users_read_all ORDER BY id',
    'crud_test_db',
  )

  t.is(selectResult.success, true)
  t.is(selectResult.rowCount, 4) // Initial 4 users

  const users = JSON.parse(selectResult.data!)
  t.is(users.length, 4)
  t.is(users[0].name, 'John Doe')
  t.is(users[1].name, 'Alice Smith')
})

test('READ: should select with WHERE condition using executeSqlJson', async (t) => {
  await createTestTable('users_read_where')

  const selectResult = await instance.executeSqlJson(
    'SELECT id, name, email, age FROM users_read_where WHERE age > 30 ORDER BY age',
    'crud_test_db',
  )

  t.is(selectResult.success, true)
  t.is(selectResult.rowCount, 1) // Only Bob Johnson (35)

  const users = JSON.parse(selectResult.data!)
  t.is(users.length, 1)
  t.is(users[0].name, 'Bob Johnson')
  t.is(users[0].age, 35)
})

test('READ: should select with aggregation using executeSqlJson', async (t) => {
  await createTestTable('users_read_agg')

  const aggregateResult = await instance.executeSqlJson(
    'SELECT COUNT(*) as total_users, AVG(age) as avg_age, MIN(age) as min_age, MAX(age) as max_age FROM users_read_agg',
    'crud_test_db',
  )

  t.is(aggregateResult.success, true)
  t.is(aggregateResult.rowCount, 1)

  const stats = JSON.parse(aggregateResult.data!)
  t.is(stats[0].total_users, 4)
  t.is(stats[0].min_age, 25)
  t.is(stats[0].max_age, 35)
})

// UPDATE operations
test('UPDATE: should update single record using executeSqlJson', async (t) => {
  await createTestTable('users_update_single')

  const updateResult = await instance.executeSqlJson(
    `
    UPDATE users_update_single 
    SET age = 31, email = 'john.doe@example.com' 
    WHERE name = 'John Doe'
    RETURNING id, name, email, age
  `,
    'crud_test_db',
  )

  t.is(updateResult.success, true)
  t.is(updateResult.rowCount, 1)

  const updatedUser = JSON.parse(updateResult.data!)
  t.is(updatedUser[0].name, 'John Doe')
  t.is(updatedUser[0].email, 'john.doe@example.com')
  t.is(updatedUser[0].age, 31)
})

test('UPDATE: should update multiple records using executeSqlJson', async (t) => {
  await createTestTable('users_update_multiple')

  const updateResult = await instance.executeSqlJson(
    `
    UPDATE users_update_multiple 
    SET age = age + 1 
    WHERE age < 30
    RETURNING id, name, age
  `,
    'crud_test_db',
  )

  t.is(updateResult.success, true)
  t.is(updateResult.rowCount, 2) // Alice (25->26) and Carol (28->29)

  const updatedUsers = JSON.parse(updateResult.data!)
  t.is(updatedUsers.length, 2)

  // Verify ages were incremented
  const ages = updatedUsers.map((u: any) => u.age).sort()
  t.deepEqual(ages, [26, 29])
})

test('UPDATE: should handle conditional updates using executeSqlJson', async (t) => {
  await createTestTable('users_update_conditional')

  const updateResult = await instance.executeSqlJson(
    `
    UPDATE users_update_conditional 
    SET email = CASE 
      WHEN age > 30 THEN LOWER(name) || '@senior.com'
      ELSE LOWER(name) || '@junior.com'
    END
    RETURNING id, name, email, age
  `,
    'crud_test_db',
  )

  t.is(updateResult.success, true)
  t.is(updateResult.rowCount, 4)

  const updatedUsers = JSON.parse(updateResult.data!)

  // Find users by name and check email patterns
  const johnDoe = updatedUsers.find((u: any) => u.name === 'John Doe')
  const aliceSmith = updatedUsers.find((u: any) => u.name === 'Alice Smith')

  t.true(johnDoe.email.includes('@junior.com')) // age 30 = 30, not > 30
  t.true(aliceSmith.email.includes('@junior.com')) // age 25 < 30
})

// DELETE operations
test('DELETE: should delete single record using executeSqlJson', async (t) => {
  await createTestTable('users_delete_single')

  const deleteResult = await instance.executeSqlJson(
    `
    DELETE FROM users_delete_single 
    WHERE name = 'Carol Williams'
    RETURNING id, name, email
  `,
    'crud_test_db',
  )

  t.is(deleteResult.success, true)
  t.is(deleteResult.rowCount, 1)

  const deletedUser = JSON.parse(deleteResult.data!)
  t.is(deletedUser[0].name, 'Carol Williams')

  // Verify record is deleted
  const countResult = await instance.executeSqlJson('SELECT COUNT(*) as count FROM users_delete_single', 'crud_test_db')
  const count = JSON.parse(countResult.data!)
  t.is(count[0].count, 3)
})

test('DELETE: should delete multiple records using executeSqlJson', async (t) => {
  await createTestTable('users_delete_multiple')

  const deleteResult = await instance.executeSqlJson(
    `
    DELETE FROM users_delete_multiple 
    WHERE age > 30
    RETURNING id, name, age
  `,
    'crud_test_db',
  )

  t.is(deleteResult.success, true)
  t.is(deleteResult.rowCount, 1) // Only Bob Johnson (35)

  const deletedUsers = JSON.parse(deleteResult.data!)
  t.is(deletedUsers.length, 1)
  t.is(deletedUsers[0].name, 'Bob Johnson')

  // Verify remaining records
  const remainingResult = await instance.executeSqlJson(
    'SELECT COUNT(*) as count FROM users_delete_multiple',
    'crud_test_db',
  )
  const remaining = JSON.parse(remainingResult.data!)
  t.is(remaining[0].count, 3) // 3 users should remain
})

test('DELETE: should handle DELETE with JOIN using executeSqlJson', async (t) => {
  // First, create additional tables for JOIN test using executeSql
  await instance.executeSql(
    `
    DROP TABLE IF EXISTS departments_join;
    DROP TABLE IF EXISTS employees_join;
    
    CREATE TABLE departments_join (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    );
    
    CREATE TABLE employees_join (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      department_id INTEGER REFERENCES departments_join(id)
    );
    
    INSERT INTO departments_join (name) VALUES ('IT'), ('HR'), ('Finance');
    INSERT INTO employees_join (name, department_id) VALUES 
    ('Employee 1', 1),
    ('Employee 2', 1),
    ('Employee 3', 2),
    ('Employee 4', 3);
  `,
    'crud_test_db',
  )

  // Delete employees from IT department
  const deleteResult = await instance.executeSqlJson(
    `
    DELETE FROM employees_join 
    WHERE department_id IN (SELECT id FROM departments_join WHERE name = 'IT')
    RETURNING id, name, department_id
  `,
    'crud_test_db',
  )

  t.is(deleteResult.success, true)
  t.is(deleteResult.rowCount, 2) // Employee 1 and Employee 2

  const deletedEmployees = JSON.parse(deleteResult.data!)
  t.is(deletedEmployees.length, 2)
  t.is(deletedEmployees[0].department_id, 1)
  t.is(deletedEmployees[1].department_id, 1)
})

// Complex CRUD operations
test('CRUD: should perform complex transaction-like operations', async (t) => {
  // Create orders table for complex operations using executeSql
  await instance.executeSql(
    `
    DROP TABLE IF EXISTS order_items_complex;
    DROP TABLE IF EXISTS orders_complex;
    
    CREATE TABLE orders_complex (
      id SERIAL PRIMARY KEY,
      customer_name VARCHAR(100) NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE order_items_complex (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders_complex(id),
      product_name VARCHAR(100) NOT NULL,
      quantity INTEGER NOT NULL,
      price DECIMAL(10,2) NOT NULL
    );
  `,
    'crud_test_db',
  )

  // Insert order with items
  const orderResult = await instance.executeSqlJson(
    `
    INSERT INTO orders_complex (customer_name, total_amount, status)
    VALUES ('Jane Customer', 299.98, 'pending')
    RETURNING id, customer_name, total_amount, status
  `,
    'crud_test_db',
  )

  t.is(orderResult.success, true)
  t.is(orderResult.rowCount, 1)

  const order = JSON.parse(orderResult.data!)
  const orderId = order[0].id

  // Insert order items
  const itemsResult = await instance.executeSqlJson(
    `
    INSERT INTO order_items_complex (order_id, product_name, quantity, price)
    VALUES 
    (${orderId}, 'Widget A', 2, 99.99),
    (${orderId}, 'Widget B', 1, 99.99)
    RETURNING id, order_id, product_name, quantity, price
  `,
    'crud_test_db',
  )

  t.is(itemsResult.success, true)
  t.is(itemsResult.rowCount, 2)

  // Read order with items (JOIN)
  const orderWithItemsResult = await instance.executeSqlJson(
    `
    SELECT 
      o.id as order_id,
      o.customer_name,
      o.total_amount,
      o.status,
      oi.product_name,
      oi.quantity,
      oi.price,
      (oi.quantity * oi.price) as item_total
    FROM orders_complex o
    JOIN order_items_complex oi ON o.id = oi.order_id
    WHERE o.id = ${orderId}
    ORDER BY oi.id
  `,
    'crud_test_db',
  )

  t.is(orderWithItemsResult.success, true)
  t.is(orderWithItemsResult.rowCount, 2)

  const orderWithItems = JSON.parse(orderWithItemsResult.data!)
  t.is(orderWithItems[0].customer_name, 'Jane Customer')
  t.is(orderWithItems[0].product_name, 'Widget A')
  t.is(orderWithItems[1].product_name, 'Widget B')

  // Update order status
  const updateOrderResult = await instance.executeSqlJson(
    `
    UPDATE orders_complex 
    SET status = 'completed'
    WHERE id = ${orderId}
    RETURNING id, status
  `,
    'crud_test_db',
  )

  t.is(updateOrderResult.success, true)
  const updatedOrder = JSON.parse(updateOrderResult.data!)
  t.is(updatedOrder[0].status, 'completed')
})

// Test with executeSqlStructured for CRUD operations
test('CRUD: should work with executeSqlStructured for JSON parsing', async (t) => {
  // Create simple test table using executeSql
  await instance.executeSql(
    `
    DROP TABLE IF EXISTS products_json;
    CREATE TABLE products_json (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL
    );
    
    INSERT INTO products_json (name, price) VALUES 
    ('Product A', 19.99),
    ('Product B', 29.99),
    ('Product C', 39.99);
  `,
    'crud_test_db',
  )

  // Read using executeSqlStructured
  const result = await instance.executeSqlStructured(
    'SELECT id, name, price FROM products_json ORDER BY price',
    'crud_test_db',
  )

  t.is(result.success, true)
  t.is(result.rowCount, 3)

  const products = JSON.parse(result.data!)
  t.is(products.length, 3)
  t.is(products[0].name, 'Product A')
  t.is(products[0].price, 19.99) // JSON parsing returns proper number type
  t.is(products[2].name, 'Product C')
  t.is(products[2].price, 39.99)
})
