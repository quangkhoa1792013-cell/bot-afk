#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BẢNG ĐIỀU KHIỂN TRUNG TÂM - Flask Web Dashboard
- Tab Điều khiển: chạy run.sh trong terminal web (xterm.js + WebSocket + PTY)
- Tab Quản lý Bot: bật/tắt, thêm, xóa account + log & chat LIVE (WebSocket push)
- Tab CAPTCHA: xem ảnh captcha + nhập code
- Không sửa gì trong run.sh
- Mọi dữ liệu live đẩy qua EventHub (1 sender thread, không đua socket)
"""
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time

from flask import Flask, jsonify, render_template, send_from_directory, request

WEB_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(WEB_DIR)          # thư mục gốc (chứa run.sh, accounts.json...)
ACCOUNTS_FILE = os.path.join(PROJECT_ROOT, "accounts.json")
CONFIG_FILE = os.path.join(WEB_DIR, "config.json")
SUBMIT_FILE = os.path.join(WEB_DIR, "captcha_submit.txt")
CAPTCHA_DIR = os.path.join(PROJECT_ROOT, "captcha_dumps")
BOT_LOGS_DIR = os.path.join(WEB_DIR, "logs", "bots")
SESSION = "mc_bots"
TTYD_PORT = 7681
RUN_SH = os.path.join(PROJECT_ROOT, "run.sh")


def load_config():
    """Cấu hình: Env vars (Render) ưu tiên hơn config.json (máy local).

    Render không có config.json -> chỉ cần set env:
      DISCORD_TOKEN, DISCORD_CHANNEL_ID, DISCORD_USERNAME, DISCORD_PREFIX, SERVER
    """
    cfg = {}
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f) or {}
    except Exception:
        pass
    return {
        "discord_token": os.environ.get("DISCORD_TOKEN", cfg.get("discord_token", "")),
        "discord_channel_id": os.environ.get("DISCORD_CHANNEL_ID", cfg.get("discord_channel_id", "")),
        "username": os.environ.get("DISCORD_USERNAME", cfg.get("username", "")),
        "discord_prefix": os.environ.get("DISCORD_PREFIX", cfg.get("discord_prefix", "!submit")),
        "server": os.environ.get("SERVER", cfg.get("server", "aquamc.vn")),
    }


def has_runsh():
    """Máy local có run.sh (điều khiển bot thật). Render chỉ có web/ -> chế độ demo."""
    return os.path.exists(RUN_SH)

app = Flask(__name__,
            template_folder=os.path.join(WEB_DIR, "templates"),
            static_folder=os.path.join(WEB_DIR, "static"))
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}


def run(cmd):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True,
                              cwd=PROJECT_ROOT, timeout=3)
    except Exception:
        return None


def cleanup_stale_runsh():
    """Dọn run.sh rác còn sót từ lần chạy trước (chỉ máy local)"""
    if not has_runsh():
        return
    run("pkill -f '[b]ash run.sh'")
    time.sleep(0.6)


# ============================================================
# EVENT HUB: 1 sender thread duy nhất -> không đua socket
# ============================================================
class EventHub:
    def __init__(self):
        self.clients = {}          # ws -> set(channel)
        self.lock = threading.Lock()
        self.q = queue.Queue()
        threading.Thread(target=self._sender, daemon=True).start()

    def add(self, ws, channel):
        with self.lock:
            self.clients.setdefault(ws, set()).add(channel)

    def remove(self, ws):
        with self.lock:
            self.clients.pop(ws, None)

    def push(self, channel, obj):
        self.q.put((channel, obj))

    def _sender(self):
        while True:
            channel, obj = self.q.get()
            msg = json.dumps(obj, ensure_ascii=False)
            with self.lock:
                dead = []
                for ws, chans in list(self.clients.items()):
                    if channel not in chans:
                        continue
                    try:
                        ws.send(msg)
                    except Exception:
                        dead.append(ws)
                for ws in dead:
                    self.clients.pop(ws, None)


EVENTS = EventHub()


# ============================================================
# TERMINAL MANAGER (chạy run.sh trong PTY, broadcast qua EventHub)
# ============================================================
class TerminalManager:
    def __init__(self):
        import ptyprocess
        self.ptyprocess = ptyprocess
        self.proc = None
        self.lock = threading.Lock()
        self.ring = []          # buffer output gần nhất để replay
        self.RING_MAX = 40000

    @property
    def alive(self):
        return self.proc is not None and self.proc.isalive()

    def _feed(self, data):
        if isinstance(data, str):
            data = data.encode("utf-8", "replace")
        self.ring.append(data)
        self.ring = self.ring[-self.RING_MAX:]
        EVENTS.push("term", {"type": "out", "data": data.decode("utf-8", "replace")})

    def replay(self):
        return b"".join(self.ring).decode("utf-8", "replace")

    def start(self):
        if self.alive:
            return
        if not has_runsh():
            # Render / bản demo: không có run.sh local -> không spawn, báo rõ ràng
            self._feed("\x1b[31m[WEB] Không tìm thấy run.sh — đây là bản DEMO/REMOTE (Render).\x1b[0m\r\n"
                       "\x1b[31m[WEB] Terminal và điều khiển bot CHỈ hoạt động trên máy local.\x1b[0m\r\n")
            return
        proc = self.ptyprocess.PtyProcess.spawn(
            ["bash", "run.sh"],
            cwd=PROJECT_ROOT,
            env={**os.environ, "TERM": "xterm-256color"},
        )
        self.proc = proc
        self._feed("\x1b[38;5;47m[WEB] Đã khởi chạy run.sh.\x1b[0m\r\n")
        threading.Thread(target=self._read_loop, daemon=True).start()

    def _read_loop(self):
        import select
        proc = self.proc  # giữ tham chiếu riêng, tránh đọc nhầm pty của lần start sau
        while proc and proc.isalive():
            try:
                r, _, _ = select.select([proc.fd], [], [], 0.3)
                if r:
                    data = proc.read(65536)
                    if data:
                        self._feed(data)
            except Exception:
                time.sleep(0.3)
        self._feed("\r\n\x1b[31m[WEB] run.sh đã thoát.\x1b[0m\r\n")
        with self.lock:
            if self.proc is proc:
                self.proc = None

    def write(self, data):
        # Nếu run.sh đã thoát mà user vẫn gõ -> tự khởi động lại (không để chết im)
        if not self.alive:
            self.start()
            time.sleep(1.2)
        if self.alive:
            try:
                if isinstance(data, str):
                    data = data.encode("utf-8", "replace")
                self.proc.write(data)
            except Exception:
                pass

    def resize(self, cols, rows):
        if self.alive:
            try:
                self.proc.setwinsize(int(rows), int(cols))
            except Exception:
                pass

    def restart(self):
        with self.lock:
            if self.proc and self.proc.isalive():
                try:
                    self.proc.terminate()
                except Exception:
                    pass
                time.sleep(0.8)
            self.proc = None
            self.start()


TM = TerminalManager()
cleanup_stale_runsh()

# ============================================================
# DRIVER: bấm hộ menu run.sh (không sửa run.sh)
# ============================================================
MENU_ACTIONS = {
    "start_bots":   "2\n1\n\n5\n",
    "stop_bots":    "2\n3\n\n5\n",
    "restart_bots": "2\n2\n\n5\n",
    "restart_web":  "1\n2\n\n5\n",
    "start_web":    "1\n1\n\n5\n",
}


def drive_runsh(action, delay=0.9):
    def _run():
        with TM.lock:
            try:
                if not has_runsh():
                    EVENTS.push("term", {"type": "out", "data": (
                        f"\x1b[31m[WEB] Không thể '{action}': thiếu run.sh "
                        f"(bản demo/remote — chỉ máy local mới điều khiển được bot).\x1b[0m\r\n")})
                    return
                TM.start()
                if TM.alive:
                    TM.write(f"\x1b[38;5;208m[WEB] Đang thực hiện: {action}...\x1b[0m\r\n")
                    time.sleep(1.2)  # chờ menu in ra
                    for ch in MENU_ACTIONS[action]:
                        TM.write(ch)
                        time.sleep(delay)
            finally:
                pass
    threading.Thread(target=_run, daemon=True).start()


# ============================================================
# HELPERS: accounts.json
# ============================================================
def load_accounts():
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def save_accounts(data):
    tmp = ACCOUNTS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ACCOUNTS_FILE)


# ============================================================
# LOG & CHAT THỰC TẾ CỦA TỪNG BOT (tmux pipe-pane)
# ============================================================
LOGGED_PANES = set()
LOGGED_PANES_LOCK = threading.Lock()


def safe_name(name):
    return re.sub(r"[^A-Za-z0-9._-]", "_", name or "unknown")


def bot_log_path(name):
    return os.path.join(BOT_LOGS_DIR, safe_name(name) + ".log")


def ensure_bot_pipes():
    if not run(f"tmux has-session -t {SESSION} 2>/dev/null"):
        return
    os.makedirs(BOT_LOGS_DIR, exist_ok=True)
    r = run(f"tmux list-panes -t {SESSION} -F '#{{pane_id}}|#{{@bot}}' 2>/dev/null")
    if not r or not r.stdout:
        return
    with LOGGED_PANES_LOCK:
        for line in r.stdout.splitlines():
            parts = line.split("|", 1)
            if len(parts) != 2:
                continue
            pane_id, bot = parts
            bot = bot.strip()
            if not bot or bot in LOGGED_PANES:
                continue
            logfile = bot_log_path(bot)
            run(f"tmux pipe-pane -t '{pane_id}' 'cat >> {logfile}'")
            LOGGED_PANES.add(bot)


def tail_lines(path, n=500):
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            chunk = min(size, 200 * 1024)
            f.seek(max(0, size - chunk))
            data = f.read().decode("utf-8", "replace")
        return data.splitlines()[-n:]
    except Exception:
        return []


def running_bots():
    """Một lần pgrep duy nhất cho tất cả bot (nhanh)"""
    r = run("pgrep -af '[M]inecraftClient' 2>/dev/null")
    names = set()
    if r and r.stdout:
        for line in r.stdout.splitlines():
            m = re.search(r"MinecraftClient\s+(\S+)", line)
            if m:
                names.add(m.group(1))
    return names


# ============================================================
# WATCHERS: đẩy dữ liệu live qua EventHub
# ============================================================
log_offsets = {}            # bot -> vị trí byte đã đọc
state_cache = {}            # bot -> running?
seen_captchas = set()


def _read_new_lines(path, name):
    """Đọc những dòng MỚI từ file log (kể từ lần đọc trước)"""
    try:
        size = os.path.getsize(path)
    except Exception:
        return []
    off = log_offsets.get(name, 0)
    if size < off:          # file bị cắt/restart
        off = 0
    if size == off:
        return []
    try:
        with open(path, "rb") as f:
            f.seek(off)
            data = f.read().decode("utf-8", "replace")
        log_offsets[name] = size
    except Exception:
        return []
    if not data:
        return []
    if not data.endswith("\n"):
        log_offsets[name] = off  # dòng chưa trọn vẹn, đợi lần sau
    return data.splitlines()


def watcher_loop():
    while True:
        time.sleep(0.3)
        try:
            ensure_bot_pipes()
            names = {a.get("name", "") for a in load_accounts() if a.get("name")}

            # 1) Log mới từng bot
            for name in list(names):
                path = bot_log_path(name)
                if not os.path.exists(path):
                    continue
                lines = _read_new_lines(path, name)
                if lines:
                    EVENTS.push("events", {"type": "log", "bot": name, "lines": lines})

            # 2) Trạng thái chạy/tắt thay đổi
            running = running_bots()
            for name in names:
                cur = name in running
                if state_cache.get(name) != cur:
                    state_cache[name] = cur
                    if cur:
                        # Bot vừa khởi động -> BỎ LOG CŨ: cắt file + đếm lại từ đầu
                        log_offsets[name] = 0
                        try:
                            open(bot_log_path(name), "w").close()
                        except Exception:
                            pass
                        EVENTS.push("events", {"type": "logreset", "bot": name})
                    EVENTS.push("events", {"type": "botstate", "bot": name, "running": cur})

            # 3) Ảnh captcha mới
            if os.path.isdir(CAPTCHA_DIR):
                for f in os.listdir(CAPTCHA_DIR):
                    if f.endswith(".png") and f not in seen_captchas:
                        seen_captchas.add(f)
                        account = f.split("_map_dump_")[0] if "_map_dump_" in f else "?"
                        EVENTS.push("events", {
                            "type": "captcha",
                            "file": f,
                            "account": account,
                            "time": time.strftime("%H:%M:%S", time.localtime(os.path.getmtime(os.path.join(CAPTCHA_DIR, f)))),
                        })
        except Exception:
            pass


threading.Thread(target=watcher_loop, daemon=True).start()


def status_dict():
    bots = run(f"tmux has-session -t {SESSION} 2>/dev/null && echo yes")
    web = run(f"pgrep -f '[t]tyd.* -p {TTYD_PORT} ' > /dev/null && echo yes")
    uptime = run("uptime -p")
    try:
        stats = os.statvfs(PROJECT_ROOT)
        disk = f"{stats.f_bavail * stats.f_frsize / 1024 / 1024:.0f} MB"
    except Exception:
        disk = "?"
    accounts = load_accounts()
    return {
        "mode": "local" if has_runsh() else "remote",
        "bots": bool(bots and bots.stdout.strip() == "yes"),
        "web": bool(web and web.stdout.strip() == "yes"),
        "terminal": TM.alive,
        "discord": captcha_bridge_running(),
        "discord_account": captcha_account(),
        "accounts_total": len(accounts),
        "accounts_active": sum(1 for a in accounts if a.get("active", True)),
        "uptime": uptime.stdout.strip() if uptime and uptime.stdout else "",
        "disk": disk,
        "captcha_count": len([f for f in seen_captchas]),
        "time": time.strftime("%H:%M:%S"),
    }


def status_loop():
    while True:
        time.sleep(1.0)
        try:
            EVENTS.push("events", {"type": "status", "status": status_dict()})
        except Exception:
            pass


threading.Thread(target=status_loop, daemon=True).start()


# ============================================================
# ROUTES - TRANG
# ============================================================
@app.route("/")
def index():
    return render_template("index.html")


# ============================================================
# ROUTES - API
# ============================================================
@app.route("/api/status")
def api_status():
    return jsonify(status_dict())


@app.route("/api/accounts", methods=["GET"])
def api_accounts():
    return jsonify(load_accounts())


@app.route("/api/bots/status")
def api_bots_status():
    running = running_bots()
    result = []
    for acc in load_accounts():
        name = acc.get("name", "")
        logfile = bot_log_path(name)
        size = os.path.getsize(logfile) if os.path.exists(logfile) else 0
        mtime = os.path.getmtime(logfile) if os.path.exists(logfile) else 0
        result.append({
            "name": name,
            "active": acc.get("active", True),
            "running": name in running,
            "log_size": size,
            "log_mtime": int(mtime),
        })
    return jsonify(result)


@app.route("/api/botlog/<name>")
def api_botlog(name):
    logfile = bot_log_path(name)
    running = name in running_bots()
    return jsonify({
        "name": name,
        "running": running,
        "lines": tail_lines(logfile, 500) if running else [],
    })


@app.route("/api/bot/chat", methods=["POST"])
def api_bot_chat():
    """Gửi tin nhắn chat vào tmux pane của bot (gõ thay user trong MinecraftClient)"""
    data = request.get_json(silent=True) or {}
    name = str(data.get("bot") or "").strip()
    message = str(data.get("message") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Thiếu tên bot"}), 400
    if not message:
        return jsonify({"ok": False, "error": "Tin nhắn trống"}), 400
    if len(message) > 256:
        return jsonify({"ok": False, "error": "Tin nhắn quá dài (tối đa 256 ký tự)"}), 400
    if name not in running_bots():
        return jsonify({"ok": False, "error": f"Bot '{name}' đang TẮT — không gửi được"}), 400
    r = run(f"tmux list-panes -t {SESSION} -F '#{{pane_id}}|#{{@bot}}' 2>/dev/null")
    pane = None
    if r and r.stdout:
        for line in r.stdout.splitlines():
            pid, b = line.split("|", 1)
            if b.strip() == name:
                pane = pid
                break
    if not pane:
        return jsonify({"ok": False, "error": f"Không tìm thấy cửa sổ của bot '{name}'"}), 404
    # -l: gửi chữ literal (an toàn với ký tự đặc biệt), rồi nhấn Enter
    subprocess.run(["tmux", "send-keys", "-l", "-t", pane, message],
                   cwd=PROJECT_ROOT, timeout=3)
    subprocess.run(["tmux", "send-keys", "-t", pane, "Enter"],
                   cwd=PROJECT_ROOT, timeout=3)
    return jsonify({"ok": True, "bot": name, "message": message})


@app.route("/api/accounts/toggle", methods=["POST"])
def api_accounts_toggle():
    if not os.path.exists(ACCOUNTS_FILE):
        return jsonify({"ok": False, "error": "Chế độ demo/remote — không có accounts.json (chỉ máy local dùng được)"}), 400
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if not name:
        return jsonify({"ok": False, "error": "Thiếu tên tài khoản"}), 400
    accounts = load_accounts()
    for acc in accounts:
        if acc.get("name") == name:
            acc["active"] = bool(data.get("active", not acc.get("active", True)))
            save_accounts(accounts)
            return jsonify({"ok": True, "accounts": accounts})
    return jsonify({"ok": False, "error": f"Không tìm thấy '{name}'"}), 404


@app.route("/api/accounts/add", methods=["POST"])
def api_accounts_add():
    if not os.path.exists(ACCOUNTS_FILE):
        return jsonify({"ok": False, "error": "Chế độ demo/remote — không có accounts.json (chỉ máy local dùng được)"}), 400
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Tên không được để trống"}), 400
    if "/" in name or ".." in name:
        return jsonify({"ok": False, "error": "Tên không hợp lệ"}), 400
    server = (data.get("server") or "aquamc.vn").strip()
    script = (data.get("script") or "login_afk.txt").strip()
    accounts = load_accounts()
    if any(a.get("name") == name for a in accounts):
        return jsonify({"ok": False, "error": f"'{name}' đã tồn tại"}), 400
    sh_file = f"bots/{name}.sh"
    os.makedirs(os.path.join(PROJECT_ROOT, "bots"), exist_ok=True)
    with open(os.path.join(PROJECT_ROOT, sh_file), "w", encoding="utf-8") as f:
        f.write(f"#!/bin/bash\nclear\n./MinecraftClient {name} - {server} script=scripts/{script}\n")
    os.chmod(os.path.join(PROJECT_ROOT, sh_file), 0o755)
    os.makedirs(os.path.join(PROJECT_ROOT, "scripts"), exist_ok=True)
    if os.path.exists(os.path.join(PROJECT_ROOT, script)) and \
       not os.path.exists(os.path.join(PROJECT_ROOT, "scripts", script)):
        shutil.copy(os.path.join(PROJECT_ROOT, script), os.path.join(PROJECT_ROOT, "scripts", script))
    accounts.append({"name": name, "sh": sh_file, "script": script, "active": True})
    save_accounts(accounts)
    return jsonify({"ok": True, "accounts": accounts})


@app.route("/api/accounts/delete", methods=["POST"])
def api_accounts_delete():
    if not os.path.exists(ACCOUNTS_FILE):
        return jsonify({"ok": False, "error": "Chế độ demo/remote — không có accounts.json (chỉ máy local dùng được)"}), 400
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    accounts = load_accounts()
    new_accounts = [a for a in accounts if a.get("name") != name]
    if len(new_accounts) == len(accounts):
        return jsonify({"ok": False, "error": f"Không tìm thấy '{name}'"}), 404
    save_accounts(new_accounts)
    return jsonify({"ok": True, "accounts": new_accounts})


@app.route("/api/terminal/action", methods=["POST"])
def api_terminal_action():
    if not has_runsh():
        return jsonify({"ok": False, "error": "Chế độ demo/remote — không có run.sh, không điều khiển bot được"}), 400
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    if action not in MENU_ACTIONS:
        return jsonify({"ok": False, "error": "Hành động không hợp lệ"}), 400
    drive_runsh(action)
    return jsonify({"ok": True, "message": f"Đang thực hiện: {action}"})


@app.route("/api/terminal/start", methods=["POST"])
def api_terminal_start():
    TM.start()
    return jsonify({"ok": True})


@app.route("/api/terminal/restart", methods=["POST"])
def api_terminal_restart():
    TM.restart()
    return jsonify({"ok": True})


# ============================================================
# CAPTCHA
# ============================================================
def list_captchas(limit=30):
    if not os.path.isdir(CAPTCHA_DIR):
        return []
    files = [f for f in os.listdir(CAPTCHA_DIR) if f.endswith(".png")]
    files.sort(key=lambda f: os.path.getmtime(os.path.join(CAPTCHA_DIR, f)), reverse=True)
    result = []
    for f in files[:limit]:
        account = f.split("_map_dump_")[0] if "_map_dump_" in f else "?"
        result.append({
            "file": f,
            "account": account,
            "time": time.strftime("%H:%M:%S", time.localtime(os.path.getmtime(os.path.join(CAPTCHA_DIR, f)))),
        })
    return result


@app.route("/api/captchas")
def api_captchas():
    return jsonify(list_captchas())


@app.route("/api/captcha/submit", methods=["POST"])
def api_captcha_submit():
    if not os.path.exists(os.path.join(WEB_DIR, "captcha_discord.js")) or not shutil.which("node"):
        return jsonify({"ok": False, "error": "Chế độ demo/remote — gửi mã chỉ hoạt động trên máy local"}), 400
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    if not code:
        return jsonify({"ok": False, "error": "Nhập mã captcha"}), 400
    if any(c in code for c in ["\n", "\r"]):
        return jsonify({"ok": False, "error": "Mã không hợp lệ"}), 400
    with open(SUBMIT_FILE, "a", encoding="utf-8") as f:
        f.write(f"{time.time()}|{code}\n")
    return jsonify({"ok": True, "message": f"Đã gửi mã '{code}' cho bot captcha"})


@app.route("/captcha_dumps/<path:filename>")
def captcha_file(filename):
    return send_from_directory(CAPTCHA_DIR, filename)


def captcha_bridge_running():
    r = run("pgrep -f '[c]aptcha_discord.js' > /dev/null && echo yes")
    return bool(r and r.stdout and r.stdout.strip() == "yes")


def captcha_account():
    return load_config().get("username") or "?"


@app.route("/api/captcha/bridge", methods=["POST"])
def api_captcha_bridge():
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    if action == "start":
        if captcha_bridge_running():
            return jsonify({"ok": False, "error": "Bridge captcha đang chạy rồi"}), 400
        if not os.path.exists(os.path.join(WEB_DIR, "captcha_discord.js")) or not shutil.which("node"):
            return jsonify({"ok": False, "error": "Thiếu node hoặc captcha_discord.js — bridge chỉ hoạt động trên máy local"}), 400
        try:
            with open(os.path.join(WEB_DIR, "captcha_discord.log"), "ab") as f:
                subprocess.Popen(
                    ["setsid", "node", "captcha_discord.js"],
                    cwd=WEB_DIR, stdout=f, stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL, start_new_session=True,
                )
            return jsonify({"ok": True, "message": "Đã chạy captcha bridge"})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500
    if action == "stop":
        run("pkill -f '[c]aptcha_discord.js'")
        return jsonify({"ok": True, "message": "Đã tắt captcha bridge"})
    return jsonify({"ok": False, "error": "action phải là start/stop"}), 400


@app.route("/api/log")
def api_log():
    r = run("tail -n 30 run.log 2>/dev/null")
    return jsonify({"log": (r.stdout if r and r.stdout else "")})


# ============================================================
# WEBSOCKETS
# ============================================================
from flask_sock import Sock

sock = Sock(app)


@sock.route("/ws/term")
def ws_term(ws):
    TM.start()
    EVENTS.add(ws, "term")
    EVENTS.push("term", {"type": "replay", "data": TM.replay()})
    try:
        while True:
            msg = ws.receive()
            if msg is None:
                break
            try:
                obj = json.loads(msg)
            except Exception:
                continue
            if obj.get("type") == "input":
                TM.write(obj.get("data", ""))
            elif obj.get("type") == "resize":
                TM.resize(obj.get("cols", 80), obj.get("rows", 24))
    except Exception:
        pass
    finally:
        EVENTS.remove(ws)


@sock.route("/ws/events")
def ws_events(ws):
    EVENTS.add(ws, "events")
    # Gửi snapshot ngay khi kết nối
    try:
        EVENTS.push("events", {"type": "status", "status": status_dict()})
        EVENTS.push("events", {"type": "botsnapshot", "bots": sorted(running_bots())})
        while True:
            if ws.receive() is None:
                break
    except Exception:
        pass
    finally:
        EVENTS.remove(ws)


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    print(f"[WEB] Bảng điều khiển: http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, threaded=True)
