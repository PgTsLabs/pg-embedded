use napi_derive::napi;
use std::sync::Once;

static INIT: Once = Once::new();

/// 日志级别枚举
#[napi]
#[derive(Clone, Copy)]
pub enum LogLevel {
    /// 错误级别
    Error,
    /// 警告级别
    Warn,
    /// 信息级别
    Info,
    /// 调试级别
    Debug,
    /// 跟踪级别
    Trace,
}

/// 简单的日志记录器实现
struct SimpleLogger {
    level: log::Level,
}

impl log::Log for SimpleLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= self.level
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            eprintln!("[{}] {}", record.level(), record.args());
        }
    }

    fn flush(&self) {}
}

impl From<LogLevel> for log::Level {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Error => log::Level::Error,
            LogLevel::Warn => log::Level::Warn,
            LogLevel::Info => log::Level::Info,
            LogLevel::Debug => log::Level::Debug,
            LogLevel::Trace => log::Level::Trace,
        }
    }
}

/// 初始化日志记录器
#[napi]
pub fn init_logger(level: Option<LogLevel>) -> napi::Result<()> {
    INIT.call_once(|| {
        let log_level = level.unwrap_or(LogLevel::Info);
        let level_filter = log::Level::from(log_level).to_level_filter();
        let logger = SimpleLogger { level: log::Level::from(log_level) };
        log::set_boxed_logger(Box::new(logger))
            .map(|()| log::set_max_level(level_filter))
            .unwrap_or_else(|_| {});
    });
    Ok(())
}

/// 记录错误日志
#[napi]
pub fn log_error(message: String) {
    log::error!("{}", message);
}

/// 记录警告日志
#[napi]
pub fn log_warn(message: String) {
    log::warn!("{}", message);
}

/// 记录信息日志
#[napi]
pub fn log_info(message: String) {
    log::info!("{}", message);
}

/// 记录调试日志
#[napi]
pub fn log_debug(message: String) {
    log::debug!("{}", message);
}

/// 记录跟踪日志
#[napi]
pub fn log_trace(message: String) {
    log::trace!("{}", message);
}

/// 内部日志记录宏
macro_rules! pg_log {
    (error, $($arg:tt)*) => {
        log::error!("[pg-embedded] {}", format!($($arg)*));
    };
    (warn, $($arg:tt)*) => {
        log::warn!("[pg-embedded] {}", format!($($arg)*));
    };
    (info, $($arg:tt)*) => {
        log::info!("[pg-embedded] {}", format!($($arg)*));
    };
    (debug, $($arg:tt)*) => {
        log::debug!("[pg-embedded] {}", format!($($arg)*));
    };
    (trace, $($arg:tt)*) => {
        log::trace!("[pg-embedded] {}", format!($($arg)*));
    };
}

pub(crate) use pg_log;