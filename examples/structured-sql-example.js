import { PostgresInstance, initLogger, LogLevel } from '../index.js'

// Initialize logger
initLogger(LogLevel.Info)

async function structuredSqlExample() {
  console.log('🚀 Starting Structured SQL Execution Example...\n')

  const instance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'password',
    persistent: false,
  })

  try {
    // Start the instance
    console.log('📦 Starting PostgreSQL instance...')
    await instance.start()
    console.log(`✅ PostgreSQL started on port ${instance.connectionInfo.port}\n`)

    // Create test database and sample data
    console.log('🗄️  Setting up test database...')
    await instance.createDatabase('structured_example')

    await instance.executeSql(
      `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(50),
        in_stock BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      INSERT INTO products (name, price, category, in_stock) VALUES 
      ('MacBook Pro', 2499.99, 'Electronics', true),
      ('iPhone 15', 999.99, 'Electronics', true),
      ('Coffee Mug', 15.99, 'Kitchen', false),
      ('Desk Chair', 299.99, 'Furniture', true),
      ('Notebook', 12.50, 'Office', true);
    `,
      'structured_example',
    )

    console.log('✅ Test data created\n')

    // Example 1: Basic JSON query
    console.log('📊 Example 1: Basic JSON Query')
    const allProducts = await instance.executeSqlJson(
      'SELECT id, name, price, category FROM products ORDER BY price DESC;',
      'structured_example',
    )

    if (allProducts.success && allProducts.data) {
      const products = JSON.parse(allProducts.data)
      console.log(`Found ${allProducts.rowCount} products:`)
      products.forEach((product) => {
        console.log(`  - ${product.name}: $${product.price} (${product.category})`)
      })
    }
    console.log()

    // Example 2: Filtered query with type safety
    console.log('📊 Example 2: Filtered Query (Electronics only)')
    const electronics = await instance.executeSqlJson(
      "SELECT name, price, in_stock FROM products WHERE category = 'Electronics' AND price > 500;",
      'structured_example',
    )

    if (electronics.success && electronics.data) {
      const items = JSON.parse(electronics.data)
      console.log(`Found ${electronics.rowCount} expensive electronics:`)
      items.forEach((item) => {
        const status = item.in_stock ? '✅ In Stock' : '❌ Out of Stock'
        console.log(`  - ${item.name}: $${item.price} ${status}`)
      })
    }
    console.log()

    // Example 3: Aggregation query
    console.log('📊 Example 3: Aggregation Query')
    const categoryStats = await instance.executeSqlJson(
      `SELECT category, COUNT(*) as product_count, AVG(price) as avg_price, MAX(price) as max_price, MIN(price) as min_price FROM products GROUP BY category ORDER BY avg_price DESC`,
      'structured_example',
    )

    if (categoryStats.success && categoryStats.data) {
      const stats = JSON.parse(categoryStats.data)
      console.log('Category Statistics:')
      stats.forEach((stat) => {
        console.log(`  📂 ${stat.category}:`)
        console.log(`     Products: ${stat.product_count}`)
        console.log(`     Avg Price: $${parseFloat(stat.avg_price).toFixed(2)}`)
        console.log(`     Price Range: $${stat.min_price} - $${stat.max_price}`)
      })
    }
    console.log()

    // Example 4: Complex query with calculations
    console.log('📊 Example 4: Complex Query with Calculations')
    const productAnalysis = await instance.executeSqlJson(
      `SELECT name, price, CASE WHEN price > 1000 THEN 'Premium' WHEN price > 100 THEN 'Mid-range' ELSE 'Budget' END as price_tier, ROUND(price * 0.1, 2) as tax_amount, ROUND(price * 1.1, 2) as price_with_tax FROM products WHERE in_stock = true ORDER BY price DESC`,
      'structured_example',
    )

    if (productAnalysis.success && productAnalysis.data) {
      const analysis = JSON.parse(productAnalysis.data)
      console.log('Product Analysis (In-Stock Items):')
      analysis.forEach((item) => {
        console.log(`  🏷️  ${item.name} (${item.price_tier})`)
        console.log(`     Base Price: $${item.price}`)
        console.log(`     Tax: $${item.tax_amount}`)
        console.log(`     Total: $${item.price_with_tax}`)
      })
    }
    console.log()

    // Example 5: Handling empty results
    console.log('📊 Example 5: Handling Empty Results')
    const expensiveItems = await instance.executeSqlJson(
      'SELECT * FROM products WHERE price > 5000;',
      'structured_example',
    )

    console.log(`Query for items > $5000: Found ${expensiveItems.rowCount} items`)
    if (expensiveItems.data) {
      const items = JSON.parse(expensiveItems.data)
      console.log(`Result is empty array: ${Array.isArray(items) && items.length === 0}`)
    }
    console.log()

    // Example 6: Using structured SQL (CSV-based parsing)
    console.log('📊 Example 6: Structured SQL (CSV-based)')
    const structuredResult = await instance.executeSqlStructured(
      'SELECT name, price, category FROM products WHERE price < 100 ORDER BY price;',
      'structured_example',
    )

    if (structuredResult.success && structuredResult.data) {
      const items = JSON.parse(structuredResult.data)
      console.log(`Found ${structuredResult.rowCount} affordable items:`)
      items.forEach((item) => {
        console.log(`  - ${item.name}: $${item.price} (${item.category})`)
      })
    }
    console.log()

    // Example 7: Error handling
    console.log('❌ Example 7: Error Handling')
    try {
      await instance.executeSqlJson('SELECT * FROM non_existent_table;', 'structured_example')
    } catch (error) {
      console.log('✅ Expected error caught:', error.message.split('\n')[0])
    }

    // Clean up
    console.log('\n🧹 Cleaning up...')
    await instance.dropDatabase('structured_example')
    console.log('Database dropped successfully')
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    console.log('🛑 Stopping PostgreSQL instance...')
    await instance.stop()
    console.log('✅ PostgreSQL stopped successfully')
  }
}

// TypeScript usage example (for documentation)
console.log(`
🔧 TypeScript Usage Example:

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  in_stock: boolean;
}

const result = await instance.executeSqlJson('SELECT * FROM products;');
if (result.success && result.data) {
  const products: Product[] = JSON.parse(result.data);
  products.forEach(product => {
    console.log(\`\${product.name}: $\${product.price}\`);
  });
}
`)

// Run the example
structuredSqlExample().catch(console.error)
