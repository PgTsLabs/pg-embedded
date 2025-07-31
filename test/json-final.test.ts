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

test('JSON CRUD: SELECT empty result', async (t) => {
  const tableName = `test_table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100)
    );
  `);
  
  const result = await instance.executeSqlJson(`SELECT * FROM ${tableName};`);
  
  t.is(result.success, true);
  t.is(result.data, '[]');
  t.is(result.rowCount, 0);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON CRUD: SELECT with results', async (t) => {
  const tableName = `test_table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100)
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (name) VALUES ('John'), ('Jane');
  `);

  const result = await instance.executeSqlJson(`SELECT id, name FROM ${tableName} ORDER BY id;`);
  
  t.is(result.success, true);
  
  const data = JSON.parse(result.data!);
  t.true(Array.isArray(data));
  t.is(data.length, 2);
  t.is(data[0].name, 'John');
  t.is(data[1].name, 'Jane');
  t.is(result.rowCount, data.length);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON CRUD: INSERT without RETURNING', async (t) => {
  const tableName = `test_table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100)
    );
  `);
  
  const result = await instance.executeSqlJson(`
    INSERT INTO ${tableName} (name) VALUES ('Bob')
  `);
  
  t.is(result.success, true);
  
  const data = JSON.parse(result.data!);
  t.is(data.operation, 'insert');
  t.is(data.success, true);
  t.truthy(data.message);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});

test('JSON CRUD: Method consistency', async (t) => {
  const tableName = `test_table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await instance.executeSql(`
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100)
    );
  `);
  
  await instance.executeSql(`
    INSERT INTO ${tableName} (name) VALUES ('Test User');
  `);
  
  const query = `SELECT id, name FROM ${tableName};`;
  
  const jsonResult = await instance.executeSqlJson(query);
  const structuredResult = await instance.executeSqlStructured(query);
  
  t.is(jsonResult.success, structuredResult.success);
  t.is(jsonResult.data, structuredResult.data);
  t.is(jsonResult.rowCount, structuredResult.rowCount);
  
  await instance.executeSql(`DROP TABLE ${tableName};`);
});