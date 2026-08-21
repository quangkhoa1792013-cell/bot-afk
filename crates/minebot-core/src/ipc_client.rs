use crate::protocol::EventPayload;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::sync::{broadcast, mpsc, oneshot, watch, Mutex, RwLock};

#[derive(Debug, Error)]
pub enum IpcError {
    #[error("not connected")]
    NotConnected,
    #[error("ipc error: {0}")]
    Custom(String),
}

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;

pub struct IpcClient {
    socket_path: PathBuf,
    writer_tx: Arc<RwLock<Option<mpsc::UnboundedSender<String>>>>,
    events_tx: broadcast::Sender<EventPayload>,
    pending: PendingMap,
    next_id: AtomicU64,
    status_tx: watch::Sender<bool>,
    pub status_rx: watch::Receiver<bool>,
}

impl IpcClient {
    pub fn new(socket_path: PathBuf) -> Self {
        let (events_tx, _) = broadcast::channel(256);
        let (status_tx, status_rx) = watch::channel(false);
        Self {
            socket_path,
            writer_tx: Arc::new(RwLock::new(None)),
            events_tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            status_tx,
            status_rx,
        }
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<EventPayload> {
        self.events_tx.subscribe()
    }

    pub async fn is_connected(&self) -> bool {
        *self.status_rx.borrow()
    }

    pub fn socket_path(&self) -> &PathBuf {
        &self.socket_path
    }

    pub async fn connect_forever(&self, retry_delay: std::time::Duration) {
        loop {
            match self.run_once().await {
                Ok(_) => tracing::debug!("ipc connection ended cleanly"),
                Err(e) => tracing::debug!(error = %e, "ipc connection ended"),
            }
            let _ = self.status_tx.send(false);
            {
                *self.writer_tx.write().await = None;
            }
            self.fail_all_pending("ipc disconnected").await;
            tokio::time::sleep(retry_delay).await;
        }
    }

    async fn fail_all_pending(&self, msg: &str) {
        let mut map = self.pending.lock().await;
        for (_, tx) in map.drain() {
            let _ = tx.send(Err(msg.to_string()));
        }
    }

    async fn run_once(&self) -> Result<(), IpcError> {
        let stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| IpcError::Custom(format!("connect: {e}")))?;

        let (read_half, mut write_half) = stream.into_split();
        let mut reader = BufReader::with_capacity(256 * 1024, read_half);

        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        *self.writer_tx.write().await = Some(tx);
        let _ = self.status_tx.send(true);

        let writer_task = tokio::spawn(async move {
            while let Some(line) = rx.recv().await {
                if write_half.write_all(line.as_bytes()).await.is_err() {
                    break;
                }
                let _ = write_half.flush().await;
            }
        });

        let result: Result<(), IpcError> = loop {
            let mut line = String::with_capacity(1024);
            match reader.read_line(&mut line).await {
                Ok(0) => break Err(IpcError::NotConnected),
                Ok(n) => {
                    let trimmed = line[..n].trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Err(e) = self.handle_message(trimmed).await {
                        break Err(IpcError::Custom(e));
                    }
                }
                Err(e) => break Err(IpcError::Custom(format!("read: {e}"))),
            }
        };

        *self.writer_tx.write().await = None;
        writer_task.abort();
        result
    }

    async fn handle_message(&self, raw: &str) -> Result<(), String> {
        let v: Value =
            serde_json::from_str(raw).map_err(|e| format!("bad json from bot: {e}"))?;

        if v.get("error").is_some() {
            let msg = v
                .pointer("/error/message")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown ipc error")
                .to_string();
            if let Some(id) = v.get("id").and_then(|i| i.as_u64()) {
                let mut map = self.pending.lock().await;
                if let Some(tx) = map.remove(&id) {
                    let _ = tx.send(Err(msg));
                }
            }
            return Ok(());
        }

        if let Some(result) = v.get("result") {
            if let Some(id) = v.get("id").and_then(|i| i.as_u64()) {
                let mut map = self.pending.lock().await;
                if let Some(tx) = map.remove(&id) {
                    let _ = tx.send(Ok(result.clone()));
                }
            }
            return Ok(());
        }

        if v.get("method").and_then(|m| m.as_str()) == Some("event") {
            if let Some(params) = v.get("params") {
                if let Ok(payload) = serde_json::from_value::<EventPayload>(params.clone()) {
                    let _ = self.events_tx.send(payload);
                }
            }
        }

        Ok(())
    }

    pub async fn raw_request(
        &self,
        method: &str,
        params: Value,
        timeout: std::time::Duration,
    ) -> Result<Value, IpcError> {
        let tx = { self.writer_tx.read().await.clone() };
        let tx = tx.ok_or(IpcError::NotConnected)?;

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });
        let line = format!("{}\n", serde_json::to_string(&req).unwrap());

        let (otx, orx) = oneshot::channel();
        {
            self.pending.lock().await.insert(id, otx);
        }

        if tx.send(line).is_err() {
            self.pending.lock().await.remove(&id);
            return Err(IpcError::NotConnected);
        }

        match tokio::time::timeout(timeout, orx).await {
            Ok(Ok(res)) => res.map_err(IpcError::Custom),
            Ok(Err(_)) => Err(IpcError::NotConnected),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(IpcError::Custom("timeout".into()))
            }
        }
    }

    pub async fn goto(
        &self,
        x: f64,
        y: f64,
        z: f64,
        timeout_ms: Option<u64>,
    ) -> Result<Value, IpcError> {
        let mut params = json!({ "x": x, "y": y, "z": z });
        if let Some(t) = timeout_ms {
            params["timeoutMs"] = json!(t);
        }
        self.raw_request("goto", params, std::time::Duration::from_secs(10))
            .await
    }

    pub async fn stop_bot(&self) -> Result<Value, IpcError> {
        self.raw_request("stop", json!({}), std::time::Duration::from_secs(5))
            .await
    }

    pub async fn status(&self) -> Result<Value, IpcError> {
        self.raw_request("status", json!({}), std::time::Duration::from_secs(3))
            .await
    }

    pub async fn set_config<T: Serialize>(&self, patch: &T) -> Result<Value, IpcError> {
        let params = serde_json::to_value(patch).unwrap();
        self.raw_request("set_config", params, std::time::Duration::from_secs(5))
            .await
    }

    pub async fn ping(&self) -> Result<i64, IpcError> {
        let v = self
            .raw_request("ping", json!({}), std::time::Duration::from_secs(2))
            .await?;
        Ok(v.get("pong").and_then(|p| p.as_i64()).unwrap_or(-1))
    }
}
