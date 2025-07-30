#!/usr/bin/env node

/**
 * Build verification script
 *
 * This script verifies that the build process works correctly across different platforms
 * and that all required artifacts are generated.
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'

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

function runCommand(command, description) {
  log(`Running: ${description}...`)
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' })
    log(`${description} completed successfully`, 'success')
    return output
  } catch (error) {
    log(`${description} failed: ${error.message}`, 'error')
    throw error
  }
}

function checkBuildArtifacts() {
  log('Checking build artifacts...')

  const requiredFiles = [
    { file: 'index.js', description: 'ES Module entry point' },
    { file: 'index.cjs', description: 'CommonJS entry point' },
    { file: 'index.d.ts', description: 'TypeScript definitions' },
  ]

  let allPresent = true

  for (const { file, description } of requiredFiles) {
    if (existsSync(file)) {
      const stats = statSync(file)
      const size = (stats.size / 1024).toFixed(2)
      log(`Found ${description}: ${file} (${size} KB)`, 'success')
    } else {
      log(`Missing ${description}: ${file}`, 'error')
      allPresent = false
    }
  }

  // Check for native binaries
  const nativeFiles = [
    'pg-embedded.darwin-arm64.node',
    'pg-embedded.darwin-x64.node',
    'pg-embedded.linux-x64-gnu.node',
    'pg-embedded.win32-x64-msvc.node',
  ]

  const foundNative = []
  for (const file of nativeFiles) {
    if (existsSync(file)) {
      const stats = statSync(file)
      const size = (stats.size / 1024 / 1024).toFixed(2)
      foundNative.push(`${file} (${size} MB)`)
    }
  }

  if (foundNative.length > 0) {
    log(`Found native binaries: ${foundNative.join(', ')}`, 'success')
  } else {
    log('No native binaries found. This is expected if not built yet.', 'warning')
  }

  return allPresent
}

function validateTypeScriptDefinitions() {
  log('Validating TypeScript definitions...')

  if (!existsSync('index.d.ts')) {
    log('TypeScript definitions not found', 'error')
    return false
  }

  const dts = readFileSync('index.d.ts', 'utf8')

  // Check for essential exports
  const requiredExports = [
    'PostgresInstance',
    'PostgresSettings',
    'ConnectionInfo',
    'InstanceState',
    'initLogger',
    'LogLevel',
  ]

  let valid = true
  for (const exportName of requiredExports) {
    if (!dts.includes(exportName)) {
      log(`Missing export in TypeScript definitions: ${exportName}`, 'error')
      valid = false
    }
  }

  // Check for JSDoc comments
  if (!dts.includes('/**')) {
    log('TypeScript definitions missing JSDoc comments', 'warning')
  }

  if (valid) {
    log('TypeScript definitions validation passed', 'success')
  }

  return valid
}

function testBasicImport() {
  log('Testing basic import functionality...')

  try {
    // Test ES module import
    runCommand(
      "node -e \"import('./index.js').then(m => console.log('ES import:', Object.keys(m)))\"",
      'ES module import test',
    )

    // Test CommonJS require
    runCommand(
      "node -e \"const m = require('./index.cjs'); console.log('CJS require:', Object.keys(m))\"",
      'CommonJS require test',
    )

    return true
  } catch (error) {
    log('Import tests failed', error)
    return false
  }
}

function checkPackageSize() {
  log('Checking package size...')

  try {
    const output = runCommand('npm pack --dry-run', 'Package size check')

    // Extract size information
    const lines = output.split('\n')
    const sizeLine = lines.find((line) => line.includes('package size:'))
    const unpackedLine = lines.find((line) => line.includes('unpacked size:'))

    if (sizeLine) log(sizeLine.trim(), 'info')
    if (unpackedLine) log(unpackedLine.trim(), 'info')

    // Check if package is too large
    const sizeMatch = sizeLine?.match(/(\d+\.?\d*)\s*MB/)
    if (sizeMatch) {
      const sizeMB = parseFloat(sizeMatch[1])
      if (sizeMB > 50) {
        log(`Package size (${sizeMB}MB) is quite large. Consider optimizing.`, 'warning')
      } else {
        log(`Package size (${sizeMB}MB) is reasonable`, 'success')
      }
    }

    return true
  } catch (error) {
    log('Package size check failed', error)
    return false
  }
}

function validateCargoToml() {
  log('Validating Cargo.toml...')

  if (!existsSync('Cargo.toml')) {
    log('Cargo.toml not found', 'error')
    return false
  }

  const cargoToml = readFileSync('Cargo.toml', 'utf8')

  // Check for required sections
  const requiredSections = ['[package]', '[dependencies]', '[build-dependencies]']
  let valid = true

  for (const section of requiredSections) {
    if (!cargoToml.includes(section)) {
      log(`Missing section in Cargo.toml: ${section}`, 'error')
      valid = false
    }
  }

  // Check version consistency with package.json
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const versionMatch = cargoToml.match(/version\s*=\s*"([^"]+)"/)

  if (versionMatch && versionMatch[1] !== packageJson.version) {
    log(`Version mismatch: Cargo.toml (${versionMatch[1]}) vs package.json (${packageJson.version})`, 'warning')
  }

  if (valid) {
    log('Cargo.toml validation passed', 'success')
  }

  return valid
}

async function main() {
  log('🔧 Starting build verification...\n')

  const checks = [
    { name: 'Build artifacts', fn: checkBuildArtifacts },
    { name: 'TypeScript definitions', fn: validateTypeScriptDefinitions },
    { name: 'Basic imports', fn: testBasicImport },
    { name: 'Package size', fn: checkPackageSize },
    { name: 'Cargo.toml', fn: validateCargoToml },
  ]

  let allPassed = true
  const results = []

  for (const check of checks) {
    log(`\n🔍 Checking: ${check.name}`)
    try {
      const result = check.fn()
      results.push({ name: check.name, passed: result })
      if (!result) allPassed = false
    } catch (error) {
      log(`Check failed: ${error.message}`, 'error')
      results.push({ name: check.name, passed: false })
      allPassed = false
    }
  }

  // Print summary
  log('\n📊 Build Verification Summary:')
  log('='.repeat(50))

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL'
    log(`${status} ${result.name}`)
  }

  log('='.repeat(50))

  if (allPassed) {
    log('🎉 All build checks passed!', 'success')
    process.exit(0)
  } else {
    log('❌ Some build checks failed. Please review and fix.', 'error')
    process.exit(1)
  }
}

main().catch((error) => {
  log(`Build verification failed: ${error.message}`, 'error')
  process.exit(1)
})
