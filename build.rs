extern crate napi_build;

use std::env;
use std::process::Command;

fn main() {
  napi_build::setup();

  // Set build-time environment variables
  set_build_env_vars();
}

fn set_build_env_vars() {
  // Set target triple
  if let Ok(target) = env::var("TARGET") {
    println!("cargo:rustc-env=TARGET={target}");
  }

  // Set build timestamp
  let timestamp = chrono::Utc::now()
    .format("%Y-%m-%d %H:%M:%S UTC")
    .to_string();
  println!("cargo:rustc-env=BUILD_TIMESTAMP={timestamp}");

  // Set rustc version
  if let Ok(output) = Command::new("rustc").arg("--version").output() {
    if let Ok(version) = String::from_utf8(output.stdout) {
      let version = version.trim();
      println!("cargo:rustc-env=RUSTC_VERSION={version}");
    }
  }

  // Try to determine PostgreSQL version from postgresql_embedded
  // This is a best-effort attempt to get the actual PostgreSQL version
  set_postgresql_version();
}

fn set_postgresql_version() {
  // Try to get PostgreSQL version from environment variable (set by CI)
  let postgresql_version = if let Ok(version) = env::var("POSTGRESQL_VERSION") {
    version
  } else {
    // Try to extract from package version (format: x.y.z+pgA.B.C)
    if let Ok(pkg_version) = env::var("CARGO_PKG_VERSION") {
      if let Some(pg_part) = pkg_version.split("+pg").nth(1) {
        pg_part.to_string()
      } else {
        // Fallback: based on postgresql_embedded 0.19.0, it typically uses PostgreSQL 17.x
        "17.5".to_string()
      }
    } else {
      "17.5".to_string() // Updated fallback to match current version
    }
  };

  println!("cargo:rustc-env=POSTGRESQL_VERSION={postgresql_version}");

  // Also set the postgresql_embedded version from Cargo.lock if available
  println!("cargo:rustc-env=POSTGRESQL_EMBEDDED_VERSION=0.19.0");
}
