# Contributing to pg-embedded

Thank you for your interest in contributing to pg-embedded! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Documentation](#documentation)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and constructive in all interactions.

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 16 or higher)
- **Rust** (latest stable version)
- **pnpm** (recommended package manager)
- **Git**

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/pg-embedded.git
   cd pg-embedded
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/original-owner/pg-embedded.git
   ```

## Development Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build the project:
   ```bash
   pnpm run build
   ```

3. Run tests to ensure everything is working:
   ```bash
   pnpm test
   ```

### Project Structure

```
pg-embedded/
├── src/                    # Rust source code
│   ├── lib.rs             # Main library entry point
│   ├── postgres.rs        # PostgreSQL instance management
│   ├── settings.rs        # Configuration structures
│   ├── error.rs           # Error handling
│   └── types.rs           # Type definitions
├── test/                  # Test files
├── examples/              # Usage examples
├── docs/                  # Additional documentation
├── Cargo.toml            # Rust dependencies
├── package.json          # Node.js package configuration
└── README.md             # Main documentation
```

## Making Changes

### Branching Strategy

1. Create a new branch for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. Make your changes in logical, atomic commits
3. Write clear commit messages following conventional commits format:
   ```
   type(scope): description
   
   feat(postgres): add connection pooling support
   fix(settings): validate port range correctly
   docs(readme): update installation instructions
   test(integration): add database creation tests
   ```

### Types of Changes

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring without functional changes
- `perf`: Performance improvements
- `chore`: Maintenance tasks

## Testing

We maintain high test coverage and require all changes to include appropriate tests.

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test files
pnpm test -- test/basic.test.ts

# Run tests with coverage
pnpm run test:coverage

# Run performance benchmarks
pnpm run test:performance
```

### Test Categories

1. **Unit Tests**: Test individual functions and methods
2. **Integration Tests**: Test component interactions
3. **Performance Tests**: Benchmark critical operations
4. **Stability Tests**: Long-running reliability tests

### Writing Tests

- Use descriptive test names that explain what is being tested
- Follow the Arrange-Act-Assert pattern
- Include both positive and negative test cases
- Test error conditions and edge cases
- Use appropriate test data and cleanup resources

Example test structure:
```typescript
import test from 'ava';
import { PostgresInstance } from '../index.js';

test('should create database successfully', async (t) => {
  // Arrange
  const instance = new PostgresInstance({ port: 5432 });
  await instance.start();
  
  try {
    // Act
    await instance.createDatabase('test_db');
    
    // Assert
    const exists = await instance.databaseExists('test_db');
    t.is(exists, true);
  } finally {
    // Cleanup
    await instance.stop();
    instance.cleanup();
  }
});
```

## Submitting Changes

### Pull Request Process

1. Ensure your branch is up to date with the main branch:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Push your changes to your fork:
   ```bash
   git push origin your-branch-name
   ```

3. Create a pull request on GitHub with:
   - Clear title describing the change
   - Detailed description of what was changed and why
   - Reference to any related issues
   - Screenshots or examples if applicable

### Pull Request Template

```markdown
## Description
Brief description of the changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated if needed
- [ ] No breaking changes (or clearly documented)
```

### Review Process

1. All pull requests require at least one review from a maintainer
2. Automated tests must pass
3. Code coverage should not decrease significantly
4. Documentation must be updated for user-facing changes

## Code Style

### Rust Code Style

- Follow standard Rust formatting (`cargo fmt`)
- Use `cargo clippy` to catch common issues
- Write comprehensive documentation comments for public APIs
- Use meaningful variable and function names
- Handle errors appropriately (don't use `unwrap()` in library code)

Example:
```rust
/// Creates a new database with the specified name
/// 
/// # Arguments
/// * `name` - The name of the database to create
/// 
/// # Returns
/// * `Ok(())` if the database was created successfully
/// * `Err(napi::Error)` if creation failed
/// 
/// # Example
/// ```rust
/// instance.create_database("my_database".to_string())?;
/// ```
#[napi]
pub async unsafe fn create_database(&mut self, name: String) -> napi::Result<()> {
    // Implementation
}
```

### TypeScript/JavaScript Code Style

- Use TypeScript for type safety
- Follow ESLint configuration
- Use meaningful variable names
- Write JSDoc comments for public APIs
- Handle promises and errors appropriately

### Documentation Style

- Use clear, concise language
- Include code examples for complex concepts
- Keep examples up to date with API changes
- Use proper markdown formatting
- Include table of contents for long documents

## Documentation

### Types of Documentation

1. **API Documentation**: Generated from JSDoc comments in Rust code
2. **User Guide**: README.md and additional guides
3. **Examples**: Working code examples in the `examples/` directory
4. **Contributing Guide**: This document

### Documentation Standards

- All public APIs must have documentation
- Examples should be tested and working
- Documentation should be updated with API changes
- Use consistent terminology throughout

### Building Documentation

```bash
# Generate API documentation
pnpm run docs:api

# Build all documentation
pnpm run docs:build

# Serve documentation locally
pnpm run docs:serve
```

## Release Process

### Version Management

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. Update version in `package.json` and `Cargo.toml`
2. Update `CHANGELOG.md` with release notes
3. Create release commit and tag
4. Push to main branch
5. Create GitHub release
6. Publish to npm registry

### Changelog Format

```markdown
## [1.2.0] - 2024-01-15

### Added
- New connection pooling feature
- Support for PostgreSQL 16

### Changed
- Improved startup performance by 20%
- Updated default timeout to 30 seconds

### Fixed
- Fixed memory leak in connection caching
- Resolved issue with database name validation

### Deprecated
- Old configuration format (will be removed in v2.0)
```

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and community discussion
- **Pull Request Comments**: Code-specific discussions

### Reporting Issues

When reporting bugs, please include:

1. **Environment Information**:
   - Operating system and version
   - Node.js version
   - pg-embedded version
   - PostgreSQL version (if relevant)

2. **Steps to Reproduce**:
   - Minimal code example
   - Expected behavior
   - Actual behavior
   - Error messages or logs

3. **Additional Context**:
   - Screenshots if applicable
   - Related issues or pull requests
   - Possible solutions you've tried

### Feature Requests

For feature requests, please provide:

1. **Use Case**: Describe the problem you're trying to solve
2. **Proposed Solution**: Your idea for how it should work
3. **Alternatives**: Other solutions you've considered
4. **Impact**: Who would benefit from this feature

## Recognition

Contributors will be recognized in:

- `CONTRIBUTORS.md` file
- Release notes for significant contributions
- GitHub contributor statistics

Thank you for contributing to pg-embedded! Your efforts help make this project better for everyone.