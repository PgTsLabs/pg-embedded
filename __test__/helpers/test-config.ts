/**
 * Cross-platform test configuration
 * Centralizes platform-specific settings to ensure tests work across macOS, Linux, and Windows
 */

import os from 'node:os'

export interface PlatformConfig {
  /** Default timeout for instance startup (seconds) */
  startupTimeout: number
  /** Default timeout for instance stop (seconds) */
  stopTimeout: number
  /** Default timeout for setup operations (seconds) */
  setupTimeout: number
  /** Delay between retry attempts (milliseconds) */
  retryDelay: number
  /** Maximum number of retry attempts */
  maxRetries: number
}

/**
 * Get platform-specific configuration
 * Windows requires longer timeouts due to slower I/O operations
 */
export function getPlatformConfig(): PlatformConfig {
  const isWindows = os.platform() === 'win32'

  return {
    startupTimeout: isWindows ? 180 : 60,
    stopTimeout: isWindows ? 60 : 30,
    setupTimeout: isWindows ? 300 : 180,
    retryDelay: isWindows ? 3000 : 2000,
    maxRetries: 3,
  }
}

/**
 * Get test timeout for AVA (in milliseconds)
 */
export function getTestTimeout(): number {
  const config = getPlatformConfig()
  // Add buffer time for test setup/teardown
  return (config.startupTimeout + config.stopTimeout + 30) * 1000
}

/**
 * Check if current platform supports specific features
 */
export const platformSupport = {
  /** Check if platform supports Unix sockets */
  unixSockets: os.platform() !== 'win32',

  /** Check if platform is Windows */
  isWindows: os.platform() === 'win32',

  /** Check if platform is macOS */
  isMacOS: os.platform() === 'darwin',

  /** Check if platform is Linux */
  isLinux: os.platform() === 'linux',
}
