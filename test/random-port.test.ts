import test from 'ava'
import { InstanceState, PostgresInstance } from '../index.js'

test.beforeEach(async (t: any) => {
  const postgres = new PostgresInstance({ port: 0, persistent: false })
  await postgres.setup()
  await postgres.start()
  t.context.postgres = postgres
})

test.afterEach.always(async (t: any) => {
  const { postgres } = t.context
  if (postgres && postgres.state === InstanceState.Running) {
    await postgres.stop()
  }
})

test('should start on a random port when port is set to 0', async (t: any) => {
  const { postgres } = t.context

  // The initial port should be 0
  let connectionInfo = postgres.connectionInfo

  // After starting, the state should be 'running'
  t.is(postgres.state, InstanceState.Running)

  // Get the updated connection info
  connectionInfo = postgres.connectionInfo

  // The new port should be a randomly assigned, non-zero value
  t.not(connectionInfo.port, 0)
  t.true(connectionInfo.port > 1023) // Ports below 1024 are often reserved

  console.log(`PostgreSQL started on random port: ${connectionInfo.port}`)
})
