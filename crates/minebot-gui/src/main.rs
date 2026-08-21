use minebot_core::{BotConfig, IpcClient, StateSnapshot};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct Shared {
    pub client: Arc<IpcClient>,
    pub latest: Arc<Mutex<StateSnapshot>>,
    pub cfg_path: Mutex<Option<PathBuf>>,
}

impl Shared {
    fn socket_path(cfg_path: &Option<PathBuf>) -> PathBuf {
        let cfg = cfg_path
            .as_ref()
            .and_then(|p| BotConfig::load(p).ok())
            .unwrap_or_default();
        cfg.socket_path()
    }
}

fn find_cfg_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("MINEBOT_CONFIG") {
        return Some(PathBuf::from(p));
    }
    dirs::config_dir().map(|d| d.join("minebot").join("config.toml"))
}

#[tauri::command]
async fn get_state(shared: tauri::State<'_, Arc<Shared>>) -> Result<StateSnapshot, String> {
    Ok(shared.latest.lock().unwrap().clone())
}

#[tauri::command]
async fn goto(
    shared: tauri::State<'_, Arc<Shared>>,
    x: f64,
    y: f64,
    z: f64,
    timeout_ms: Option<u64>,
) -> Result<Value, String> {
    shared
        .client
        .goto(x, y, z, timeout_ms)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_bot(shared: tauri::State<'_, Arc<Shared>>) -> Result<Value, String> {
    shared.client.stop_bot().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn ping_bot(shared: tauri::State<'_, Arc<Shared>>) -> Result<i64, String> {
    shared.client.ping().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_config_runtime(
    shared: tauri::State<'_, Arc<Shared>>,
    patch: Value,
) -> Result<Value, String> {
    shared.client.set_config(&patch).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_viewer(shared: tauri::State<'_, Arc<Shared>>) -> Result<String, String> {
    let url = shared
        .latest
        .lock()
        .unwrap()
        .viewer_url
        .clone()
        .ok_or_else(|| "Viewer chua khoi dong (bot chua connect hoac viewer bi tat)".to_string())?;
    let _ = std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn();
    Ok(url)
}

#[tauri::command]
fn get_config(shared: tauri::State<'_, Arc<Shared>>) -> Result<BotConfig, String> {
    let path = { shared.cfg_path.lock().unwrap().clone() };
    match path {
        Some(p) if p.exists() => BotConfig::load(&p),
        _ => Ok(BotConfig::default()),
    }
}

#[tauri::command]
fn save_config(
    shared: tauri::State<'_, Arc<Shared>>,
    config: BotConfig,
) -> Result<String, String> {
    let path = {
        let cur = shared.cfg_path.lock().unwrap().clone();
        cur.unwrap_or_else(|| {
            let base = dirs::config_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("minebot");
            let _ = std::fs::create_dir_all(&base);
            base.join("config.toml")
        })
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let text =
        toml::to_string_pretty(&config).map_err(|e| format!("khong serialize duoc: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("khong ghi duoc file: {e}"))?;
    Ok(path.display().to_string())
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "minebot=info,warn".into()),
        )
        .init();

    tauri::Builder::default()
        .setup(|app| {
            let handle: AppHandle = app.handle().clone();
            let cfg_path = find_cfg_path();

            let socket = Shared::socket_path(&cfg_path);
            println!("[minebot] ipc socket: {}", socket.display());

            let client = Arc::new(IpcClient::new(socket));
            let latest: Arc<Mutex<StateSnapshot>> =
                Arc::new(Mutex::new(StateSnapshot::default()));

            {
                let client2 = client.clone();
                tauri::async_runtime::spawn(async move {
                    client2.connect_forever(std::time::Duration::from_millis(700)).await;
                });
            }

            {
                let mut events = client.subscribe_events();
                let latest2 = latest.clone();
                let handle2 = handle.clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        match events.recv().await {
                            Ok(ev) => {
                                if ev.event == "state" {
                                    if let Ok(snap) =
                                        serde_json::from_value::<StateSnapshot>(ev.data.clone())
                                    {
                                        *latest2.lock().unwrap() = snap;
                                    }
                                } else if ev.event == "log" {
                                    if let Some(msg) = ev.data.get("msg").and_then(|m| m.as_str())
                                    {
                                        println!("{}", msg);
                                    }
                                }
                                let _ = handle2.emit("bot-event", &ev);
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(_) => break,
                        }
                    }
                });
            }

            app.manage(Arc::new(Shared {
                client,
                latest,
                cfg_path: Mutex::new(cfg_path),
            }));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            goto,
            stop_bot,
            ping_bot,
            set_config_runtime,
            open_viewer,
            get_config,
            save_config
        ])
        .run(tauri::generate_context!())
        .expect("loi khi chay MineBot");
}
