#!/usr/bin/env node

/**
 * Release preparation script
 *
 * This script prepares the package for release by:
 * - Validating all requirements are met
 * - Building all artifacts
 * - Running tests
 * - Updating version numbers
 * - Creating release notes
 */

import { execSync } from 'child_process'
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

function getCurrentVersion() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  return packageJson.version
}

function updateVersionInFiles(version) {
  log(`Updating version to ${version} in all files...`)

  // Update package.json
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  packageJson.version = version
  writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n')

  // Update Cargo.toml
  let cargoToml = readFileSync('Cargo.toml', 'utf8')
  cargoToml = cargoToml.replace(/version = "[^"]*"/, `version = "${version}"`)
  writeFileSync('Cargo.toml', cargoToml)

  log('Version updated in all files', 'success')
}

function extractPostgreSQLVersion(version) {
  const match = version.match(/\+pg(\d+\.\d+)/)
  return match ? match[1] : null
}

function incrementVersionWithPgVersion(currentVersion, releaseType) {
  // Extract PostgreSQL version if present
  const pgVersion = extractPostgreSQLVersion(currentVersion)

  // Extract base version (without +pg suffix)
  const baseVersion = currentVersion.split('+')[0]
  const [major, minor, patch] = baseVersion.split('.').map(Number)

  let newBaseVersion
  switch (releaseType) {
    case 'major':
      newBaseVersion = `${major + 1}.0.0`
      break
    case 'minor':
      newBaseVersion = `${major}.${minor + 1}.0`
      break
    case 'patch':
    default:
      newBaseVersion = `${major}.${minor}.${patch + 1}`
      break
  }

  // Append PostgreSQL version if it was present
  return pgVersion ? `${newBaseVersion}+pg${pgVersion}` : newBaseVersion
}

function validateGitStatus() {
  log('Checking git status...')

  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    if (status.trim()) {
      log('Working directory is not clean. Please commit or stash changes.', 'error')
      log('Uncommitted changes:', 'warning')
      console.log(status)
      return false
    }

    log('Working directory is clean', 'success')
    return true
  } catch (error) {
    log('Failed to check git status', error)
    return false
  }
}

function createGitTag(version) {
  log(`Creating git tag v${version}...`)

  try {
    runCommand(`git add .`, 'Stage changes')
    runCommand(`git commit -m "chore: release v${version}"`, 'Commit release')
    runCommand(`git tag -a v${version} -m "Release v${version}"`, 'Create tag')

    log(`Git tag v${version} created successfully`, 'success')
    return true
  } catch (error) {
    log('Failed to create git tag', error)
    return false
  }
}

function generateReleaseNotes(version) {
  log('Generating release notes...')

  const changelog = readFileSync('CHANGELOG.md', 'utf8')

  // Extract release notes for current version
  const versionRegex = new RegExp(`## \\[${version}\\].*?(?=## \\[|$)`, 's')
  const match = changelog.match(versionRegex)

  if (match) {
    const releaseNotes = match[0].trim()
    writeFileSync(`release-notes-${version}.md`, releaseNotes)
    log(`Release notes saved to release-notes-${version}.md`, 'success')
    return releaseNotes
  } else {
    log('Could not extract release notes from CHANGELOG.md', 'warning')
    return null
  }
}

function validateNpmAuth() {
  log('Checking npm authentication...')

  try {
    const whoami = execSync('npm whoami', { encoding: 'utf8' }).trim()
    log(`Authenticated as: ${whoami}`, 'success')
    return true
  } catch (error) {
    log('Not authenticated with npm. Run `npm login` first.', error)
    return false
  }
}

function dryRunPublish() {
  log('Running npm publish dry run...')

  try {
    const output = runCommand('npm publish --dry-run', 'Dry run publish')

    // Extract package info
    const lines = output.split('\n')
    const packageLine = lines.find((line) => line.includes('npm notice package:'))
    const sizeLine = lines.find((line) => line.includes('npm notice package size:'))
    const unpackedLine = lines.find((line) => line.includes('npm notice unpacked size:'))
    const filesLine = lines.find((line) => line.includes('npm notice total files:'))

    if (packageLine) log(packageLine.replace('npm notice ', ''), 'info')
    if (sizeLine) log(sizeLine.replace('npm notice ', ''), 'info')
    if (unpackedLine) log(unpackedLine.replace('npm notice ', ''), 'info')
    if (filesLine) log(filesLine.replace('npm notice ', ''), 'info')

    return true
  } catch (error) {
    log('Dry run publish failed', error)
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const releaseType = args[0] || 'patch' // patch, minor, major

  log(`🚀 Preparing ${releaseType} release...\n`)

  // Step 1: Validate git status
  if (!validateGitStatus()) {
    process.exit(1)
  }

  // Step 2: Clean and build
  log('\n🧹 Cleaning and building...')
  runCommand('pnpm clean', 'Clean build artifacts')
  runCommand('pnpm install', 'Install dependencies')
  runCommand('pnpm build', 'Build project')

  // Step 3: Run validation
  log('\n✅ Running validation...')
  runCommand('pnpm validate', 'Validate release')

  // Step 4: Update version
  log('\n📝 Updating version...')
  const currentVersion = getCurrentVersion()
  log(`Current version: ${currentVersion}`)

  // Calculate new version (preserving PostgreSQL version suffix)
  const newVersion = incrementVersionWithPgVersion(currentVersion, releaseType)

  log(`New version: ${newVersion}`)
  updateVersionInFiles(newVersion)

  // Step 5: Generate release notes
  log('\n📋 Generating release notes...')
  generateReleaseNotes(newVersion)

  // Step 6: Validate npm authentication
  log('\n🔐 Validating npm authentication...')
  if (!validateNpmAuth()) {
    process.exit(1)
  }

  // Step 7: Dry run publish
  log('\n🧪 Testing publish...')
  if (!dryRunPublish()) {
    process.exit(1)
  }

  // Step 8: Create git tag
  log('\n🏷️  Creating git tag...')
  if (!createGitTag(newVersion)) {
    process.exit(1)
  }

  log('\n🎉 Release preparation completed successfully!')
  log(`\nNext steps:`)
  log(`1. Review the changes: git log --oneline -5`)
  log(`2. Push to remote: git push origin main --tags`)
  log(`3. Publish to npm: npm publish`)
  log(`4. Create GitHub release with release-notes-${newVersion}.md`)

  log(`\nOr run the automated publish:`)
  log(`pnpm release:publish`)
}

main().catch((error) => {
  log(`Release preparation failed: ${error.message}`, error)
  process.exit(1)
})
