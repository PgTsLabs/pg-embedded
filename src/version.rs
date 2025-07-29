use napi_derive::napi;

/// Version information for the pg-embedded package and embedded PostgreSQL
#[napi(object)]
pub struct VersionInfo {
    /// The version of the pg-embedded npm package
    pub package_version: String,
    /// The version of the embedded PostgreSQL binary
    pub postgresql_version: String,
    /// The version of the postgresql_embedded Rust crate
    pub postgresql_embedded_version: String,
    /// Build information
    pub build_info: BuildInfo,
}

/// Build information
#[napi(object)]
pub struct BuildInfo {
    /// Target platform (e.g., "x86_64-apple-darwin")
    pub target: String,
    /// Build profile (debug or release)
    pub profile: String,
    /// Rust compiler version used for build
    pub rustc_version: String,
    /// Build timestamp
    pub build_timestamp: String,
}

/**
 * Gets comprehensive version information about pg-embedded and PostgreSQL
 * 
 * This function returns detailed version information including:
 * - pg-embedded package version
 * - Embedded PostgreSQL version
 * - Build information
 * 
 * @returns Version information object
 * 
 * @example
 * ```typescript
 * import { getVersionInfo } from 'pg-embedded';
 * 
 * const versionInfo = getVersionInfo();
 * console.log(`Package version: ${versionInfo.packageVersion}`);
 * console.log(`PostgreSQL version: ${versionInfo.postgresqlVersion}`);
 * console.log(`Built for: ${versionInfo.buildInfo.target}`);
 * ```
 */
#[napi]
pub fn get_version_info() -> VersionInfo {
    VersionInfo {
        package_version: env!("CARGO_PKG_VERSION").to_string(),
        postgresql_version: get_postgresql_version(),
        postgresql_embedded_version: get_postgresql_embedded_version(),
        build_info: BuildInfo {
            target: env!("TARGET").to_string(),
            profile: if cfg!(debug_assertions) { "debug".to_string() } else { "release".to_string() },
            rustc_version: env!("RUSTC_VERSION").to_string(),
            build_timestamp: env!("BUILD_TIMESTAMP").to_string(),
        },
    }
}

/**
 * Gets the version of the embedded PostgreSQL binary
 * 
 * @returns PostgreSQL version string (e.g., "15.4")
 * 
 * @example
 * ```typescript
 * import { getPostgreSQLVersion } from 'pg-embedded';
 * 
 * const pgVersion = getPostgreSQLVersion();
 * console.log(`Using PostgreSQL ${pgVersion}`);
 * ```
 */
#[napi]
pub fn get_postgre_sql_version() -> String {
    get_postgresql_version()
}

/**
 * Gets the package version of pg-embedded
 * 
 * @returns Package version string (e.g., "1.0.0")
 * 
 * @example
 * ```typescript
 * import { getPackageVersion } from 'pg-embedded';
 * 
 * const version = getPackageVersion();
 * console.log(`pg-embedded version: ${version}`);
 * ```
 */
#[napi]
pub fn get_package_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Internal function to get PostgreSQL version
fn get_postgresql_version() -> String {
    // Get the PostgreSQL version set at build time
    env!("POSTGRESQL_VERSION").to_string()
}

/// Internal function to get postgresql_embedded crate version
fn get_postgresql_embedded_version() -> String {
    // Get the postgresql_embedded version set at build time
    env!("POSTGRESQL_EMBEDDED_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_version_info() {
        let version_info = get_version_info();
        
        assert!(!version_info.package_version.is_empty());
        assert!(!version_info.postgresql_version.is_empty());
        assert!(!version_info.postgresql_embedded_version.is_empty());
        assert!(!version_info.build_info.target.is_empty());
        assert!(!version_info.build_info.profile.is_empty());
    }

    #[test]
    fn test_get_postgresql_version() {
        let version = get_postgre_sql_version();
        assert!(!version.is_empty());
        // Should be in format like "15.4"
        assert!(version.contains('.'));
    }

    #[test]
    fn test_get_package_version() {
        let version = get_package_version();
        assert!(!version.is_empty());
        // Should be in semver format
        assert!(version.contains('.'));
    }
}