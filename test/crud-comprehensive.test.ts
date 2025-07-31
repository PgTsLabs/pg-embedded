import test from 'ava'
import { PostgresInstance, initLogger, LogLevel } from '../index.js'

// Initialize logger for tests - use higher level to reduce noise
initLogger(LogLevel.Error)

let instance: PostgresInstance

test.before(async () => {
  instance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
    persistent: false,
  })
  await instance.start()
  await instance.createDatabase('crud_comprehensive_db')
})

test.after(async () => {
  if (instance) {
    await instance.dropDatabase('crud_comprehensive_db')
    await instance.stop()
  }
})

test('CRUD: Complete Create, Read, Update, Delete cycle', async (t) => {
  // CREATE: Create table and insert data
  await instance.executeSql(
    `
    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      category VARCHAR(50),
      in_stock BOOLEAN DEFAULT true
    )
  `,
    'crud_comprehensive_db',
  )

  // CREATE: Insert data with RETURNING
  const insertResult = await instance.executeSqlJson(
    `
    INSERT INTO products (name, price, category, in_stock) VALUES 
    ('Laptop', 999.99, 'Electronics', true),
    ('Mouse', 29.99, 'Electronics', true),
    ('Desk', 199.99, 'Furniture', false)
    RETURNING id, name, price, category, in_stock
  `,
    'crud_comprehensive_db',
  )

  t.is(insertResult.success, true)
  t.is(insertResult.rowCount, 3)

  const insertedProducts = JSON.parse(insertResult.data!)
  t.is(insertedProducts.length, 3)
  t.is(insertedProducts[0].name, 'Laptop')
  t.is(insertedProducts[1].name, 'Mouse')
  t.is(insertedProducts[2].name, 'Desk')

  // READ: Select all products
  const selectAllResult = await instance.executeSqlJson(
    'SELECT id, name, price, category, in_stock FROM products ORDER BY id',
    'crud_comprehensive_db',
  )

  t.is(selectAllResult.success, true)
  t.is(selectAllResult.rowCount, 3)

  const allProducts = JSON.parse(selectAllResult.data!)
  t.is(allProducts.length, 3)

  // READ: Select with WHERE condition
  const selectElectronicsResult = await instance.executeSqlJson(
    "SELECT name, price FROM products WHERE category = 'Electronics' ORDER BY price",
    'crud_comprehensive_db',
  )

  t.is(selectElectronicsResult.success, true)
  t.is(selectElectronicsResult.rowCount, 2)

  const electronics = JSON.parse(selectElectronicsResult.data!)
  t.is(electronics[0].name, 'Mouse') // Cheaper first
  t.is(electronics[1].name, 'Laptop')

  // READ: Aggregation query
  const aggregateResult = await instance.executeSqlJson(
    'SELECT category, COUNT(*) as count, AVG(price) as avg_price FROM products GROUP BY category ORDER BY category',
    'crud_comprehensive_db',
  )

  t.is(aggregateResult.success, true)
  t.is(aggregateResult.rowCount, 2)

  const categoryStats = JSON.parse(aggregateResult.data!)
  t.is(categoryStats[0].category, 'Electronics')
  t.is(categoryStats[0].count, 2)
  t.is(categoryStats[1].category, 'Furniture')
  t.is(categoryStats[1].count, 1)

  // UPDATE: Update single record
  const updateSingleResult = await instance.executeSqlJson(
    `
    UPDATE products 
    SET price = 899.99, in_stock = false 
    WHERE name = 'Laptop'
    RETURNING id, name, price, in_stock
  `,
    'crud_comprehensive_db',
  )

  t.is(updateSingleResult.success, true)
  t.is(updateSingleResult.rowCount, 1)

  const updatedLaptop = JSON.parse(updateSingleResult.data!)
  t.is(updatedLaptop[0].name, 'Laptop')
  t.is(parseFloat(updatedLaptop[0].price), 899.99)
  t.is(updatedLaptop[0].in_stock, false)

  // UPDATE: Update multiple records
  const updateMultipleResult = await instance.executeSqlJson(
    `
    UPDATE products 
    SET in_stock = true 
    WHERE category = 'Electronics'
    RETURNING name, in_stock
  `,
    'crud_comprehensive_db',
  )

  t.is(updateMultipleResult.success, true)
  t.is(updateMultipleResult.rowCount, 2)

  const updatedElectronics = JSON.parse(updateMultipleResult.data!)
  t.true(updatedElectronics.every((p: any) => p.in_stock === true))

  // DELETE: Delete single record
  const deleteSingleResult = await instance.executeSqlJson(
    `
    DELETE FROM products 
    WHERE name = 'Desk'
    RETURNING id, name
  `,
    'crud_comprehensive_db',
  )

  t.is(deleteSingleResult.success, true)
  t.is(deleteSingleResult.rowCount, 1)

  const deletedProduct = JSON.parse(deleteSingleResult.data!)
  t.is(deletedProduct[0].name, 'Desk')

  // Verify deletion
  const countAfterDeleteResult = await instance.executeSqlJson(
    'SELECT COUNT(*) as count FROM products',
    'crud_comprehensive_db',
  )

  const countAfterDelete = JSON.parse(countAfterDeleteResult.data!)
  t.is(countAfterDelete[0].count, 2)

  // DELETE: Delete multiple records
  const deleteMultipleResult = await instance.executeSqlJson(
    `
    DELETE FROM products 
    WHERE category = 'Electronics'
    RETURNING name, category
  `,
    'crud_comprehensive_db',
  )

  t.is(deleteMultipleResult.success, true)
  t.is(deleteMultipleResult.rowCount, 2)

  const deletedElectronics = JSON.parse(deleteMultipleResult.data!)
  t.true(deletedElectronics.every((p: any) => p.category === 'Electronics'))

  // Final verification - should be empty
  const finalCountResult = await instance.executeSqlJson(
    'SELECT COUNT(*) as count FROM products',
    'crud_comprehensive_db',
  )

  const finalCount = JSON.parse(finalCountResult.data!)
  t.is(finalCount[0].count, 0)
})

