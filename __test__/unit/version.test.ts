/**
 * Unit tests for version information
 * Tests package version format validation
 */

import test from 'ava'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.join(__dirname, '../../package.json')

test('Package version is defined', (t) => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const version = packageJson.version

  t.truthy(version, 'Version should be defined')
  t.is(typeof version, 'string', 'Version should be a string')
  t.true(version.length > 0, 'Version should not be empty')
})

test('Version follows semantic versioning format', (t) => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const version = packageJson.version

  // Should match format: X.Y.Z+pgA.B or X.Y.Z-prerelease+pgA.B
  const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+pg\d+\.\d+)?$/

  t.regex(version, semverRegex, 'Version should follow semantic versioning format')
})

test('Version includes PostgreSQL version tag', (t) => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const version = packageJson.version

  // Should include +pgX.Y format
  t.true(version.includes('+pg'), 'Version should include PostgreSQL version tag')
})
