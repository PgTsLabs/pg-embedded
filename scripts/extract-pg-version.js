#!/usr/bin/env node

/**
 * Extract PostgreSQL version from package version
 *
 * This script extracts the PostgreSQL version from the package version string.
 * For example: "0.1.0+pg17.5" -> "17.5"
 */

import { readFileSync } from 'fs'

function extractPostgreSQLVersion(packageVersion) {
  // Match pattern like "0.1.0+pg17.5" and extract "17.5"
  const match = packageVersion.match(/\+pg(\d+\.\d+)/)
  if (match) {
    return match[1]
  }

  // Fallback: if no match, try to find version in different format
  const altMatch = packageVersion.match(/pg(\d+\.\d+)/)
  if (altMatch) {
    return altMatch[1]
  }

  throw new Error(`Could not extract PostgreSQL version from: ${packageVersion}`)
}

function getPostgreSQLVersionFromPackage() {
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
    return extractPostgreSQLVersion(packageJson.version)
  } catch (error) {
    console.error('Error reading package.json:', error.message)
    process.exit(1)
  }
}

function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/extract-pg-version.js [options]')
    console.log('')
    console.log('Options:')
    console.log('  --env     Output as environment variable format')
    console.log('  --help    Show this help message')
    console.log('')
    console.log('Examples:')
    console.log('  node scripts/extract-pg-version.js        # Output: 17.5')
    console.log('  node scripts/extract-pg-version.js --env  # Output: POSTGRESQL_VERSION=17.5')
    return
  }

  try {
    const pgVersion = getPostgreSQLVersionFromPackage()

    if (args.includes('--env')) {
      console.log(`POSTGRESQL_VERSION=${pgVersion}`)
    } else {
      console.log(pgVersion)
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

// Export for use in other scripts
export { extractPostgreSQLVersion, getPostgreSQLVersionFromPackage }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
