import test from 'ava'
import { PostgresInstance, InstanceState } from '../index.js'

test('PostgresInstance can be cleaned up manually', async (t) => {
  const instance = new PostgresInstance()

  t.is(instance.state, InstanceState.Stopped)

  // Manual cleanup should not throw errors
  await t.notThrowsAsync(instance.cleanup())

  t.is(instance.state, InstanceState.Stopped)
})

test('PostgresInstance has timeout methods', (t) => {
  const instance = new PostgresInstance()

  // Verify timeout methods exist
  t.is(typeof instance.startWithTimeout, 'function')
  t.is(typeof instance.stopWithTimeout, 'function')
})

test('Multiple instances can be created and cleaned up', async (t) => {
  const instances = []

  // Create multiple instances
  for (let i = 0; i < 3; i++) {
    const instance = new PostgresInstance({
      port: 5432 + i,
      username: `user${i}`,
      password: `pass${i}`,
    })
    instances.push(instance)
    t.is(instance.state, InstanceState.Stopped)
  }

  // Cleanup all instances
  for (const instance of instances) {
    await t.notThrowsAsync(instance.cleanup())
    t.is(instance.state, InstanceState.Stopped)
  }
})

test('Instance state is properly managed', async (t) => {
  const instance = new PostgresInstance()

  // Initial state should be stopped
  t.is(instance.state, InstanceState.Stopped)

  // State should still be stopped after cleanup
  await instance.cleanup()
  t.is(instance.state, InstanceState.Stopped)
})
