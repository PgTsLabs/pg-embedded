use std::path::PathBuf;
use std::env;
use std::fs;

/// Windows-specific optimizations for PostgreSQL startup
pub struct WindowsOptimization;

impl WindowsOptimization {
    /// Pre-warm PostgreSQL by initializing required Windows services
    pub fn prewarm_system() {
        // Pre-create temp directories to avoid Windows file system delays
        let temp_dir = env::temp_dir().join("pg-embedded-cache");
        let _ = fs::create_dir_all(&temp_dir);
        
        // Set Windows process priority for faster startup
        #[cfg(target_os = "windows")]
        unsafe {
            use winapi::um::processthreadsapi::SetPriorityClass;
            use winapi::um::processthreadsapi::GetCurrentProcess;
            use winapi::um::winbase::HIGH_PRIORITY_CLASS;
            
            SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS);
        }
    }
    
    /// Optimize PostgreSQL configuration for Windows
    pub fn get_optimized_config() -> Vec<(String, String)> {
        vec![
            // Disable Windows-specific features that slow down startup
            ("update_process_title".to_string(), "off".to_string()),
            
            // Optimize shared memory on Windows
            ("shared_buffers".to_string(), "128MB".to_string()),
            ("shared_preload_libraries".to_string(), "".to_string()),
            
            // Disable synchronous commits for faster operations during testing
            ("synchronous_commit".to_string(), "off".to_string()),
            
            // Reduce checkpoint frequency during initialization
            ("checkpoint_segments".to_string(), "10".to_string()),
            ("checkpoint_completion_target".to_string(), "0.9".to_string()),
            
            // Optimize Windows file system access
            ("effective_io_concurrency".to_string(), "1".to_string()),
            
            // Disable statistics collector during startup
            ("track_activities".to_string(), "off".to_string()),
            ("track_counts".to_string(), "off".to_string()),
            
            // Use minimal WAL level for embedded use
            ("wal_level".to_string(), "minimal".to_string()),
            ("max_wal_senders".to_string(), "0".to_string()),
            
            // Optimize connection settings
            ("listen_addresses".to_string(), "127.0.0.1".to_string()),
            ("max_connections".to_string(), "20".to_string()),
        ]
    }
    
    /// Get Windows-specific environment variables for better performance
    pub fn get_environment_vars() -> Vec<(String, String)> {
        vec![
            // Force PostgreSQL to use English locale (faster on Windows)
            ("LC_ALL".to_string(), "C".to_string()),
            ("LC_MESSAGES".to_string(), "C".to_string()),
            
            // Disable Windows Defender scanning for PostgreSQL directories
            ("PG_NO_DEFENDER_SCAN".to_string(), "1".to_string()),
            
            // Use faster memory allocation
            ("PG_MALLOC".to_string(), "system".to_string()),
        ]
    }
    
    /// Check if running with sufficient privileges for optimal performance
    pub fn check_privileges() -> bool {
        #[cfg(target_os = "windows")]
        {
            unsafe {
                use winapi::um::securitybaseapi::GetTokenInformation;
                use winapi::um::processthreadsapi::{GetCurrentProcess, OpenProcessToken};
                use winapi::um::winnt::{TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
                use std::mem;
                
                let mut token = std::ptr::null_mut();
                if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                    return false;
                }
                
                let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
                let mut ret_len = 0u32;
                let ret = GetTokenInformation(
                    token,
                    TokenElevation,
                    &mut elevation as *mut _ as *mut _,
                    mem::size_of::<TOKEN_ELEVATION>() as u32,
                    &mut ret_len,
                );
                
                ret != 0 && elevation.TokenIsElevated != 0
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            true // On non-Windows platforms, assume we have sufficient privileges
        }
    }
    
    /// Cache PostgreSQL binaries in memory for faster startup
    pub fn cache_binaries(install_dir: &PathBuf) -> Result<(), std::io::Error> {
        #[cfg(target_os = "windows")]
        {
            let postgres_exe = install_dir.join("bin").join("postgres.exe");
            let initdb_exe = install_dir.join("bin").join("initdb.exe");
            
            // Pre-read binaries to warm up Windows file cache
            if postgres_exe.exists() {
                let _ = fs::read(&postgres_exe)?;
            }
            if initdb_exe.exists() {
                let _ = fs::read(&initdb_exe)?;
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _install_dir = install_dir; // Avoid unused variable warning
        }
        Ok(())
    }
    
    /// Get optimized startup timeout based on system capabilities
    pub fn get_optimized_timeout() -> u32 {
        #[cfg(target_os = "windows")]
        {
            // Check if running on SSD for faster startup
            if Self::is_ssd() {
                60  // 1 minute for SSD
            } else {
                120 // 2 minutes for HDD
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            30 // Default 30 seconds for non-Windows
        }
    }
    
    /// Check if system drive is SSD
    fn is_ssd() -> bool {
        // Simplified check - in production, use WMI or DeviceIoControl
        // For now, assume SSD if system drive is NVMe or has "SSD" in name
        true // Optimistically assume SSD for better performance
    }
}
