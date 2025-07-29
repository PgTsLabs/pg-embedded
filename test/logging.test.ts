import test from 'ava'
import { initLogger, logInfo, logError, logWarn, logDebug, LogLevel } from '../index.js'

test('Logger can be initialized', (t) => {
  t.notThrows(() => {
    initLogger(LogLevel.Info)
  })
})

test('Log functions exist and can be called', (t) => {
  // Initialize logger
  initLogger(LogLevel.Debug)

  // Test different log level functions
  t.notThrows(() => {
    logInfo('Test info message')
    logError('Test error message')
    logWarn('Test warning message')
    logDebug('Test debug message')
  })
})

test('Logger can be initialized with different levels', (t) => {
  const levels = [LogLevel.Error, LogLevel.Warn, LogLevel.Info, LogLevel.Debug, LogLevel.Trace]

  levels.forEach((level) => {
    t.notThrows(() => {
      initLogger(level)
    })
  })
})

test('Logger can be initialized without level (uses default)', (t) => {
  t.notThrows(() => {
    initLogger()
  })
})
