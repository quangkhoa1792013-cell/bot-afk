use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateSnapshot {
    pub connected: bool,
    pub username: String,
    pub version: String,
    pub mock: bool,
    pub position: Option<Position>,
    pub health: u8,
    pub food: u8,
    pub saturation: i32,
    pub target: Option<Position>,
    pub moving: bool,
    pub eating: bool,
    pub viewer_port: Option<u16>,
    pub viewer_url: Option<String>,
    pub server_host: String,
    pub server_port: u16,
    pub uptime_sec: u64,
    pub deaths: u32,
    pub last_error: Option<String>,
}

impl Default for StateSnapshot {
    fn default() -> Self {
        Self {
            connected: false,
            username: String::new(),
            version: String::new(),
            mock: false,
            position: None,
            health: 0,
            food: 0,
            saturation: 0,
            target: None,
            moving: false,
            eating: false,
            viewer_port: None,
            viewer_url: None,
            server_host: String::new(),
            server_port: 0,
            uptime_sec: 0,
            deaths: 0,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "event")]
pub enum EventData {
    State(Box<StateSnapshot>),
    Log { level: String, msg: String },
    Spawn,
    Death,
    End { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventPayload {
    pub event: String,
    pub data: serde_json::Value,
}
