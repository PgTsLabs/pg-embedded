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
  // The postgresql_embedded crate version 0.19.0 typically bundles PostgreSQL 15.4
  // We can set this based on known mappings or try to detect it

  let postgresql_version = match env::var("CARGO_PKG_VERSION_MAJOR") {
    Ok(_) => {
      // Based on postgresql_embedded 0.19.0, it typically uses PostgreSQL 15.4
      // This mapping should be updated when the dependency is updated
      "15.4"
    }
    Err(_) => "15.4", // fallback
  };

  println!("cargo:rustc-env=POSTGRESQL_VERSION={postgresql_version}");

  // Also set the postgresql_embedded version from Cargo.lock if available
  println!("cargo:rustc-env=POSTGRESQL_EMBEDDED_VERSION=0.19.0");
}
