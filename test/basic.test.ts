import test from 'ava'
import { PostgresInstance, InstanceState } from '../index.js'

interface PostgresSettings {
  port?: number
  username?: string
  password?: string
  persistent?: boolean
}

test('PostgresInstance can be created with default settings', (t) => {
  const instance = new PostgresInstance()
  t.truthy(instance)
  t.is(instance.state, InstanceState.Stopped)
})

test('PostgresInstance can be created with custom settings', (t) => {
  const settings: PostgresSettings = {
    port: 5433,
    username: 'testuser',
    password: 'testpass',
    persistent: false
  }
  
  const instance = new PostgresInstance(settings)
  t.truthy(instance)
  t.is(instance.state, InstanceState.Stopped)
})

test('PostgresInstance throws error when getting connection info while stopped', (t) => {
  const instance = new PostgresInstance()
  
  const error = t.throws(() => {
    instance.connectionInfo
  })
  
  t.truthy(error)
  t.true(error.message.includes('not running'))
})