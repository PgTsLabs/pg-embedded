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
  
  // 停止状态下应该不健康
  t.is(instance.isHealthy(), false)
  t.is(instance.state, InstanceState.Stopped)
})

test('Multiple instances can coexist', (t) => {
  const instances = []
  
  // 创建多个实例，每个使用不同的端口
  for (let i = 0; i < 5; i++) {
    const instance = new PostgresInstance({
      port: 5432 + i,
      username: `user${i}`,
      password: `pass${i}`
    })
    instances.push(instance)
  }
  
  // 验证所有实例都有唯一的ID
  const ids = instances.map(instance => instance.instanceId)
  const uniqueIds = new Set(ids)
  t.is(ids.length, uniqueIds.size, 'All instance IDs should be unique')
  
  // 验证所有实例都处于停止状态
  instances.forEach(instance => {
    t.is(instance.state, InstanceState.Stopped)
    t.is(instance.isHealthy(), false)
  })
  
  // 清理所有实例
  instances.forEach(instance => {
    instance.cleanup()
  })
})

test('Instance state transitions are tracked', (t) => {
  const instance = new PostgresInstance()
  
  // 初始状态
  t.is(instance.state, InstanceState.Stopped)
  
  // 手动清理不应该改变已停止的状态
  instance.cleanup()
  t.is(instance.state, InstanceState.Stopped)
})

test('Instance ID is persistent', (t) => {
  const instance = new PostgresInstance()
  const id1 = instance.instanceId
  const id2 = instance.instanceId
  
  // ID应该保持一致
  t.is(id1, id2)
  
  // 清理后ID应该仍然存在
  instance.cleanup()
  t.is(instance.instanceId, id1)
})