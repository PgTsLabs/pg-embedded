#!/usr/bin/env node

/**
 * Automated release publishing script
 *
 * This script publishes the prepared release to npm and creates a GitHub release.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

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

function checkGitTag(version) {
  log(`Checking if git tag v${version} exists...`)

  try {
    execSync(`git rev-parse v${version}`, { stdio: 'pipe' })
    log(`Git tag v${version} exists`, 'success')
    return true
  } catch (error) {
    log(`Git tag v${version} does not exist. Run prepare-release first.`, error)
    return false
  }
}

function publishToNpm() {
  log('Publishing to npm...')

  try {
    const output = runCommand('npm publish --access public', 'Publish to npm')

    // Extract published package info
    const lines = output.split('\n')
    const publishedLine = lines.find((line) => line.includes('+ '))
    if (publishedLine) {
      log(`Published: ${publishedLine.trim()}`, 'success')
    }

    return true
  } catch (error) {
    log('Failed to publish to npm', error)
    return false
  }
}

function pushToGit() {
  log('Pushing to git remote...')

  try {
    runCommand('git push origin main', 'Push commits')
    runCommand('git push origin --tags', 'Push tags')
    return true
  } catch (error) {
    log('Failed to push to git', error)
    return false
  }
}

function createGitHubRelease(version) {
  log('Creating GitHub release...')

  const releaseNotesFile = `release-notes-${version}.md`

  if (!existsSync(releaseNotesFile)) {
    log(`Release notes file ${releaseNotesFile} not found`, 'warning')
    return false
  }

  try {
    // Check if GitHub CLI is available
    execSync('gh --version', { stdio: 'pipe' })

    // const releaseNotes = readFileSync(releaseNotesFile, 'utf8')

    // Create GitHub release
    runCommand(
      `gh release create v${version} --title "Release v${version}" --notes-file ${releaseNotesFile}`,
      'Create GitHub release',
    )

    return true
  } catch (error) {
    log('GitHub CLI not available or failed to create release', error)
    log('Please create the GitHub release manually', 'info')
    return false
  }
}

function validatePublishPrerequisites() {
  log('Validating publish prerequisites...')

  // Check if we're on main branch
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim()
    if (branch !== 'main') {
      log(`Currently on branch '${branch}'. Please switch to 'main' branch.`, 'error')
      return false
    }
  } catch (error) {
    log('Failed to check current branch', error)
    return false
  }

  // Check if working directory is clean
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    if (status.trim()) {
      log('Working directory is not clean', 'error')
      return false
    }
  } catch (error) {
    log('Failed to check git status', error)
    return false
  }

  // Check npm authentication
  try {
    const whoami = execSync('npm whoami', { encoding: 'utf8' }).trim()
    log(`Authenticated as: ${whoami}`, 'success')
  } catch (error) {
    log('Not authenticated with npm. Run `npm login` first.', error)
    return false
  }

  log('All prerequisites validated', 'success')
  return true
}

async function main() {
  const args = process.argv.slice(2)
  const skipGitHub = args.includes('--skip-github')
  const dryRun = args.includes('--dry-run')

  log('🚀 Starting automated release publishing...\n')

  if (dryRun) {
    log('🧪 DRY RUN MODE - No actual publishing will occur', 'warning')
  }

  // Step 1: Validate prerequisites
  if (!validatePublishPrerequisites()) {
    process.exit(1)
  }

  // Step 2: Get current version and check tag
  const version = getCurrentVersion()
  log(`\n📦 Publishing version: ${version}`)

  if (!checkGitTag(version)) {
    process.exit(1)
  }

  // Step 3: Push to git (if not dry run)
  if (!dryRun) {
    log('\n📤 Pushing to git...')
    if (!pushToGit()) {
      process.exit(1)
    }
  } else {
    log('\n📤 Would push to git (dry run)', 'info')
  }

  // Step 4: Publish to npm (if not dry run)
  if (!dryRun) {
    log('\n📦 Publishing to npm...')
    if (!publishToNpm()) {
      process.exit(1)
    }
  } else {
    log('\n📦 Would publish to npm (dry run)', 'info')
    runCommand('npm publish --dry-run', 'Dry run publish')
  }

  // Step 5: Create GitHub release (if not dry run and not skipped)
  if (!dryRun && !skipGitHub) {
    log('\n🐙 Creating GitHub release...')
    createGitHubRelease(version)
  } else if (dryRun) {
    log('\n🐙 Would create GitHub release (dry run)', 'info')
  } else {
    log('\n🐙 Skipping GitHub release creation', 'info')
  }

  if (dryRun) {
    log('\n🧪 Dry run completed successfully!')
    log('Run without --dry-run to actually publish')
  } else {
    log('\n🎉 Release published successfully!')
    log(`\nPackage published: https://www.npmjs.com/package/pg-embeded`)
    log(`GitHub release: https://github.com/PgTsLab/pg-embedded/releases/tag/v${version}`)

    log('\n📢 Post-release tasks:')
    log('1. Announce the release on social media')
    log('2. Update documentation if needed')
    log('3. Monitor for any issues')
  }
}

main().catch((error) => {
  log(`Release publishing failed: ${error.message}`, 'error')
  process.exit(1)
})
