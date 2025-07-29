# Scripts Documentation

This directory contains utility scripts for managing the pg-embeded project.

## Version Management Scripts

### extract-pg-version.js

Extracts the PostgreSQL version from the package version string.

```bash
# Get PostgreSQL version
node scripts/extract-pg-version.js
# Output: 17.5

# Get as environment variable format
node scripts/extract-pg-version.js --env
# Output: POSTGRESQL_VERSION=17.5

# Using npm script
pnpm pg:version
```

### update-pg-version.js

Updates the PostgreSQL version suffix in both `package.json` and `Cargo.toml`.

```bash
# Update PostgreSQL version to 17.6
node scripts/update-pg-version.js 17.6

# Update PostgreSQL version to 18.0
node scripts/update-pg-version.js 18.0

# Using npm script
pnpm pg:update 17.6
```

This script will:

- Update the version in `package.json` from `0.1.0+pg17.5` to `0.1.0+pg17.6`
- Update the version in `Cargo.toml` accordingly
- Preserve the base version number (0.1.0) while only changing the PostgreSQL version

## Release Management Scripts

### prepare-release.js

Prepares the package for release with automatic PostgreSQL version preservation.

```bash
# Patch release (0.1.0+pg17.5 -> 0.1.1+pg17.5)
pnpm release:prepare

# Minor release (0.1.0+pg17.5 -> 0.2.0+pg17.5)
pnpm release:prepare:minor

# Major release (0.1.0+pg17.5 -> 1.0.0+pg17.5)
pnpm release:prepare:major
```

The script automatically preserves the PostgreSQL version suffix when incrementing the base version.

### validate-release.js

Validates that the package is ready for release.

```bash
pnpm validate
```

### publish-release.js

Publishes the prepared release.

```bash
pnpm release:publish
```

## CI/CD Integration

The CI workflow automatically extracts the PostgreSQL version from the package version and sets it as an environment variable:

```yaml
- name: Extract PostgreSQL version
  id: pg-version
  run: |
    PG_VERSION=$(node scripts/extract-pg-version.js)
    echo "POSTGRESQL_VERSION=$PG_VERSION" >> $GITHUB_ENV
    echo "postgresql_version=$PG_VERSION" >> $GITHUB_OUTPUT
    echo "PostgreSQL version: $PG_VERSION"
```

This ensures that the `POSTGRESQL_VERSION` environment variable always matches the version specified in your package version string.

## Workflow Examples

### Updating PostgreSQL Version

When a new PostgreSQL version is released:

1. Update the PostgreSQL version:

   ```bash
   pnpm pg:update 17.6
   ```

2. Test the changes:

   ```bash
   pnpm test:basic
   ```

3. Commit the changes:
   ```bash
   git add .
   git commit -m "chore: update PostgreSQL to 17.6"
   ```

### Creating a Release

1. Ensure all changes are committed
2. Run the release preparation:
   ```bash
   pnpm release:prepare  # for patch
   # or
   pnpm release:prepare:minor  # for minor
   # or
   pnpm release:prepare:major  # for major
   ```
3. Push the changes and tags:
   ```bash
   git push origin main --tags
   ```
4. Publish to npm:
   ```bash
   pnpm release:publish
   ```

The PostgreSQL version suffix will be automatically preserved throughout the release process.
## Cross-Platform Compatibility

### Available Scripts

| Script | Platform | Purpose | Usage |
|--------|----------|---------|-------|
| `extract-pg-version.js` | All | Extract PostgreSQL version (Node.js) | `node scripts/extract-pg-version.js` |
| `extract-pg-version.ps1` | Windows | Extract PostgreSQL version (PowerShell) | `powershell -File scripts/extract-pg-version.ps1` |
| `extract-pg-version.cmd` | Windows | Extract PostgreSQL version (Batch) | `scripts\extract-pg-version.cmd` |
| `update-pg-version.js` | All | Update PostgreSQL version | `node scripts/update-pg-version.js 17.6` |

### Platform-Specific Usage

**Linux/macOS (Bash):**
```bash
# Direct script execution
node scripts/extract-pg-version.js

# Using npm scripts (recommended)
pnpm pg:version
pnpm pg:update 17.6
```

**Windows (PowerShell):**
```powershell
# Using PowerShell script
powershell -ExecutionPolicy Bypass -File scripts/extract-pg-version.ps1

# Using npm scripts (recommended)
pnpm pg:version:win
pnpm pg:update 17.6

# Or use the Node.js version (works on all platforms)
pnpm pg:version
```

**Windows (Command Prompt):**
```cmd
# Using batch script
scripts\extract-pg-version.cmd

# Using npm scripts (recommended)
pnpm pg:version
pnpm pg:update 17.6
```

### CI/CD Integration

The CI workflow uses bash shell explicitly to ensure cross-platform compatibility:

```yaml
- name: Extract PostgreSQL version
  id: pg-version
  shell: bash  # Ensures bash is used on all platforms
  run: |
    PG_VERSION=$(node scripts/extract-pg-version.js)
    echo "POSTGRESQL_VERSION=$PG_VERSION" >> $GITHUB_ENV
    echo "postgresql_version=$PG_VERSION" >> $GITHUB_OUTPUT
    echo "PostgreSQL version: $PG_VERSION"
```

This approach ensures that:
- The same script works on Linux, macOS, and Windows runners
- No platform-specific shell syntax issues
- Consistent behavior across all CI environments