use std::path::Path;
use crate::error::configuration_error;

/// 验证目录路径是否有效
pub fn validate_directory_path(path: &str) -> napi::Result<()> {
    if path.is_empty() {
        return Err(configuration_error("Directory path cannot be empty"));
    }

    let path_obj = Path::new(path);
    
    // 检查路径是否为绝对路径或相对路径
    if path_obj.is_absolute() {
        // 对于绝对路径，检查父目录是否存在
        if let Some(parent) = path_obj.parent() {
            if !parent.exists() {
                return Err(configuration_error(&format!(
                    "Parent directory does not exist: {}",
                    parent.display()
                )));
            }
        }
    }

    Ok(())
}

/// 验证端口号是否可用
pub fn validate_port(port: u16) -> napi::Result<()> {
    if port == 0 || port > 65535 {
        return Err(configuration_error("Port must be between 1 and 65535"));
    }

    // 检查端口是否被占用
    match std::net::TcpListener::bind(("127.0.0.1", port)) {
        Ok(_) => Ok(()),
        Err(_) => Err(configuration_error(&format!("Port {} is already in use", port))),
    }
}

/// 生成临时目录路径
pub fn generate_temp_dir() -> napi::Result<String> {
    let temp_dir = std::env::temp_dir();
    let unique_id = uuid::Uuid::new_v4().to_string();
    let postgres_temp_dir = temp_dir.join(format!("postgresql_embedded_{}", unique_id));
    
    Ok(postgres_temp_dir.to_string_lossy().to_string())
}

/// 清理目录
pub fn cleanup_directory(path: &str) -> napi::Result<()> {
    let path_obj = Path::new(path);
    if path_obj.exists() {
        std::fs::remove_dir_all(path_obj)
            .map_err(|e| configuration_error(&format!("Failed to cleanup directory {}: {}", path, e)))?;
    }
    Ok(())
}

/// 创建目录
pub fn create_directory(path: &str) -> napi::Result<()> {
    let path_obj = Path::new(path);
    if !path_obj.exists() {
        std::fs::create_dir_all(path_obj)
            .map_err(|e| configuration_error(&format!("Failed to create directory {}: {}", path, e)))?;
    }
    Ok(())
}