use crate::types::InstanceState;
use std::time::Duration;

/// Simplified state manager following KISS principle
///
/// This manager consolidates all state-related operations into a single,
/// easy-to-understand structure, eliminating the need for multiple Arc<Mutex<>>
/// wrappers and reducing lock contention.
///
/// Benefits:
/// - KISS: Single state structure instead of 3 separate Arc<Mutex<>> fields
/// - Performance: Reduced lock contention and simpler synchronization
/// - Testability: State logic is isolated and easy to test
/// - Thread-safety: All state mutations are controlled through this manager
#[derive(Debug, Clone)]
pub struct InstanceStateManager {
  /// Current state of the PostgreSQL instance
  state: InstanceState,
  /// Startup time recording (if instance has been started)
  startup_time: Option<Duration>,
}

impl Default for InstanceStateManager {
  fn default() -> Self {
    Self::new()
  }
}

impl InstanceStateManager {
  /// Creates a new state manager with initial Stopped state
  pub fn new() -> Self {
    Self {
      state: InstanceState::Stopped,
      startup_time: None,
    }
  }

  /// Gets the current instance state
  ///
  /// This is a simple getter with no locking overhead
  pub fn get_state(&self) -> InstanceState {
    self.state
  }

  /// Sets the instance state with automatic logging
  ///
  /// # Arguments
  /// * `new_state` - The new state to transition to
  ///
  /// # Cross-platform notes
  /// - State transitions are logged consistently across all platforms
  /// - No platform-specific behavior
  pub fn set_state(&mut self, new_state: InstanceState) {
    log::debug!("State transition: {:?} -> {:?}", self.state, new_state);
    self.state = new_state;
  }

  /// Records the startup time after successful instance start
  ///
  /// # Arguments
  /// * `duration` - The time taken to start the instance
  pub fn record_startup(&mut self, duration: Duration) {
    self.startup_time = Some(duration);
    log::info!("Startup time recorded: {:?}", duration);
  }

  /// Gets the startup time in seconds
  ///
  /// # Returns
  /// - Some(f64) if the instance has been started at least once
  /// - None if the instance has never been started
  pub fn get_startup_time(&self) -> Option<f64> {
    self.startup_time.map(|d| d.as_secs_f64())
  }

  /// Clears the startup time (useful for cleanup)
  pub fn clear_startup_time(&mut self) {
    self.startup_time = None;
  }

  /// Checks if the instance is in a running state
  pub fn is_running(&self) -> bool {
    matches!(self.state, InstanceState::Running)
  }

  /// Checks if the instance is in a stopped state
  pub fn is_stopped(&self) -> bool {
    matches!(self.state, InstanceState::Stopped)
  }

  /// Checks if the instance is in a transitional state (Starting or Stopping)
  pub fn is_transitioning(&self) -> bool {
    matches!(
      self.state,
      InstanceState::Starting | InstanceState::Stopping
    )
  }

  /// Validates state transition is allowed
  ///
  /// This helps prevent invalid state transitions and provides better error messages
  ///
  /// # Arguments
  /// * `target_state` - The state we want to transition to
  ///
  /// # Returns
  /// - Ok(()) if transition is valid
  /// - Err(String) with error message if transition is invalid
  pub fn validate_transition(&self, target_state: InstanceState) -> Result<(), String> {
    // Same state transitions (idempotent) - check first
    if self.state == target_state {
      return Ok(());
    }

    match (self.state, target_state) {
      // Valid transitions
      (InstanceState::Stopped, InstanceState::Starting) => Ok(()),
      (InstanceState::Starting, InstanceState::Running) => Ok(()),
      (InstanceState::Starting, InstanceState::Stopped) => Ok(()), // Failed start
      (InstanceState::Running, InstanceState::Stopping) => Ok(()),
      (InstanceState::Stopping, InstanceState::Stopped) => Ok(()),
      (InstanceState::Stopping, InstanceState::Running) => Ok(()), // Failed stop

      // Invalid transitions
      (InstanceState::Stopped, InstanceState::Running) => {
        Err("Cannot transition directly from Stopped to Running".to_string())
      }
      (InstanceState::Stopped, InstanceState::Stopping) => {
        Err("Cannot stop an already stopped instance".to_string())
      }
      (InstanceState::Running, InstanceState::Starting) => {
        Err("Cannot start an already running instance".to_string())
      }
      (InstanceState::Starting, InstanceState::Stopping) => {
        Err("Cannot stop while starting".to_string())
      }
      (InstanceState::Stopping, InstanceState::Starting) => {
        Err("Cannot start while stopping".to_string())
      }

      // Catch-all for any other combinations (should not happen)
      _ => Err(format!(
        "Invalid state transition from {:?} to {:?}",
        self.state, target_state
      )),
    }
  }

