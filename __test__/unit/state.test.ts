/**
 * Unit tests for instance state management
 * Tests state transitions and validation
 */

import test from 'ava'
import { PostgresInstance, InstanceState } from '../../index.js'
import { assertInstanceState } from '../helpers/test-assertions.js'

test('Initial state is Stopped', (t) => {
  const instance = new PostgresInstance()
  assertInstanceState(t, instance, InstanceState.Stopped)
})

test('State property is accessible', (t) => {
  const instance = new PostgresInstance()

  t.is(typeof instance.state, 'number', 'State should be a number')
  t.true(instance.state >= 0, 'State should be non-negative')
})

test('InstanceState enum values are correct', (t) => {
  t.is(InstanceState.Stopped, 0, 'Stopped should be 0')
  t.is(InstanceState.Starting, 1, 'Starting should be 1')
  t.is(InstanceState.Running, 2, 'Running should be 2')
  t.is(InstanceState.Stopping, 3, 'Stopping should be 3')
})

test('Multiple instances have independent states', (t) => {
  const instance1 = new PostgresInstance()
  const instance2 = new PostgresInstance()

  assertInstanceState(t, instance1, InstanceState.Stopped)
  assertInstanceState(t, instance2, InstanceState.Stopped)

  t.not(instance1, instance2, 'Instances should be different objects')
})
