#!/usr/bin/env node

/**
 * Test script for version management scripts
 * 
 * This script tests all version management functionality to ensure
 * cross-platform compatibility and correct behavior.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m',
  }

  const prefix = {
    info: 'ℹ',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  }

  console.log(`${colors[type]}${prefix[type]} ${message}${colors.reset}`)
}

function runTest(testName, testFn) {
  log(`Testing: ${testName}`)
  try {
    const result = testFn()
    if (result) {
      log(`${testName}: PASSED`, 'success')
      return true
    } else {
      log(`${testName}: FAILED`, 'error')
      return false
    }
  } catch (error) {
    log(`${testName}: ERROR - ${error.message}`, 'error')
    return false
  }
}

function testExtractVersion() {
  const output = execSync('node scripts/extract-pg-version.js', { encoding: 'utf8' }).trim()
  return output === '17.5'
}

function testExtractVersionEnv() {
  const output = execSync('node scripts/extract-pg-version.js --env', { encoding: 'utf8' }).trim()
  return output === 'POSTGRESQL_VERSION=17.5'
}

function testPackageVersionFormat() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const version = packageJson.version
  return /^\d+\.\d+\.\d+\+pg\d+\.\d+$/.test(version)
}

function testCargoVersionSync() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const cargoToml = readFileSync('Cargo.toml', 'utf8')
  
  const packageVersion = packageJson.version
  const cargoVersionMatch = cargoToml.match(/version = "([^"]*)"/)
  
  if (!cargoVersionMatch) {
    throw new Error('Could not find version in Cargo.toml')
  }
  
  return packageVersion === cargoVersionMatch[1]
}

function testScriptFiles() {
  const requiredFiles = [
    'scripts/extract-pg-version.js',
    'scripts/extract-pg-version.ps1',
    'scripts/extract-pg-version.cmd',
    'scripts/update-pg-version.js'
  ]
  
  for (const file of requiredFiles) {
    try {
      readFileSync(file, 'utf8')
    } catch (error) {
      throw new Error(`Missing required file: ${file}`)
    }
  }
  
  return true
}

function main() {
  log('🧪 Running version management script tests...\n')

  const tests = [
    { name: 'Extract PostgreSQL version', fn: testExtractVersion },
    { name: 'Extract version with --env flag', fn: testExtractVersionEnv },
    { name: 'Package version format validation', fn: testPackageVersionFormat },
    { name: 'Cargo.toml version synchronization', fn: testCargoVersionSync },
    { name: 'Required script files exist', fn: testScriptFiles },
  ]

  let passed = 0
  let total = tests.length

  for (const test of tests) {
    if (runTest(test.name, test.fn)) {
      passed++
    }
  }

  log('\n📊 Test Results:')
  log('='.repeat(50))
  log(`Passed: ${passed}/${total}`)
  log(`Failed: ${total - passed}/${total}`)
  log('='.repeat(50))

  if (passed === total) {
    log('🎉 All tests passed! Version management scripts are working correctly.', 'success')
    process.exit(0)
  } else {
    log('❌ Some tests failed. Please check the issues above.', 'error')
    process.exit(1)
  }
}

main()