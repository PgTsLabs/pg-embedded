# Release Checklist

This checklist ensures that all necessary steps are completed before releasing a new version of pg-embedded.

## Pre-Release Preparation

### Code Quality

- [ ] All tests pass locally (`pnpm test:basic`)
- [ ] Code is properly formatted (`pnpm format`)
- [ ] Linting passes (`pnpm lint`)
- [ ] No TypeScript errors
- [ ] All examples work correctly (`pnpm examples`)

### Documentation

- [ ] README.md is up to date
- [ ] API.md reflects current API
- [ ] CHANGELOG.md includes all changes
- [ ] Examples are tested and working
- [ ] JSDoc comments are complete

### Version Management

- [ ] Version number follows semantic versioning
- [ ] Version is consistent across package.json and Cargo.toml
- [ ] CHANGELOG.md includes the new version
- [ ] Breaking changes are documented

### Build and Artifacts

- [ ] Project builds successfully (`pnpm build`)
- [ ] All required artifacts are generated
- [ ] TypeScript definitions are correct
- [ ] Native binaries are built for target platforms

## Release Process

### Automated Release (Recommended)

1. **Prepare Release**

   ```bash
   # For patch release (bug fixes)
   pnpm release:prepare

   # For minor release (new features)
   pnpm release:prepare:minor

   # For major release (breaking changes)
   pnpm release:prepare:major
   ```

2. **Review Changes**
   - [ ] Review the generated commit
   - [ ] Check the git tag was created
   - [ ] Verify release notes are accurate

3. **Publish Release**

   ```bash
   # Dry run first
   pnpm release:publish:dry

   # Actual publish
   pnpm release:publish
   ```

### Manual Release Process

1. **Pre-flight Checks**

   ```bash
   pnpm validate
   pnpm build:check
   ```

2. **Update Version**
   - [ ] Update version in package.json
   - [ ] Update version in Cargo.toml
   - [ ] Update CHANGELOG.md

3. **Build and Test**

   ```bash
   pnpm clean
   pnpm install
   pnpm build
   pnpm test:basic
   ```

4. **Create Release Commit and Tag**

   ```bash
   git add .
   git commit -m "chore: release v1.0.0"
   git tag -a v1.0.0 -m "Release v1.0.0"
   ```

5. **Push to Repository**

   ```bash
   git push origin main --tags
   ```

6. **Publish to npm**

   ```bash
   npm publish --access public
   ```

7. **Create GitHub Release**
   - [ ] Go to GitHub releases page
   - [ ] Create new release from tag
   - [ ] Add release notes from CHANGELOG.md
   - [ ] Publish release

## Post-Release Tasks

### Immediate

- [ ] Verify package is available on npm
- [ ] Test installation: `npm install pg-embedded`
- [ ] Check GitHub release is created
- [ ] Monitor for any immediate issues

### Communication

- [ ] Announce release on relevant channels
- [ ] Update any dependent projects
- [ ] Respond to community feedback

### Monitoring

- [ ] Monitor npm download statistics
- [ ] Watch for bug reports or issues
- [ ] Check CI/CD pipeline status

## Rollback Procedure

If issues are discovered after release:

1. **For Critical Issues**

   ```bash
   npm unpublish pg-embedded@1.0.0 --force
   ```

   (Only within 72 hours and if no dependents)

2. **For Non-Critical Issues**
   - Prepare hotfix release
   - Follow normal release process with patch version

3. **Communication**
   - [ ] Notify users of the issue
   - [ ] Provide workarounds if available
   - [ ] Announce fix timeline

## Release Types

### Patch Release (1.0.0 → 1.0.1)

- Bug fixes
- Documentation updates
- Performance improvements (non-breaking)
- Security patches

### Minor Release (1.0.0 → 1.1.0)

- New features (backward compatible)
- New API methods
- Deprecations (with backward compatibility)
- Significant performance improvements

### Major Release (1.0.0 → 2.0.0)

- Breaking changes
- Removed deprecated features
- API changes that break backward compatibility
- Major architectural changes

## Automation Scripts

### Available Scripts

- `pnpm validate` - Validate release readiness
- `pnpm build:check` - Check build artifacts
- `pnpm release:prepare` - Prepare patch release
- `pnpm release:prepare:minor` - Prepare minor release
- `pnpm release:prepare:major` - Prepare major release
- `pnpm release:publish` - Publish prepared release
- `pnpm release:publish:dry` - Dry run publish

### Script Locations

- `scripts/validate-release.js` - Release validation
- `scripts/build-check.js` - Build verification
- `scripts/prepare-release.js` - Release preparation
- `scripts/publish-release.js` - Release publishing

## Troubleshooting

### Common Issues

1. **npm publish fails with authentication error**
   - Run `npm login` to authenticate
   - Verify you have publish permissions

2. **Git tag already exists**
   - Delete existing tag: `git tag -d v1.0.0`
   - Delete remote tag: `git push origin :refs/tags/v1.0.0`

3. **Build fails on CI**
   - Check all platforms build successfully
   - Verify dependencies are correctly specified

4. **Tests fail during release**
   - Fix failing tests before proceeding
   - Consider if tests need environment-specific adjustments

### Getting Help

- Check existing GitHub issues
- Review CI/CD logs
- Consult team members
- Review previous successful releases

## Security Considerations

- [ ] No sensitive information in published package
- [ ] Dependencies are up to date and secure
- [ ] npm audit passes
- [ ] Provenance is enabled for npm publish
