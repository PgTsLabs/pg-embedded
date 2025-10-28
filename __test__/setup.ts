import { PostgresInstance } from '../index.js'
import { cleanupSharedMemorySegments, isSharedMemoryError } from './_test-utils.js'

await cleanupSharedMemorySegments()

const DEFAULT_MAX_PARALLEL_STARTS = Number.parseInt(
  process.env.PG_EMBEDDED_TEST_MAX_PARALLEL_STARTS ??
    (process.platform === 'win32' ? '1' : '2'),
)

const MAX_PARALLEL_STARTS = Math.max(1, DEFAULT_MAX_PARALLEL_STARTS)

type Resolver = () => void
const waitQueue: Resolver[] = []
let availablePermits = MAX_PARALLEL_STARTS

async function acquireStartPermit(): Promise<void> {
  if (availablePermits > 0) {
    availablePermits--
    return
  }

  await new Promise<void>((resolve) => {
    waitQueue.push(resolve)
  })
}

function releaseStartPermit(): void {
  const next = waitQueue.shift()
  if (next) {
    next()
    return
  }
  availablePermits = Math.min(MAX_PARALLEL_STARTS, availablePermits + 1)
}

async function runWithStartGuards<T>(runner: () => Promise<T>): Promise<T> {
  await acquireStartPermit()

  try {
    try {
      return await runner()
    } catch (error) {
      if (!isSharedMemoryError(error)) {
        throw error
      }

      await cleanupSharedMemorySegments()
      return await runner()
    }
  } finally {
    releaseStartPermit()
  }
}

const originalStartWithTimeout = PostgresInstance.prototype.startWithTimeout
if (!(PostgresInstance.prototype as any)._pgEmbeddedPatchedStartWithTimeout) {
  Object.defineProperty(PostgresInstance.prototype, '_pgEmbeddedPatchedStartWithTimeout', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })

  PostgresInstance.prototype.startWithTimeout = async function patchedStartWithTimeout(
    this: PostgresInstance,
    timeoutSeconds: number,
  ): Promise<void> {
    return runWithStartGuards(() => originalStartWithTimeout.call(this, timeoutSeconds))
  }
}

const originalStart = PostgresInstance.prototype.start
if (!(PostgresInstance.prototype as any)._pgEmbeddedPatchedStart) {
  Object.defineProperty(PostgresInstance.prototype, '_pgEmbeddedPatchedStart', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })

  PostgresInstance.prototype.start = async function patchedStart(
    this: PostgresInstance,
    initialize?: boolean,
  ): Promise<void> {
    return runWithStartGuards(() => originalStart.call(this, initialize))
  }
}

process.once('beforeExit', () => {
  cleanupSharedMemorySegments().catch((error) => {
    console.warn('Warning: final shared memory cleanup failed:', error)
  })
})