test('CRUD: Complex operations with JOINs', async (t) => {
  // Create related tables
  await instance.executeSql(
    `
    CREATE TABLE authors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE
    );
    
    CREATE TABLE books (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      author_id INTEGER REFERENCES authors(id),
      price DECIMAL(10,2),
      published_year INTEGER
    );
  `,
    'crud_comprehensive_db',
  )

  // Insert authors
  const authorsResult = await instance.executeSqlJson(
    `
    INSERT INTO authors (name, email) VALUES 
    ('John Smith', 'john@example.com'),
    ('Jane Doe', 'jane@example.com')
    RETURNING id, name, email
  `,
    'crud_comprehensive_db',
  )

  t.is(authorsResult.rowCount, 2)
  const authors = JSON.parse(authorsResult.data!)

  // Insert books
  const booksResult = await instance.executeSqlJson(
    `
    INSERT INTO books (title, author_id, price, published_year) VALUES 
    ('Book A', ${authors[0].id}, 29.99, 2020),
    ('Book B', ${authors[0].id}, 39.99, 2021),
    ('Book C', ${authors[1].id}, 24.99, 2019)
    RETURNING id, title, author_id, price, published_year
  `,
    'crud_comprehensive_db',
  )

  t.is(booksResult.rowCount, 3)

  // Complex JOIN query
  const joinResult = await instance.executeSqlJson(
    `
    SELECT 
      a.name as author_name,
      a.email,
      b.title,
      b.price,
      b.published_year
    FROM authors a
    JOIN books b ON a.id = b.author_id
    ORDER BY a.name, b.published_year
  `,
    'crud_comprehensive_db',
  )

  t.is(joinResult.success, true)
  t.is(joinResult.rowCount, 3)

  const joinedData = JSON.parse(joinResult.data!)
  t.is(joinedData[0].author_name, 'Jane Doe')
  t.is(joinedData[0].title, 'Book C')
  t.is(joinedData[1].author_name, 'John Smith')
  t.is(joinedData[1].title, 'Book A')

  // Aggregation with JOIN
  const aggregateJoinResult = await instance.executeSqlJson(
    `
    SELECT 
      a.name as author_name,
      COUNT(b.id) as book_count,
      AVG(b.price) as avg_price,
      MIN(b.published_year) as first_published,
      MAX(b.published_year) as last_published
    FROM authors a
    LEFT JOIN books b ON a.id = b.author_id
    GROUP BY a.id, a.name
    ORDER BY book_count DESC
  `,
    'crud_comprehensive_db',
  )

  t.is(aggregateJoinResult.success, true)
  t.is(aggregateJoinResult.rowCount, 2)

  const authorStats = JSON.parse(aggregateJoinResult.data!)
  t.is(authorStats[0].author_name, 'John Smith')
  t.is(authorStats[0].book_count, 2)
  t.is(authorStats[1].author_name, 'Jane Doe')
  t.is(authorStats[1].book_count, 1)

  // UPDATE with JOIN
  const updateJoinResult = await instance.executeSqlJson(
    `
    UPDATE books 
    SET price = price * 1.1 
    WHERE author_id IN (SELECT id FROM authors WHERE name = 'John Smith')
    RETURNING title, price
  `,
    'crud_comprehensive_db',
  )

  t.is(updateJoinResult.success, true)
  t.is(updateJoinResult.rowCount, 2)

  const updatedBooks = JSON.parse(updateJoinResult.data!)
  t.true(updatedBooks.every((book: any) => parseFloat(book.price) > 30)) // Prices increased

  // DELETE with JOIN
  const deleteJoinResult = await instance.executeSqlJson(
    `
    DELETE FROM books 
    WHERE author_id IN (SELECT id FROM authors WHERE email LIKE '%@example.com')
    RETURNING title, author_id
  `,
    'crud_comprehensive_db',
  )

  t.is(deleteJoinResult.success, true)
  t.is(deleteJoinResult.rowCount, 3) // All books deleted
})

