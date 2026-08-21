use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub version: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "localhost".into(),
            port: 25565,
            version: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AccountConfig {
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MovementConfig {
    pub sprint: bool,
    pub can_dig: bool,
    pub allow_parkour: bool,
    pub goal_tolerance: f64,
}

impl Default for MovementConfig {
    fn default() -> Self {
        Self {
            sprint: true,
            can_dig: false,
            allow_parkour: true,
            goal_tolerance: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AutoEatConfig {
    pub enabled: bool,
    pub start_at_food: u8,
    pub low_health: u8,
}

impl Default for AutoEatConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            start_at_food: 14,
            low_health: 10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ViewerConfig {
    pub enabled: bool,
    pub port: u16,
    pub first_person: bool,
}

impl Default for ViewerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 3001,
            first_person: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct IpcConfig {
    pub socket_path: Option<String>,
}

impl Default for IpcConfig {
    fn default() -> Self {
        Self { socket_path: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BotConfig {
    pub server: ServerConfig,
    pub account: AccountConfig,
    pub movement: MovementConfig,
    pub auto_eat: AutoEatConfig,
    pub viewer: ViewerConfig,
    pub ipc: IpcConfig,
}

impl Default for BotConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            account: AccountConfig::default(),
            movement: MovementConfig::default(),
            auto_eat: AutoEatConfig::default(),
            viewer: ViewerConfig::default(),
            ipc: IpcConfig::default(),
        }
    }
}

impl BotConfig {
    pub fn load(path: &PathBuf) -> Result<Self, String> {
        let text = std::fs::read_to_string(path)
            .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
        toml::from_str(&text).map_err(|e| format!("invalid toml in {}: {e}", path.display()))
    }

    pub fn find_default_path() -> Option<PathBuf> {
        if let Ok(p) = std::env::var("MINEBOT_CONFIG") {
            return Some(PathBuf::from(p));
        }
        if let Some(dir) = dirs::config_dir() {
            let p = dir.join("minebot").join("config.toml");
            if p.exists() {
                return Some(p);
            }
        }
        None
    }

    pub fn socket_path(&self) -> PathBuf {
        if let Some(p) = &self.ipc.socket_path {
            return PathBuf::from(p);
        }
        if let Some(runtime) = std::env::var_os("XDG_RUNTIME_DIR") {
            return PathBuf::from(runtime).join("minebot").join("bot.sock");
        }
        let uid = users_uid();
        PathBuf::from(format!("/tmp/minebot-{uid}/bot.sock"))
    }
}

fn users_uid() -> u32 {
    unsafe { libc_getuid() }
}

#[cfg(unix)]
unsafe fn libc_getuid() -> u32 {
    uid_syscall()
}

#[cfg(unix)]
fn uid_syscall() -> u32 {
    extern "C" {
        fn getuid() -> u32;
    }
    unsafe { getuid() }
}
