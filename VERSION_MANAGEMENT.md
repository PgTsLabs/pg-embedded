# PostgreSQL Version Management

This document explains how PostgreSQL version management works in the pg-embedded project.

## Overview

The project uses a versioning scheme that includes both the package version and the PostgreSQL version:

```
<package-version>+pg<postgresql-version>
```

Example: `0.1.0+pg17.5`

## Automatic Environment Variable Configuration

### In CI/CD

The CI workflow automatically extracts the PostgreSQL version from `package.json` and sets it as the `POSTGRESQL_VERSION` environment variable:

```yaml
- name: Extract PostgreSQL version
  id: pg-version
  run: |
    PG_VERSION=$(node scripts/extract-pg-version.js)
    echo "POSTGRESQL_VERSION=$PG_VERSION" >> $GITHUB_ENV
    echo "postgresql_version=$PG_VERSION" >> $GITHUB_OUTPUT
    echo "PostgreSQL version: $PG_VERSION"
```

This ensures that:
1. No hardcoded PostgreSQL versions in CI configuration
2. The environment variable always matches the package version
3. Updates to PostgreSQL version automatically propagate to CI

### In Local Development

You can extract the PostgreSQL version for local use:

```bash
# Get version as plain text
pnpm pg:version
# Output: 17.5

# Get version as environment variable
node scripts/extract-pg-version.js --env
# Output: POSTGRESQL_VERSION=17.5

# Use in shell scripts
export $(node scripts/extract-pg-version.js --env)
echo $POSTGRESQL_VERSION
```

## Updating PostgreSQL Version

### Method 1: Using the Update Script

```bash
# Update to PostgreSQL 17.6
pnpm pg:update 17.6

# Update to PostgreSQL 18.0
pnpm pg:update 18.0
```

This script:
- Updates `package.json` version from `0.1.0+pg17.5` to `0.1.0+pg17.6`
- Updates `Cargo.toml` version accordingly
- Preserves the base package version

### Method 2: Manual Update

1. Edit `package.json`:
   ```json
   {
     "version": "0.1.0+pg17.6"
   }
   ```

2. Edit `Cargo.toml`:
   ```toml
   [package]
   version = "0.1.0+pg17.6"
   ```

## Release Process

The release scripts automatically preserve the PostgreSQL version:

```bash
# Patch release: 0.1.0+pg17.5 → 0.1.1+pg17.5
pnpm release:patch

# Minor release: 0.1.0+pg17.5 → 0.2.0+pg17.5
pnpm release:minor

# Major release: 0.1.0+pg17.5 → 1.0.0+pg17.5
pnpm release:major
```

## Benefits

1. **Consistency**: PostgreSQL version is defined in one place (package.json)
2. **Automation**: CI automatically uses the correct PostgreSQL version
3. **Maintainability**: No need to update multiple files when changing PostgreSQL version
4. **Traceability**: Clear relationship between package version and PostgreSQL version
5. **Flexibility**: Easy to support multiple PostgreSQL versions in different branches

## Files Affected

When updating PostgreSQL version, these files are automatically updated:

- `package.json` - Package version
- `Cargo.toml` - Rust package version
- CI environment variables (automatically via script)

## Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/extract-pg-version.js` | Extract PostgreSQL version from package version | `node scripts/extract-pg-version.js` |
| `scripts/update-pg-version.js` | Update PostgreSQL version in all files | `node scripts/update-pg-version.js 17.6` |
| `pnpm pg:version` | Get current PostgreSQL version | `pnpm pg:version` |
| `pnpm pg:update` | Update PostgreSQL version | `pnpm pg:update 17.6` |

## Example Workflow

### Updating to a New PostgreSQL Version

1. **Update the version:**
   ```bash
   pnpm pg:update 17.6
   ```

2. **Verify the change:**
   ```bash
   pnpm pg:version
   # Should output: 17.6
   ```

3. **Test locally:**
   ```bash
   pnpm test:basic
   ```

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "chore: update PostgreSQL to 17.6"
   git push
   ```

5. **CI will automatically use the new version** - no additional configuration needed!

### Creating a Release with New PostgreSQL Version

1. **Update PostgreSQL version:**
   ```bash
   pnpm pg:update 18.0
   ```

2. **Create a patch release:**
   ```bash
   pnpm release:patch
   ```
   This creates version `0.1.1+pg18.0` (preserving the PostgreSQL version)

3. **Push and publish:**
   ```bash
   git push origin main --tags
   pnpm release:publish
   ```

The entire process ensures that the PostgreSQL version flows consistently through all parts of the system.