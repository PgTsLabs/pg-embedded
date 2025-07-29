// 测试工具函数
import { PostgresInstance } from '../index.js'

// 端口管理器，避免端口冲突
class PortManager {
  private static usedPorts = new Set<number>()
  private static basePort = 5500

  static getAvailablePort(): number {
    let port = this.basePort
    while (this.usedPorts.has(port)) {
      port++
    }
    this.usedPorts.add(port)
    return port
  }

  static releasePort(port: number): void {
    this.usedPorts.delete(port)
  }

  static reset(): void {
    this.usedPorts.clear()
  }
}

// 安全停止实例的辅助函数
export async function safeStopInstance(instance: PostgresInstance): Promise<void> {
  try {
    if (instance.state === 2) { // Running state
      await instance.stopWithTimeout(30)
    }
  } catch (error) {
    console.warn('Warning: Failed to stop instance:', error)
  }
}

// 安全清理实例的辅助函数
export function safeCleanupInstance(instance: PostgresInstance): void {
  try {
    instance.cleanup()
  } catch (error) {
    console.warn('Warning: Failed to cleanup instance:', error)
  }
}

// 创建测试实例的辅助函数
export function createTestInstance(overrides: any = {}): PostgresInstance {
  const port = PortManager.getAvailablePort()
  
  return new PostgresInstance({
    port,
    username: 'testuser',
    password: 'testpass',
    persistent: false,
    setup_timeout: 300, // Windows需要更长的超时时间
    ...overrides
  })
}

// 启动实例的辅助函数，带重试机制
export async function startInstanceWithRetry(
  instance: PostgresInstance, 
  maxRetries: number = 3,
  timeoutSeconds: number = 180
): Promise<void> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await instance.startWithTimeout(timeoutSeconds)
      return // 成功启动
    } catch (error) {
      lastError = error as Error
      console.warn(`启动尝试 ${attempt} 失败:`, error)
      
      if (attempt < maxRetries) {
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // 清理失败的实例
        try {
          instance.cleanup()
        } catch (cleanupError) {
          console.warn('清理失败的实例时出错:', cleanupError)
        }
      }
    }
  }
  
  throw new Error(`所有启动尝试都失败了。最后一个错误: ${lastError?.message}`)
}

// 释放端口的辅助函数
export function releaseTestPort(instance: PostgresInstance): void {
  try {
    const connectionInfo = instance.connectionInfo
    PortManager.releasePort(connectionInfo.port)
  } catch (error) {
    // 忽略获取连接信息失败的错误
  }
}

// 重置端口管理器
export function resetPortManager(): void {
  PortManager.reset()
}

export { PortManager }