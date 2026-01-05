pub mod aria2;
pub mod commands;
pub mod db;
pub mod error;
pub mod state;
pub mod tray;

pub use error::{Error, Result};
pub use state::AppState;
