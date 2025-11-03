import { PostgresInstance as Postgres } from './binding.js'
export * from './binding.js';

/**
 * Enhanced PostgresInstance with optional automatic cleanup
 *
 * This wrapper provides optional signal handling for automatic cleanup
 * when the process receives SIGINT or SIGTERM signals.
 *
 * @example
 * // With automatic cleanup (default)
 * const instance = new PostgresInstance({ port: 5432 })
 *
 * @example
 * // Without automatic cleanup
 * const instance = new PostgresInstance({ port: 5432, autoCleanup: false })
 */
export class PostgresInstance extends Postgres {
  constructor(settings = {}) {
    // Extract autoCleanup option before passing to Rust
    const { autoCleanup = true, ...rustSettings } = settings
    super(rustSettings)

    this._cleanupHandlers = []
    this._cleanupCalled = false

    // Optional automatic cleanup on process signals
    if (autoCleanup) {
      this._setupCleanupHandlers()
    }
  }

  /**
   * Sets up signal handlers for automatic cleanup
   * @private
   */
  _setupCleanupHandlers() {
    const cleanup = async (signal) => {
      // Prevent multiple cleanup calls
      if (this._cleanupCalled) {
        return
      }

      try {
        console.log(`\nReceived ${signal}, cleaning up PostgreSQL instance...`)
        await this.cleanup()
        this._cleanupCalled = true
        console.log('Cleanup completed successfully')
        process.exit(0)
      } catch (err) {
        console.error('Cleanup error:', err)
        process.exit(1)
      }
    }

    // Use 'once' to ensure handlers are only called once
    const sigintHandler = () => cleanup('SIGINT')
    const sigtermHandler = () => cleanup('SIGTERM')

    process.once('SIGINT', sigintHandler)
    process.once('SIGTERM', sigtermHandler)

    // Store handlers for later removal
    this._cleanupHandlers.push(
      { signal: 'SIGINT', handler: sigintHandler },
      { signal: 'SIGTERM', handler: sigtermHandler }
    )
  }

  /**
   * Removes signal handlers
   * @private
   */
  _removeCleanupHandlers() {
    this._cleanupHandlers.forEach(({ signal, handler }) => {
      process.removeListener(signal, handler)
    })
    this._cleanupHandlers = []
  }

  /**
   * Enhanced cleanup that also removes signal handlers
   *
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Prevent multiple cleanup calls
    if (this._cleanupCalled) {
      return
    }

    this._cleanupCalled = true

    // Remove signal handlers first to prevent re-entry
    this._removeCleanupHandlers()

    // Call the Rust cleanup implementation
    return super.cleanup()
  }
}