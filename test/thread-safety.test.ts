import test from 'ava'
import { PostgresInstance, InstanceState } from '../index.js'

test('PostgresInstance has unique instance IDs', (t) => {
  const instance1 = new PostgresInstance()
  const instance2 = new PostgresInstance()

  t.truthy(instance1.instanceId)
  t.truthy(instance2.instanceId)
  t.not(instance1.instanceId, instance2.instanceId)
})

test('PostgresInstance health check works', (t) => {
  const instance = new PostgresInstance()

  // Should be unhealthy when stopped
  t.is(instance.isHealthy(), false)
  t.is(instance.state, InstanceState.Stopped)
})

test('Multiple instances can coexist', (t) => {
  const instances = []

  // Create multiple instances, each with different port
  for (let i = 0; i < 5; i++) {
    const instance = new PostgresInstance({
      port: 5432 + i,
      username: `user${i}`,
      password: `pass${i}`,
    })
    instances.push(instance)
  }

  // Verify all instances have unique IDs
  const ids = instances.map((instance) => instance.instanceId)
  const uniqueIds = new Set(ids)
  t.is(ids.length, uniqueIds.size, 'All instance IDs should be unique')

  // Verify all instances are in stopped state
  instances.forEach((instance) => {
    t.is(instance.state, InstanceState.Stopped)
    t.is(instance.isHealthy(), false)
  })

  // Cleanup all instances
  instances.forEach((instance) => {
    instance.cleanup()
  })
})

test('Instance state transitions are tracked', (t) => {
  const instance = new PostgresInstance()

  // Initial state
  t.is(instance.state, InstanceState.Stopped)

  // Manual cleanup should not change stopped state
  instance.cleanup()
  t.is(instance.state, InstanceState.Stopped)
})

test('Instance ID is persistent', (t) => {
  const instance = new PostgresInstance()
  const id1 = instance.instanceId
  const id2 = instance.instanceId

  // ID should remain consistent
  t.is(id1, id2)

  // ID should still exist after cleanup
  instance.cleanup()
  t.is(instance.instanceId, id1)
})
