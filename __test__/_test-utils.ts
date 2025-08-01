// Test utility functions
import { PostgresInstance } from '../index.js'

// Port manager to avoid port conflicts
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

// Helper function to safely stop an instance
export async function safeStopInstance(instance: PostgresInstance): Promise<void> {
  try {
    if (instance.state === 2) {
      // Running state
      await instance.stopWithTimeout(30)
    }
  } catch (error) {
    console.warn('Warning: Failed to stop instance:', error)
  }
}

// Helper function to safely cleanup an instance
export function safeCleanupInstance(instance: PostgresInstance): void {
  try {
    instance.cleanup()
  } catch (error) {
    console.warn('Warning: Failed to cleanup instance:', error)
  }
}

// Helper function to create a test instance
export function createTestInstance(overrides: any = {}): PostgresInstance {
  const port = PortManager.getAvailablePort()

  return new PostgresInstance({
    port,
    username: 'testuser',
    password: 'testpass',
    persistent: false,
    setup_timeout: 300, // Longer timeout needed for Windows
    ...overrides,
  })
}

// Helper function to start instance with retry mechanism
export async function startInstanceWithRetry(
  instance: PostgresInstance,
  maxRetries: number = 3,
  timeoutSeconds: number = 180,
): Promise<void> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await instance.startWithTimeout(timeoutSeconds)
      return // Successfully started
    } catch (error) {
      lastError = error as Error
      console.warn(`Start attempt ${attempt} failed:`, error)

      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Cleanup failed instance
        try {
          instance.cleanup()
        } catch (cleanupError) {
          console.warn('Error cleaning up failed instance:', cleanupError)
        }
      }
    }
  }

  throw new Error(`All start attempts failed. Last error: ${lastError?.message}`)
}

// Helper function to release port
export function releaseTestPort(instance: PostgresInstance): void {
  try {
    const connectionInfo = instance.connectionInfo
    PortManager.releasePort(connectionInfo.port)
  } catch {
    // Ignore errors when getting connection info fails
  }
}

// Reset port manager
export function resetPortManager(): void {
  PortManager.reset()
}

export { PortManager }
