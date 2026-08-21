use minebot_core::{IpcClient, StateSnapshot};
use std::sync::Arc;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let path = std::env::args()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::env::var_os("XDG_RUNTIME_DIR")
                .map(|d| std::path::PathBuf::from(d).join("minebot").join("bot.sock"))
                .unwrap_or_else(|| std::path::PathBuf::from("/tmp/minebot-bot.sock"))
        });

    let client = Arc::new(IpcClient::new(path));
    let mut events = client.subscribe_events();

    tokio::spawn({
        let client = client.clone();
        async move { client.connect_forever(Duration::from_millis(500)).await }
    });

    for i in 0..20 {
        if client.ping().await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
        if i == 19 {
            eprintln!("FAIL: bot did not answer ping");
            std::process::exit(1);
        }
    }
    println!("PASS: ping");

    match client.status().await {
        Ok(v) => {
            let snap: Result<StateSnapshot, _> = serde_json::from_value(v);
            match snap {
                Ok(s) => println!(
                    "PASS: status connected={} mock={} pos={:?} food={}",
                    s.connected, s.mock,
                    s.position.as_ref().map(|p| (p.x, p.y, p.z)),
                    s.food
                ),
                Err(e) => {
                    eprintln!("FAIL: bad state snapshot: {e}");
                    std::process::exit(1);
                }
            }
        }
        Err(e) => {
            eprintln!("FAIL: status request: {e}");
            std::process::exit(1);
        }
    }

    match client.goto(100.0, 64.0, -50.0, None).await {
        Ok(v) => println!("PASS: goto ack: {v}"),
        Err(e) => {
            eprintln!("FAIL: goto: {e}");
            std::process::exit(1);
        }
    }

    tokio::time::sleep(Duration::from_millis(2500)).await;
    let mut got_state = false;
    while let Ok(ev) = events.try_recv() {
        if ev.event == "state" {
            got_state = true;
        }
        println!("event: {}", ev.event);
    }
    if !got_state {
        println!("WARN: no state event received (mock broadcasts only on change)");
    } else {
        println!("PASS: state event");
    }

    println!("ALL OK");
}