test('CRUD: executeSqlStructured for CSV-based operations', async (t) => {
  // Create simple table
  await instance.executeSql(
    `
    CREATE TABLE items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      value DECIMAL(10,2),
      active BOOLEAN
    );
    
    INSERT INTO items (name, value, active) VALUES 
    ('Item 1', 10.50, true),
    ('Item 2', 20.75, false),
    ('Item 3', 15.25, true);
  `,
    'crud_comprehensive_db',
  )

  // Test CSV-based structured query
  const csvResult = await instance.executeSqlStructured(
    'SELECT id, name, value, active FROM items ORDER BY value',
    'crud_comprehensive_db',
  )

  t.is(csvResult.success, true)
  t.is(csvResult.rowCount, 3)

  const items = JSON.parse(csvResult.data!)
  t.is(items.length, 3)

  // CSV parsing returns strings, so we need to handle type conversion
  t.is(items[0].name, 'Item 1')
  t.is(parseFloat(items[0].value), 10.5)
  t.is(items[0].active, 't') // PostgreSQL CSV format for boolean

  t.is(items[1].name, 'Item 3')
  t.is(parseFloat(items[1].value), 15.25)

  t.is(items[2].name, 'Item 2')
  t.is(parseFloat(items[2].value), 20.75)
  t.is(items[2].active, 'f') // PostgreSQL CSV format for boolean
})

test('CRUD: Error handling for invalid operations', async (t) => {
  // Test invalid table reference (EXPECTED ERROR - this is intentional)
  const error1 = await t.throwsAsync(async () => {
    await instance.executeSqlJson('SELECT * FROM non_existent_table', 'crud_comprehensive_db')
  })
  t.true(error1.message.includes('does not exist'))

  // Test invalid SQL syntax (EXPECTED ERROR - this is intentional)
  const error2 = await t.throwsAsync(async () => {
    await instance.executeSqlJson('INVALID SQL SYNTAX', 'crud_comprehensive_db')
  })
  t.true(error2.message.includes('syntax error'))

  // Test constraint violation (if we had constraints)
  await instance.executeSql(
    `
    CREATE TABLE unique_test (
      id SERIAL PRIMARY KEY,
      email VARCHAR(100) UNIQUE
    );
    INSERT INTO unique_test (email) VALUES ('test@example.com');
  `,
    'crud_comprehensive_db',
  )

  const error3 = await t.throwsAsync(async () => {
    await instance.executeSqlJson(
      "INSERT INTO unique_test (email) VALUES ('test@example.com') RETURNING id, email",
      'crud_comprehensive_db',
    )
  })
  t.true(error3.message.includes('duplicate key') || error3.message.includes('already exists'))
})
