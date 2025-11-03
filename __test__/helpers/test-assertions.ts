/**
 * Common test assertions and validation helpers
 * Provides reusable assertion logic to maintain consistency across tests
 */

import type { ExecutionContext } from 'ava'
import { PostgresInstance, InstanceState } from '../../index.js'

/**
 * Assert that instance is in expected state
 */
export function assertInstanceState(t: ExecutionContext, instance: PostgresInstance, expectedState: InstanceState) {
  t.is(instance.state, expectedState, `Instance should be in ${InstanceState[expectedState]} state`)
}

/**
 * Assert that instance is running and healthy
 */
export function assertInstanceRunning(t: ExecutionContext, instance: PostgresInstance) {
  assertInstanceState(t, instance, InstanceState.Running)
  t.true(instance.isHealthy(), 'Instance should be healthy')
}

/**
 * Assert that instance is stopped
 */
export function assertInstanceStopped(t: ExecutionContext, instance: PostgresInstance) {
  assertInstanceState(t, instance, InstanceState.Stopped)
}

/**
 * Assert that connection info is valid
 */
export function assertValidConnectionInfo(t: ExecutionContext, instance: PostgresInstance) {
  const info = instance.connectionInfo

  t.truthy(info, 'Connection info should exist')
  t.truthy(info.connectionString, 'Connection string should exist')
  t.truthy(info.host, 'Host should exist')
  t.true(info.port > 0, 'Port should be positive')
  t.truthy(info.username, 'Username should exist')
  t.truthy(info.databaseName, 'Database name should exist')

  // Validate connection string format
  t.regex(info.connectionString, /^postgresql:\/\//, 'Connection string should start with postgresql://')

  // Validate safe connection string (password should be masked)
  const safeConnStr = info.safeConnectionString()
  t.truthy(safeConnStr, 'Safe connection string should exist')
  t.false(safeConnStr.includes(info.password || ''), 'Safe connection string should not contain password')

  // Validate JDBC URL
  const jdbcUrl = info.jdbcUrl()
  t.truthy(jdbcUrl, 'JDBC URL should exist')
  t.regex(jdbcUrl, /^jdbc:postgresql:\/\//, 'JDBC URL should start with jdbc:postgresql://')
}

/**
 * Assert that getting connection info throws when instance is stopped
 */
export function assertConnectionInfoThrowsWhenStopped(t: ExecutionContext, instance: PostgresInstance) {
  const error = t.throws(() => {
    instance.connectionInfo
  })

  t.truthy(error, 'Should throw error when getting connection info while stopped')
  t.true(error.message.includes('not running'), 'Error message should mention instance is not running')
}

/**
 * Assert that database exists
 */
export async function assertDatabaseExists(
  t: ExecutionContext,
  instance: PostgresInstance,
  databaseName: string,
  shouldExist: boolean = true,
) {
  const exists = await instance.databaseExists(databaseName)
  t.is(exists, shouldExist, `Database '${databaseName}' should ${shouldExist ? 'exist' : 'not exist'}`)
}

/**
 * Assert that operation throws an error
 */
export async function assertThrowsAsync(
  t: ExecutionContext,
  operation: () => Promise<unknown>,
  expectedMessage?: string,
) {
  const error = await t.throwsAsync(operation)
  t.truthy(error, 'Operation should throw an error')

  if (expectedMessage) {
    t.true(error.message.includes(expectedMessage), `Error message should contain: ${expectedMessage}`)
  }

  return error
}
