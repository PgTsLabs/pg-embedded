// Test utility functions
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PostgresInstance } from '../index.js'

const execFileAsync = promisify(execFile)
const SHM_ERROR_PATTERN = 'could not create shared memory segment'

export function isSharedMemoryError(error: unknown): boolean {
  if (!error) {
    return false
  }

  const message = error instanceof Error ? error.message : String(error)
  return message.includes(SHM_ERROR_PATTERN)
}

export async function cleanupSharedMemorySegments(): Promise<void> {
  if (!['darwin', 'linux'].includes(process.platform)) {
    return
  }

  try {
    const commandArgs: string[][] = process.platform === 'darwin' ? [['-mob'], ['-m']] : [['-m']]

    let stdout: string | null = null
    let lastError: unknown = null

    for (const args of commandArgs) {
      try {
        const result = await execFileAsync('ipcs', args)
        stdout = result.stdout
        break
      } catch (error) {
        lastError = error
        continue
      }
    }

    if (!stdout) {
      throw lastError
    }

    const lines = stdout.split('\n')
    const idsToRemove: string[] = []
    const currentUser = process.env.USER || process.env.LOGNAME

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      if (process.platform === 'darwin') {
        if (!trimmed.startsWith('m ')) {
          continue
        }

        const parts = trimmed.split(/\s+/)
        if (parts.length < 8) {
          continue
        }

        const owner = parts[4]
        const nattch = parts[6]
        const id = parts[1]

        if (owner === currentUser && nattch === '0') {
          idsToRemove.push(id)
        }
      } else {
        // Linux util-linux `ipcs -m` output format
        if (trimmed.startsWith('------') || trimmed.startsWith('key ') || trimmed.startsWith('Shared')) {
          continue
        }

        const parts = trimmed.split(/\s+/)
        if (parts.length < 6) {
          continue
        }

        const id = parts[1]
        const owner = parts[2]
        const nattch = parts[5]

        if (owner === currentUser && nattch === '0') {
          idsToRemove.push(id)
        }
      }
    }

    if (!idsToRemove.length) {
      return
    }

    await Promise.all(
      idsToRemove.map(async (id) => {
        try {
          await execFileAsync('ipcrm', ['-m', id])
        } catch (cleanupError) {
          console.warn(`Warning: Failed to remove shared memory segment ${id}:`, cleanupError)
        }
      }),
    )
  } catch (error) {
    // Ignore environments without ipcs/ipcrm support
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Warning: Shared memory cleanup failed:', error)
    }
  }
}

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
export async function safeCleanupInstance(instance: PostgresInstance): Promise<void> {
  try {
    await instance.cleanup()
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
      if (attempt === 1) {
        await cleanupSharedMemorySegments()
      }
      await instance.startWithTimeout(timeoutSeconds)
      return // Successfully started
    } catch (error) {
      lastError = error as Error
      console.warn(`Start attempt ${attempt} failed:`, error)

      if (isSharedMemoryError(error)) {
        await cleanupSharedMemorySegments()
      }

      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Cleanup failed instance
        try {
          await instance.cleanup()
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
