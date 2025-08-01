import test from 'ava'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  getVersionInfo,
  getPostgreSqlVersion,
  getPackageVersion,
  PostgresInstance,
  initLogger,
  LogLevel,
} from '../index.js'

// Initialize logger for tests
initLogger(LogLevel.Error)

test('getVersionInfo returns complete version information', (t) => {
  const versionInfo = getVersionInfo()

  // Check that all required fields are present
  t.truthy(versionInfo.packageVersion, 'Package version should be present')
  t.truthy(versionInfo.postgresqlVersion, 'PostgreSQL version should be present')
  t.truthy(versionInfo.postgresqlEmbeddedVersion, 'PostgreSQL embedded version should be present')
  t.truthy(versionInfo.buildInfo, 'Build info should be present')

  // Check build info fields
  t.truthy(versionInfo.buildInfo.target, 'Build target should be present')
  t.truthy(versionInfo.buildInfo.profile, 'Build profile should be present')
  t.truthy(versionInfo.buildInfo.rustcVersion, 'Rustc version should be present')
  t.truthy(versionInfo.buildInfo.buildTimestamp, 'Build timestamp should be present')

  // Check version format (should contain dots for semver)
  t.true(versionInfo.packageVersion.includes('.'), 'Package version should be in semver format')
  t.true(versionInfo.postgresqlVersion.includes('.'), 'PostgreSQL version should contain dots')

  // Check that build profile is either debug or release
  t.true(['debug', 'release'].includes(versionInfo.buildInfo.profile), 'Build profile should be debug or release')

  console.log('Version Info:', JSON.stringify(versionInfo, null, 2))
})

test('getPostgreSQLVersion returns PostgreSQL version', (t) => {
  const version = getPostgreSqlVersion()

  t.truthy(version, 'PostgreSQL version should not be empty')
  t.true(version.includes('.'), 'PostgreSQL version should contain dots')
  t.true(version.length > 0, 'PostgreSQL version should not be empty string')

  // Should be in format like "15.4"
  const parts = version.split('.')
  t.true(parts.length >= 2, 'PostgreSQL version should have at least major.minor')

  console.log('PostgreSQL Version:', version)
})

test('getPackageVersion returns package version', (t) => {
  const version = getPackageVersion()

  t.truthy(version, 'Package version should not be empty')
  t.true(version.includes('.'), 'Package version should be in semver format')

  // Should be in semver format like "1.0.0"
  const parts = version.split('.')
  t.true(parts.length >= 3, 'Package version should have at least major.minor.patch')

  console.log('Package Version:', version)
})

test('PostgresInstance.getPostgreSQLVersion returns same version as global function', (t) => {
  const instance = new PostgresInstance({
    port: 5555,
    username: 'version_test_user',
    password: 'version_test_pass',
    persistent: false,
  })

  try {
    const globalVersion = getPostgreSqlVersion()
    const instanceVersion = instance.getPostgreSqlVersion()

    t.is(globalVersion, instanceVersion, 'Instance and global PostgreSQL versions should match')

    console.log('Instance PostgreSQL Version:', instanceVersion)
  } finally {
    instance.cleanup()
  }
})

test('version information is consistent', (t) => {
  const versionInfo = getVersionInfo()
  const pgVersion = getPostgreSqlVersion()
  const packageVersion = getPackageVersion()

  t.is(versionInfo.postgresqlVersion, pgVersion, 'PostgreSQL versions should match')
  t.is(versionInfo.packageVersion, packageVersion, 'Package versions should match')
})

test('version information contains expected PostgreSQL version', (t) => {
  const pgVersion = getPostgreSqlVersion()

  // Dynamically extract expected PostgreSQL version from package.json
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const packageVersion = packageJson.version

  // Extract PostgreSQL version from package version (format: x.y.z+pgA.B)
  const pgVersionMatch = packageVersion.match(/\+pg(\d+\.\d+)/)
  if (!pgVersionMatch) {
    t.fail(`Could not extract PostgreSQL version from package version: ${packageVersion}`)
    return
  }

  const expectedPgVersion = pgVersionMatch[1]
  t.true(pgVersion.startsWith(expectedPgVersion), `Expected PostgreSQL ${expectedPgVersion}, got ${pgVersion}`)
})

test('build information contains valid data', (t) => {
  const versionInfo = getVersionInfo()
  const buildInfo = versionInfo.buildInfo

  // Target should contain architecture and OS
  t.true(buildInfo.target.includes('-'), 'Target should contain architecture and OS separated by dash')

  // Rustc version should start with "rustc"
  t.true(buildInfo.rustcVersion.startsWith('rustc'), 'Rustc version should start with "rustc"')

  // Build timestamp should be a valid date format
  t.true(buildInfo.buildTimestamp.includes('UTC'), 'Build timestamp should include UTC')

  console.log('Build Info:', buildInfo)
})

test('version functions work without instance', (t) => {
  // These should work without creating a PostgreSQL instance
  t.notThrows(() => getVersionInfo(), 'getVersionInfo should not throw')
  t.notThrows(() => getPostgreSqlVersion(), 'getPostgreSQLVersion should not throw')
  t.notThrows(() => getPackageVersion(), 'getPackageVersion should not throw')
})
