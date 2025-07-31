import test from 'ava';
import { PostgresInstance } from '../index.js';

let instance: PostgresInstance;

test.before(async () => {
  instance = new PostgresInstance({
    host: 'localhost',
    port: 0,
    username: 'postgres',
    password: 'password',
  });

  await instance.start();
});

test.after(async () => {
  await instance.stop();
});

// Helper function to create unique table names
function createTableName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

test('JSON: Basic data types handling', async (t) => {
  const tableName = createTableName('basic_types');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      text_col VARCHAR(100),
      int_col INTEGER,
      float_col DECIMAL(10,2),
      bool_col BOOLEAN,
      date_col TIMESTAMP,
      null_col VARCHAR(50)
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (text_col, int_col, float_col, bool_col, date_col, null_col) VALUES 
    ('Hello World', 42, 3.14, true, '2024-01-01 12:00:00', NULL),
    ('Test String', -100, 99.99, false, '2023-12-31 23:59:59', NULL);
  `);

  const result = await instance.executeSqlJson(`SELECT * FROM ${tableName} ORDER BY id;`);
  
  t.is(result.success, true);
  t.is(result.rowCount, 2);
  
  const data = JSON.parse(result.data!);
  t.true(Array.isArray(data));
  t.is(data.length, 2);
  
  // Verify first row types
  t.is(typeof data[0].id, 'number');
  t.is(typeof data[0].text_col, 'string');
  t.is(typeof data[0].int_col, 'number');
  t.is(typeof data[0].float_col, 'number');
  t.is(typeof data[0].bool_col, 'boolean');
  t.is(typeof data[0].date_col, 'string');
  t.is(data[0].null_col, null);
  
  // Verify values
  t.is(data[0].text_col, 'Hello World');
  t.is(data[0].int_col, 42);
  t.is(data[0].float_col, 3.14);
  t.is(data[0].bool_col, true);
  
  t.is(data[1].bool_col, false);
  t.is(data[1].int_col, -100);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: JSONB column support', async (t) => {
  const tableName = createTableName('jsonb_test');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      metadata JSONB,
      settings JSONB
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (name, metadata, settings) VALUES 
    ('User 1', '{"role": "admin", "permissions": ["read", "write"], "active": true}', '{"theme": "dark", "notifications": {"email": true, "sms": false}}'),
    ('User 2', '{"role": "user", "permissions": ["read"], "active": false, "profile": {"age": 25, "city": "NYC"}}', '{"theme": "light", "language": "en"}'),
    ('User 3', '{}', NULL);
  `);

  const result = await instance.executeSqlJson(`SELECT * FROM ${tableName} ORDER BY id;`);
  
  t.is(result.success, true);
  t.is(result.rowCount, 3);
  
  const data = JSON.parse(result.data!);
  
  // Verify JSONB data is properly parsed
  t.is(typeof data[0].metadata, 'object');
  t.is(data[0].metadata.role, 'admin');
  t.true(Array.isArray(data[0].metadata.permissions));
  t.is(data[0].metadata.permissions.length, 2);
  t.is(data[0].metadata.active, true);
  
  // Verify nested JSONB
  t.is(typeof data[0].settings, 'object');
  t.is(data[0].settings.theme, 'dark');
  t.is(typeof data[0].settings.notifications, 'object');
  t.is(data[0].settings.notifications.email, true);
  t.is(data[0].settings.notifications.sms, false);
  
  // Verify complex nested structure
  t.is(data[1].metadata.profile.age, 25);
  t.is(data[1].metadata.profile.city, 'NYC');
  
  // Verify empty JSONB and NULL
  t.deepEqual(data[2].metadata, {});
  t.is(data[2].settings, null);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: JSONB queries and operations', async (t) => {
  const tableName = createTableName('jsonb_ops');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      data JSONB
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (name, data) VALUES 
    ('Product A', '{"price": 19.99, "category": "electronics", "tags": ["new", "popular"], "specs": {"weight": 1.5, "color": "black"}}'),
    ('Product B', '{"price": 29.99, "category": "books", "tags": ["bestseller"], "specs": {"pages": 300, "language": "en"}}'),
    ('Product C', '{"price": 15.50, "category": "electronics", "tags": ["sale"], "specs": {"weight": 0.8, "color": "white"}}');
  `);

  // Test JSONB field extraction
  const result1 = await instance.executeSqlJson(`
    SELECT 
      name,
      data->>'category' as category,
      (data->>'price')::numeric as price,
      data->'specs' as specs,
      data->'tags' as tags
    FROM ${tableName} 
    WHERE data->>'category' = 'electronics'
    ORDER BY (data->>'price')::numeric;
  `);
  
  t.is(result1.success, true);
  t.is(result1.rowCount, 2);
  
  const electronics = JSON.parse(result1.data!);
  t.is(electronics[0].name, 'Product C');
  t.is(electronics[0].category, 'electronics');
  t.is(electronics[0].price, 15.50);
  t.is(typeof electronics[0].specs, 'object');
  t.is(electronics[0].specs.color, 'white');
  t.true(Array.isArray(electronics[0].tags));
  
  // Test JSONB array operations
  const result2 = await instance.executeSqlJson(`
    SELECT name, data->'tags' as tags
    FROM ${tableName} 
    WHERE data->'tags' ? 'popular';
  `);
  
  t.is(result2.success, true);
  t.is(result2.rowCount, 1);
  
  const popular = JSON.parse(result2.data!);
  t.is(popular[0].name, 'Product A');
  t.true(popular[0].tags.includes('popular'));
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: Complex aggregations with JSONB', async (t) => {
  const tableName = createTableName('jsonb_agg');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      department VARCHAR(50),
      employee_data JSONB
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (department, employee_data) VALUES 
    ('IT', '{"name": "John Doe", "salary": 75000, "skills": ["JavaScript", "Python"], "remote": true}'),
    ('IT', '{"name": "Jane Smith", "salary": 80000, "skills": ["Java", "SQL"], "remote": false}'),
    ('HR', '{"name": "Bob Wilson", "salary": 60000, "skills": ["Communication", "Management"], "remote": true}'),
    ('IT', '{"name": "Alice Johnson", "salary": 85000, "skills": ["Python", "Machine Learning"], "remote": true}');
  `);

  const result = await instance.executeSqlJson(`
    SELECT 
      department,
      COUNT(*) as employee_count,
      AVG((employee_data->>'salary')::numeric) as avg_salary,
      json_agg(employee_data->>'name') as employee_names,
      json_agg(employee_data->'skills') as all_skills,
      COUNT(*) FILTER (WHERE employee_data->>'remote' = 'true') as remote_count
    FROM ${tableName} 
    GROUP BY department
    ORDER BY department;
  `);
  
  t.is(result.success, true);
  t.is(result.rowCount, 2);
  
  const departments = JSON.parse(result.data!);
  
  // Check HR department
  const hr = departments.find((d: any) => d.department === 'HR');
  t.truthy(hr);
  t.is(hr.employee_count, 1);
  t.is(hr.avg_salary, 60000);
  t.is(hr.remote_count, 1);
  t.true(Array.isArray(hr.employee_names));
  t.is(hr.employee_names[0], 'Bob Wilson');
  
  // Check IT department
  const it = departments.find((d: any) => d.department === 'IT');
  t.truthy(it);
  t.is(it.employee_count, 3);
  t.is(it.avg_salary, 80000); // (75000 + 80000 + 85000) / 3
  t.is(it.remote_count, 2);
  t.is(it.employee_names.length, 3);
  t.true(it.employee_names.includes('John Doe'));
  t.true(it.employee_names.includes('Jane Smith'));
  t.true(it.employee_names.includes('Alice Johnson'));
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: INSERT with RETURNING and JSONB', async (t) => {
  const tableName = createTableName('jsonb_insert');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      config JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const result = await instance.executeSqlJson(`
    INSERT INTO ${tableName} (name, config) VALUES 
    ('Service A', '{"enabled": true, "timeout": 30, "retries": 3, "endpoints": ["api1", "api2"]}'),
    ('Service B', '{"enabled": false, "timeout": 60, "database": {"host": "localhost", "port": 5432}}')
    RETURNING id, name, config, created_at;
  `);
  
  t.is(result.success, true);
  t.is(result.rowCount, 2);
  
  const inserted = JSON.parse(result.data!);
  t.is(inserted.length, 2);
  
  // Verify first service
  t.is(typeof inserted[0].id, 'number');
  t.is(inserted[0].name, 'Service A');
  t.is(typeof inserted[0].config, 'object');
  t.is(inserted[0].config.enabled, true);
  t.is(inserted[0].config.timeout, 30);
  t.true(Array.isArray(inserted[0].config.endpoints));
  t.is(inserted[0].config.endpoints.length, 2);
  
  // Verify second service
  t.is(inserted[1].name, 'Service B');
  t.is(inserted[1].config.enabled, false);
  t.is(typeof inserted[1].config.database, 'object');
  t.is(inserted[1].config.database.host, 'localhost');
  t.is(inserted[1].config.database.port, 5432);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: UPDATE with JSONB operations', async (t) => {
  const tableName = createTableName('jsonb_update');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      settings JSONB
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (name, settings) VALUES 
    ('User 1', '{"theme": "light", "notifications": {"email": true, "push": false}, "preferences": {"language": "en"}}'),
    ('User 2', '{"theme": "dark", "notifications": {"email": false, "push": true}}');
  `);

  // Update JSONB field
  const result = await instance.executeSqlJson(`
    UPDATE ${tableName} 
    SET settings = jsonb_set(
      jsonb_set(settings, '{theme}', '"dark"'),
      '{notifications,push}', 'true'
    )
    WHERE name = 'User 1'
    RETURNING id, name, settings;
  `);
  
  t.is(result.success, true);
  t.is(result.rowCount, 1);
  
  const updated = JSON.parse(result.data!);
  t.is(updated[0].name, 'User 1');
  t.is(updated[0].settings.theme, 'dark');
  t.is(updated[0].settings.notifications.push, true);
  t.is(updated[0].settings.notifications.email, true); // Should remain unchanged
  t.is(updated[0].settings.preferences.language, 'en'); // Should remain unchanged
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: Array and nested object handling', async (t) => {
  const tableName = createTableName('complex_json');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      data JSONB
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (data) VALUES 
    ('{"users": [{"id": 1, "name": "John", "roles": ["admin", "user"]}, {"id": 2, "name": "Jane", "roles": ["user"]}], "metadata": {"version": "1.0", "created": "2024-01-01"}}'),
    ('{"products": [{"id": 101, "name": "Laptop", "specs": {"cpu": "Intel i7", "ram": "16GB"}}, {"id": 102, "name": "Mouse", "specs": {"type": "wireless", "battery": "AA"}}]}');
  `);

  const result = await instance.executeSqlJson(`SELECT * FROM ${tableName} ORDER BY id;`);
  
  t.is(result.success, true);
  t.is(result.rowCount, 2);
  
  const data = JSON.parse(result.data!);
  
  // Verify first record - users array
  t.true(Array.isArray(data[0].data.users));
  t.is(data[0].data.users.length, 2);
  t.is(data[0].data.users[0].id, 1);
  t.is(data[0].data.users[0].name, 'John');
  t.true(Array.isArray(data[0].data.users[0].roles));
  t.is(data[0].data.users[0].roles.length, 2);
  t.true(data[0].data.users[0].roles.includes('admin'));
  
  // Verify metadata
  t.is(typeof data[0].data.metadata, 'object');
  t.is(data[0].data.metadata.version, '1.0');
  
  // Verify second record - products with nested specs
  t.true(Array.isArray(data[1].data.products));
  t.is(data[1].data.products[0].specs.cpu, 'Intel i7');
  t.is(data[1].data.products[0].specs.ram, '16GB');
  t.is(data[1].data.products[1].specs.type, 'wireless');
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: Method consistency between executeSqlJson and executeSqlStructured', async (t) => {
  const tableName = createTableName('consistency');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      data JSONB,
      active BOOLEAN,
      score DECIMAL(5,2)
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (name, data, active, score) VALUES 
    ('Test 1', '{"type": "A", "value": 100}', true, 95.5),
    ('Test 2', '{"type": "B", "value": 200}', false, 87.25);
  `);

  const query = `SELECT * FROM ${tableName} ORDER BY id;`;
  
  const jsonResult = await instance.executeSqlJson(query);
  const structuredResult = await instance.executeSqlStructured(query);
  
  // Both methods should return identical results
  t.is(jsonResult.success, structuredResult.success);
  t.is(jsonResult.data, structuredResult.data);
  t.is(jsonResult.rowCount, structuredResult.rowCount);
  
  // Verify the actual data structure
  const jsonData = JSON.parse(jsonResult.data!);
  const structuredData = JSON.parse(structuredResult.data!);
  
  t.deepEqual(jsonData, structuredData);
  
  // Verify types are preserved correctly
  t.is(typeof jsonData[0].id, 'number');
  t.is(typeof jsonData[0].active, 'boolean');
  t.is(typeof jsonData[0].score, 'number');
  t.is(typeof jsonData[0].data, 'object');
  t.is(jsonData[0].data.value, 100);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON: Error handling with invalid JSON operations', async (t) => {
  const tableName = createTableName('error_test');
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      data JSONB
    );
  `);

  // Test invalid table reference
  const error1 = await t.throwsAsync(async () => {
    await instance.executeSqlJson('SELECT * FROM non_existent_table');
  });
  t.true(error1.message.includes('does not exist'));

  // Test invalid JSON syntax in query
  const error2 = await t.throwsAsync(async () => {
    await instance.executeSqlJson('INVALID SQL SYNTAX');
  });
  t.true(error2.message.includes('syntax error'));
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});