  /// Resets the state manager to initial state
  ///
  /// Useful for cleanup and testing
  pub fn reset(&mut self) {
    self.state = InstanceState::Stopped;
    self.startup_time = None;
    log::debug!("State manager reset to initial state");
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_initial_state() {
    let manager = InstanceStateManager::new();
    assert_eq!(manager.get_state(), InstanceState::Stopped);
    assert!(manager.get_startup_time().is_none());
  }

  #[test]
  fn test_state_transition() {
    let mut manager = InstanceStateManager::new();
    manager.set_state(InstanceState::Starting);
    assert_eq!(manager.get_state(), InstanceState::Starting);
  }

  #[test]
  fn test_startup_time_recording() {
    let mut manager = InstanceStateManager::new();
    let duration = Duration::from_secs(2);
    manager.record_startup(duration);
    assert_eq!(manager.get_startup_time(), Some(2.0));
  }

  #[test]
  fn test_is_running() {
    let mut manager = InstanceStateManager::new();
    assert!(!manager.is_running());

    manager.set_state(InstanceState::Running);
    assert!(manager.is_running());
  }

  #[test]
  fn test_is_stopped() {
    let mut manager = InstanceStateManager::new();
    assert!(manager.is_stopped());

    manager.set_state(InstanceState::Running);
    assert!(!manager.is_stopped());
  }

  #[test]
  fn test_is_transitioning() {
    let mut manager = InstanceStateManager::new();
    assert!(!manager.is_transitioning());

    manager.set_state(InstanceState::Starting);
    assert!(manager.is_transitioning());

    manager.set_state(InstanceState::Stopping);
    assert!(manager.is_transitioning());

    manager.set_state(InstanceState::Running);
    assert!(!manager.is_transitioning());
  }

  #[test]
  fn test_valid_transitions() {
    let mut manager = InstanceStateManager::new();

    // Stopped -> Starting
    assert!(manager
      .validate_transition(InstanceState::Starting)
      .is_ok());
    manager.set_state(InstanceState::Starting);

    // Starting -> Running
    assert!(manager
      .validate_transition(InstanceState::Running)
      .is_ok());
    manager.set_state(InstanceState::Running);

    // Running -> Stopping
    assert!(manager
      .validate_transition(InstanceState::Stopping)
      .is_ok());
    manager.set_state(InstanceState::Stopping);

    // Stopping -> Stopped
    assert!(manager
      .validate_transition(InstanceState::Stopped)
      .is_ok());
  }

  #[test]
  fn test_invalid_transitions() {
    let mut manager = InstanceStateManager::new();

    // Stopped -> Running (invalid)
    assert!(manager
      .validate_transition(InstanceState::Running)
      .is_err());

    // Stopped -> Stopping (invalid)
    assert!(manager
      .validate_transition(InstanceState::Stopping)
      .is_err());
  }

  #[test]
  fn test_reset() {
    let mut manager = InstanceStateManager::new();
    manager.set_state(InstanceState::Running);
    manager.record_startup(Duration::from_secs(2));

    manager.reset();

    assert_eq!(manager.get_state(), InstanceState::Stopped);
    assert!(manager.get_startup_time().is_none());
  }

  #[test]
  fn test_clear_startup_time() {
    let mut manager = InstanceStateManager::new();
    manager.record_startup(Duration::from_secs(2));
    assert!(manager.get_startup_time().is_some());

    manager.clear_startup_time();
    assert!(manager.get_startup_time().is_none());
  }
}
