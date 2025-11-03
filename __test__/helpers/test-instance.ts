/**
 * Unified test instance management utilities
 * Provides consistent instance creation, lifecycle management, and cleanup across all tests
 * Follows DRY principle by eliminating duplicate helper functions
 */

import { PostgresInstance, InstanceState } from '../../index.js'
import { getPlatformConfig } from './test-config.js'

/**
 * Port manager to prevent port conflicts in concurrent tests
 * Uses a simple incrementing strategy with conflict detection
 */
class PortManager {
  private static usedPorts = new Set<number>()
  private static basePort = 5500

  static getAvailablePort(): number {
    let port = this.basePort
    while (this.usedPorts.has(port)) {
      port++
      // Prevent infinite loop
      if (port > 65535) {
        throw new Error('No available ports')
      }
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

export interface TestInstanceOptions {
  port?: number
  username?: string
  password?: string
  databaseName?: string
  persistent?: boolean
  timeout?: number
  setup_timeout?: number
}

/**
 * Create a test PostgreSQL instance with sensible defaults
 * Automatically assigns an available port to prevent conflicts
 */
export function createTestInstance(options: TestInstanceOptions = {}): PostgresInstance {
  const config = getPlatformConfig()
  const port = options.port ?? PortManager.getAvailablePort()

  return new PostgresInstance({
    port,
    username: options.username ?? 'testuser',
    password: options.password ?? 'testpass',
    databaseName: options.databaseName ?? 'postgres',
    persistent: options.persistent ?? false,
    timeout: options.timeout ?? config.startupTimeout,
    setup_timeout: options.setup_timeout ?? config.setupTimeout,
  })
}

/**
 * Safely start a PostgreSQL instance with retry logic
 * Handles platform-specific timing issues and transient failures
 */
export async function startInstanceWithRetry(
  instance: PostgresInstance,
  maxRetries?: number,
  timeoutSeconds?: number,
): Promise<void> {
  const config = getPlatformConfig()
  const retries = maxRetries ?? config.maxRetries
  const timeout = timeoutSeconds ?? config.startupTimeout

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await instance.startWithTimeout(timeout)

      // Verify instance is actually running
      if (instance.state !== InstanceState.Running) {
        throw new Error(`Instance state is ${instance.state}, expected Running`)
      }

      return // Success
    } catch (error) {
      lastError = error as Error
      console.warn(`Start attempt ${attempt}/${retries} failed:`, error)

      if (attempt < retries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, config.retryDelay))

        // Cleanup failed instance
        try {
          instance.cleanup()
        } catch (cleanupError) {
          console.warn('Error cleaning up failed instance:', cleanupError)
        }
      }
    }
  }

  throw new Error(`Failed to start instance after ${retries} attempts. Last error: ${lastError?.message}`)
}

/**
 * Safely stop a PostgreSQL instance
 * Handles cases where instance is already stopped or in invalid state
 */
export async function safeStopInstance(instance: PostgresInstance, timeoutSeconds?: number): Promise<void> {
  const config = getPlatformConfig()
  const timeout = timeoutSeconds ?? config.stopTimeout

  try {
    if (instance.state === InstanceState.Running) {
      await instance.stopWithTimeout(timeout)
    }
  } catch (error) {
    console.warn('Warning: Failed to stop instance:', error)
    // Don't throw - cleanup should continue
  }
}

/**
 * Safely cleanup instance resources
 * Always succeeds, even if cleanup fails
 */
export function safeCleanupInstance(instance: PostgresInstance): void {
  try {
    // Add small delay to ensure resources are released
    instance.cleanup()
  } catch (error) {
    console.warn('Warning: Failed to cleanup instance:', error)
    // Don't throw - allow test to complete
  }
}

/**
 * Release port back to the pool
 * Safe to call even if port was never acquired
 */
export function releaseTestPort(instance: PostgresInstance): void {
  try {
    const connectionInfo = instance.connectionInfo
    PortManager.releasePort(connectionInfo.port)
  } catch {
    // Ignore errors when getting connection info fails
  }
}

/**
 * Complete cleanup of a test instance
 * Combines stop, cleanup, and port release into a single operation
 */
export async function cleanupTestInstance(instance: PostgresInstance): Promise<void> {
  await safeStopInstance(instance)

  // Small delay to ensure PostgreSQL has fully stopped
  await new Promise((resolve) => setTimeout(resolve, 500))

  safeCleanupInstance(instance)
  releaseTestPort(instance)
}

/**
 * Reset port manager (useful for test isolation)
 */
export function resetPortManager(): void {
  PortManager.reset()
}

/**
 * Wait for a condition to be true with timeout
 * Useful for polling instance state or health checks
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 10000,
  intervalMs: number = 100,
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`)
}
