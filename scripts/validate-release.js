#!/usr/bin/env node

/**
 * Pre-release validation script
 *
 * This script validates that the package is ready for release by checking:
 * - All required files exist
 * - Build artifacts are present
 * - Tests pass
 * - Documentation is up to date
 * - Version consistency
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'

const REQUIRED_FILES = [
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'API.md',
  'package.json',
  'index.js',
  'index.cjs',
  'index.d.ts',
]

const REQUIRED_EXAMPLES = [
  'examples/async-example.js',
  'examples/sync-example.js',
  'examples/testing-example.js',
  'examples/README.md',
]

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m', // cyan
    success: '\x1b[32m', // green
    warning: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
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

function checkFileExists(filePath) {
  if (existsSync(filePath)) {
    log(`Found: ${filePath}`, 'success')
    return true
  } else {
    log(`Missing: ${filePath}`, 'error')
    return false
  }
}

function validatePackageJson() {
  log('Validating package.json...')

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

  // Check required fields
  const requiredFields = ['name', 'version', 'description', 'main', 'types', 'repository', 'license']
  let valid = true

  for (const field of requiredFields) {
    if (!packageJson[field]) {
      log(`Missing required field in package.json: ${field}`, 'error')
      valid = false
    }
  }

  // Check version format
  const versionRegex = /^\d+\.\d+\.\d+(-\w+\.\d+)?$/
  if (!versionRegex.test(packageJson.version)) {
    log(`Invalid version format: ${packageJson.version}`, 'error')
    valid = false
  }

  // Check if files array includes all required files
  const files = packageJson.files || []
  const missingFiles = REQUIRED_FILES.filter((file) => !files.some((f) => file.startsWith(f) || f.includes(file)))

  if (missingFiles.length > 0) {
    log(`Files missing from package.json files array: ${missingFiles.join(', ')}`, 'warning')
  }

  if (valid) {
    log('package.json validation passed', 'success')
  }

  return valid
}

function validateBuildArtifacts() {
  log('Validating build artifacts...')

  const artifacts = ['index.js', 'index.cjs', 'index.d.ts']
  let valid = true

  for (const artifact of artifacts) {
    if (!checkFileExists(artifact)) {
      valid = false
    }
  }

  // Check if native binary exists
  const nativeBinaries = ['pg-embedded.darwin-arm64.node', 'pg-embedded.darwin-x64.node']

  const hasNativeBinary = nativeBinaries.some((binary) => existsSync(binary))
  if (!hasNativeBinary) {
    log('No native binary found. Run `pnpm build` first.', 'warning')
  }

  return valid
}

function validateDocumentation() {
  log('Validating documentation...')

  let valid = true

  // Check required documentation files
  const docFiles = ['README.md', 'API.md', 'CHANGELOG.md', 'CONTRIBUTING.md']
  for (const file of docFiles) {
    if (!checkFileExists(file)) {
      valid = false
    }
  }

  // Check examples
  for (const example of REQUIRED_EXAMPLES) {
    if (!checkFileExists(example)) {
      valid = false
    }
  }

  // Validate README has required sections
  if (existsSync('README.md')) {
    const readme = readFileSync('README.md', 'utf8')
    const requiredSections = ['## Installation', '## Quick Start', '## API Reference', '## Contributing', '## License']

    for (const section of requiredSections) {
      if (!readme.includes(section)) {
        log(`README.md missing section: ${section}`, 'warning')
      }
    }
  }

  return valid
}

function validateTests() {
  log('Running basic tests...')

  try {
    // Run basic tests only to avoid shared memory issues
    runCommand('pnpm test:basic', 'Basic tests')
    return true
  } catch (error) {
    log('Some tests failed. Please fix before release.', error)
    return false
  }
}

function validateLinting() {
  log('Validating code formatting and linting...')

  try {
    runCommand('cargo fmt -- --check', 'Rust formatting check')
    runCommand('pnpm lint', 'JavaScript/TypeScript linting')
    return true
  } catch (error) {
    log('Linting failed. Run `pnpm format` and `pnpm lint:fix` to fix.', error)
    return false
  }
}

function validateExamples() {
  log('Validating examples...')

  try {
    // Test that examples can be imported without errors
    runCommand(
      'node -e "import(\'./examples/async-example.js\').catch(() => process.exit(1))"',
      'Async example syntax check',
    )
    runCommand(
      'node -e "import(\'./examples/sync-example.js\').catch(() => process.exit(1))"',
      'Sync example syntax check',
    )
    runCommand(
      'node -e "import(\'./examples/testing-example.js\').catch(() => process.exit(1))"',
      'Testing example syntax check',
    )
    return true
  } catch (error) {
    log('Example validation failed', error)
    return false
  }
}

async function main() {
  log('🚀 Starting pre-release validation...\n')

  const validations = [
    { name: 'Package.json', fn: validatePackageJson },
    { name: 'Build artifacts', fn: validateBuildArtifacts },
    { name: 'Documentation', fn: validateDocumentation },
    { name: 'Code formatting', fn: validateLinting },
    { name: 'Examples', fn: validateExamples },
    { name: 'Tests', fn: validateTests },
  ]

  let allValid = true
  const results = []

  for (const validation of validations) {
    log(`\n📋 Validating: ${validation.name}`)
    try {
      const result = validation.fn()
      results.push({ name: validation.name, passed: result })
      if (!result) allValid = false
    } catch (error) {
      log(`Validation failed: ${error.message}`, 'error')
      results.push({ name: validation.name, passed: false })
      allValid = false
    }
  }

  // Print summary
  log('\n📊 Validation Summary:')
  log('='.repeat(50))

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL'
    log(`${status} ${result.name}`)
  }

  log('='.repeat(50))

  if (allValid) {
    log('🎉 All validations passed! Package is ready for release.', 'success')
    process.exit(0)
  } else {
    log('❌ Some validations failed. Please fix the issues before release.', 'error')
    process.exit(1)
  }
}

main().catch((error) => {
  log(`Validation script failed: ${error.message}`, 'error')
  process.exit(1)
})
