import test from 'ava'
import { PostgresInstance, InstanceState } from '../index.js'

test('PostgresInstance can be cleaned up manually', (t) => {
  const instance = new PostgresInstance()
  
  t.is(instance.state, InstanceState.Stopped)
  
  // 手动清理应该不会抛出错误
  t.notThrows(() => {
    instance.cleanup()
  })
  
  t.is(instance.state, InstanceState.Stopped)
})

test('PostgresInstance has timeout methods', (t) => {
  const instance = new PostgresInstance()
  
  // 验证超时方法存在
  t.is(typeof instance.startWithTimeout, 'function')
  t.is(typeof instance.stopWithTimeout, 'function')
})

test('Multiple instances can be created and cleaned up', (t) => {
  const instances = []
  
  // 创建多个实例
  for (let i = 0; i < 3; i++) {
    const instance = new PostgresInstance({
      port: 5432 + i,
      username: `user${i}`,
      password: `pass${i}`
    })
    instances.push(instance)
    t.is(instance.state, InstanceState.Stopped)
  }
  
  // 清理所有实例
  instances.forEach(instance => {
    t.notThrows(() => {
      instance.cleanup()
    })
    t.is(instance.state, InstanceState.Stopped)
  })
})

test('Instance state is properly managed', (t) => {
  const instance = new PostgresInstance()
  
  // 初始状态应该是停止
  t.is(instance.state, InstanceState.Stopped)
  
  // 清理后状态应该仍然是停止
  instance.cleanup()
  t.is(instance.state, InstanceState.Stopped)
})