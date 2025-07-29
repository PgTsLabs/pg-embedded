#!/usr/bin/env node

/**
 * Update PostgreSQL version in package version
 *
 * This script updates the PostgreSQL version suffix in both package.json and Cargo.toml
 * For example: "0.1.0+pg17.5" -> "0.1.0+pg18.0"
 */

import { readFileSync, writeFileSync } from 'fs'

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

function updatePostgreSQLVersion(newPgVersion) {
  log(`Updating PostgreSQL version to ${newPgVersion}...`)

  // Update package.json
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const currentVersion = packageJson.version

  // Extract base version and replace PostgreSQL version
  const baseVersion = currentVersion.split('+')[0]
  const newVersion = `${baseVersion}+pg${newPgVersion}`

  log(`Current version: ${currentVersion}`)
  log(`New version: ${newVersion}`)

  packageJson.version = newVersion
  writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n')
  log('Updated package.json', 'success')

  // Update Cargo.toml
  let cargoToml = readFileSync('Cargo.toml', 'utf8')
  cargoToml = cargoToml.replace(/version = "[^"]*"/, `version = "${newVersion}"`)
  writeFileSync('Cargo.toml', cargoToml)
  log('Updated Cargo.toml', 'success')

  log(`PostgreSQL version updated to ${newPgVersion}`, 'success')
  return newVersion
}

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/update-pg-version.js <postgresql-version>')
    console.log('')
    console.log('Examples:')
    console.log('  node scripts/update-pg-version.js 17.6')
    console.log('  node scripts/update-pg-version.js 18.0')
    console.log('')
    console.log('This will update the PostgreSQL version suffix in both package.json and Cargo.toml')
    return
  }

  const newPgVersion = args[0]

  // Validate version format
  if (!/^\d+\.\d+$/.test(newPgVersion)) {
    log('Invalid PostgreSQL version format. Expected format: X.Y (e.g., 17.5)', 'error')
    process.exit(1)
  }

  try {
    updatePostgreSQLVersion(newPgVersion)
  } catch (error) {
    log(`Error: ${error.message}`, 'error')
    process.exit(1)
  }
}

// Export for use in other scripts
export { updatePostgreSQLVersion }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
