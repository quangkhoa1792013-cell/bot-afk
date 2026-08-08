/* ==========================================================
   BẢNG ĐIỀU KHIỂN TRUNG TÂM - JS
   - Mọi dữ liệu live qua WebSocket (không re-render, không giật)
   - Hover đổi tab chỉ riêng tab Quản lý Bot
   - 2 chế độ log: chia ô (kiểu ttyd) / một ô
   ========================================================== */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const HOVER_DELAY = 120;
  const hoverEnabled = localStorage.getItem("hover_tabs") !== "off";
  const MAX_LOG_LINES = 600;

  let activeTab = "overview";
  let hoverTimer = null;
  let term = null;
  let wsTerm = null;
  let wsEvents = null;

  /* ---------- Trạng thái client ---------- */
  const logBuf = {};            // bot -> mảng dòng đã đọc (đổi bot KHÔNG cần fetch lại)
  const botStates = {};         // bot -> {running, active, log_size}
  let statusData = {};
  let currentLogBot = null;
  let splitMode = localStorage.getItem("split_mode") === "1";
  let captchas = [];

  /* ============ TOAST ============ */
  function toast(msg, isError) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 3200);
  }

  /* ============ HOVER ĐỔI TAB (chỉ tab Quản lý Bot) ============ */
  const tabbar = $("#tabbar");
  const indicator = $("#tab-indicator");

  function moveIndicator(tab) {
    indicator.style.left = tab.offsetLeft + "px";
    indicator.style.width = tab.offsetWidth + "px";
  }

  function activateTab(name, viaHover) {
    if (name === activeTab) return;
    activeTab = name;
    $$(".tab").forEach((t) => {
      const isActive = t.dataset.tab === name;
      t.classList.toggle("active", isActive);
      if (isActive) moveIndicator(t);
    });
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
    if (name === "captcha") refreshCaptchas();
    if (name === "manage") renderBotSelector();
    if (name === "control" && term) setTimeout(() => term.focus(), 120);
  }

  tabbar.addEventListener("mouseover", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab || !hoverEnabled || tab.dataset.tab !== "manage") return;
    tab.classList.add("hover-highlight");
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      activateTab("manage", true);
      $$(".tab").forEach((t) => t.classList.remove("hover-highlight"));
    }, HOVER_DELAY);
  });
  tabbar.addEventListener("mouseout", (e) => {
    if (e.target.closest(".tab")) {
      clearTimeout(hoverTimer);
      e.target.closest(".tab").classList.remove("hover-highlight");
    }
  });
  tabbar.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    clearTimeout(hoverTimer);
    activateTab(tab.dataset.tab);
  });

  document.addEventListener("keydown", (e) => {
    const map = { "1": "overview", "2": "control", "3": "manage", "4": "captcha" };
    if (e.altKey && map[e.key]) activateTab(map[e.key]);
  });

  /* ============ RENDER MÀU ANSI + § ============ */
  const ANSI_FG = ["#1e1e1e", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5"];
  const ANSI_FG_BRIGHT = ["#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"];
  const ANSI_BG = ["#1e1e1e", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5"];
  const MC_COLORS = {
    "0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA",
    "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
    "8": "#555555", "9": "#5555FF", a: "#55FF55", b: "#55FFFF",
    c: "#FF5555", d: "#FF55FF", e: "#FFFF55", f: "#FFFFFF",
  };

  function xterm256(n) {
    if (n < 16) return n < 8 ? ANSI_FG[n] : ANSI_FG_BRIGHT[n - 8];
    if (n < 232) {
      const v = [0, 95, 135, 175, 215, 255];
      const i = n - 16;
      return "#" + [v[Math.floor(i / 36) % 6], v[Math.floor(i / 6) % 6], v[i % 6]]
        .map((x) => x.toString(16).padStart(2, "0")).join("");
    }
    const g = 8 + (n - 232) * 10;
    return "#" + [g, g, g].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  function applySgr(code, st) {
    const cs = code.split(";");
    for (let i = 0; i < cs.length; i++) {
      const c = parseInt(cs[i], 10);
      if (isNaN(c)) continue;
      if (c === 0) { st.fg = null; st.bg = null; st.bold = st.italic = st.underline = st.strike = false; }
      else if (c === 1) st.bold = true;
      else if (c === 3) st.italic = true;
      else if (c === 4) st.underline = true;
      else if (c === 9) st.strike = true;
      else if (c >= 30 && c <= 37) st.fg = ANSI_FG[c - 30];
      else if (c >= 90 && c <= 97) st.fg = ANSI_FG_BRIGHT[c - 90];
      else if (c >= 40 && c <= 47) st.bg = ANSI_BG[c - 40];
      else if (c === 39) st.fg = null;
      else if (c === 49) st.bg = null;
      else if (c === 38 && cs[i + 1] === "5") { st.fg = xterm256(parseInt(cs[i + 2], 10)); i += 2; }
      else if (c === 48 && cs[i + 1] === "5") { st.bg = xterm256(parseInt(cs[i + 2], 10)); i += 2; }
      else if (c === 38 && cs[i + 1] === "2") { st.fg = `rgb(${cs[i+2]},${cs[i+3]},${cs[i+4]})`; i += 4; }
      else if (c === 48 && cs[i + 1] === "2") { st.bg = `rgb(${cs[i+2]},${cs[i+3]},${cs[i+4]})`; i += 4; }
    }
  }

  function applyMc(code, st) {
    if (code === "r" || code === "7") { st.fg = null; st.bg = null; st.bold = st.italic = st.underline = st.strike = false; }
    else if (MC_COLORS[code]) st.fg = MC_COLORS[code];
    else if (code === "l") st.bold = true;
    else if (code === "o") st.italic = true;
    else if (code === "n") st.underline = true;
    else if (code === "m") st.strike = true;
  }

  function colorizeLine(line) {
    const st = { fg: null, bg: null, bold: false, italic: false, underline: false, strike: false };
    let html = "";
    let buf = "";
    const flush = () => {
      if (!buf) return;
      const styled = st.fg || st.bg || st.bold || st.italic || st.underline || st.strike;
      html += styled ? `<span style="${styleStr(st)}">${esc(buf)}</span>` : esc(buf);
      buf = "";
    };
    let i = 0;
    while (i < line.length) {
      if (line[i] === "\x1b" && line[i + 1] === "[") {
        const end = line.indexOf("m", i);
        if (end !== -1) { flush(); applySgr(line.slice(i + 2, end), st); i = end + 1; continue; }
      }
      if (line[i] === "§" && i + 1 < line.length) {
        flush(); applyMc(line[i + 1].toLowerCase(), st); i += 2; continue;
      }
      buf += line[i];
      i++;
    }
    flush();
    return html;
  }

  function styleStr(st) {
    const parts = [];
    if (st.fg) parts.push(`color:${st.fg}`);
    if (st.bg) parts.push(`background:${st.bg}`);
    if (st.bold) parts.push("font-weight:bold");
    if (st.italic) parts.push("font-style:italic");
    if (st.underline || st.strike) parts.push("text-decoration:" + (st.underline ? "underline" : "line-through"));
    return parts.join(";");
  }

  function makeLineEl(line) {
    const div = document.createElement("div");
    div.innerHTML = colorizeLine(line) || "&nbsp;";
    return div;
  }

  /* ============ SỰ KIỆN LIVE (WebSocket /ws/events) ============ */
  function connectEvents() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    wsEvents = new WebSocket(`${proto}://${location.host}/ws/events`);
    wsEvents.onmessage = (ev) => {
      try { handleEvent(JSON.parse(ev.data)); } catch (e) {}
    };
    wsEvents.onclose = () => setTimeout(connectEvents, 1500);
    wsEvents.onerror = () => wsEvents.close();
  }

  function handleEvent(msg) {
    if (msg.type === "status") {
      statusData = msg.status;
      applyStatus();
    } else if (msg.type === "log") {
      appendBotLines(msg.bot, msg.lines);
    } else if (msg.type === "logreset") {
      // Bot vừa khởi động -> BỎ LOG CŨ
      delete logBuf[msg.bot];
      const pane = $("#split-pane-" + cssSafe(msg.bot));
      if (pane) pane.querySelector(".split-body").innerHTML = "";
      if (!splitMode && currentLogBot === msg.bot)
        $("#bot-log").innerHTML = '<span style="opacity:.5">(bot đang khởi động — chờ log mới...)</span>';
    } else if (msg.type === "botstate") {
      if (botStates[msg.bot]) botStates[msg.bot].running = msg.running;
      updateBotDots();
      if (splitMode) rebuildSplitGrid();
      if (!splitMode && currentLogBot === msg.bot) renderLogFromBuf(msg.bot, true);
    } else if (msg.type === "captcha") {
      captchas.unshift(msg);
      if (captchas.length > 30) captchas.pop();
      if (activeTab === "captcha") renderCaptchas();
      $("#ov-captcha").textContent = captchas.length;
    }
  }

  function applyStatus() {
    const s = statusData;
    if (!s) return;
    setPill("pill-bots", s.bots, s.bots ? "Bots: chạy" : "Bots: tắt");
    setPill("pill-terminal", s.terminal, `Terminal: ${s.terminal ? "chạy" : "tắt"}`);
    setPill("pill-discord", s.discord, `Discord: ${s.discord ? "chạy" : "tắt"}`);
    $("#ov-bots").textContent = s.bots ? "ĐANG CHẠY" : "ĐÃ TẮT";
    $("#ov-bots-sub").textContent = s.bots ? "tmux session mc_bots hoạt động" : "tmux session đang tắt";
    $("#ov-accounts").textContent = s.accounts_active + " / " + s.accounts_total;
    $("#ov-uptime").textContent = s.uptime || "—";
    $("#ov-disk").textContent = "Đĩa trống: " + s.disk;
    $("#mg-count").textContent = s.accounts_total;
    $("#clock").textContent = s.time;
    const ds = $("#discord-status");
    if (ds) {
      ds.className = "discord-status";
      ds.innerHTML = `<span class="pulse-dot"></span> Discord bridge: ${s.discord ? "đang chạy ✅" : "chưa chạy ❌"} — tài khoản: <b>${esc(s.discord_account || "?")}</b>`;
      const b1 = $("#btn-bridge-start"), b2 = $("#btn-bridge-stop");
      b1.disabled = !!s.discord; b2.disabled = !s.discord;
    }
  }

  function setPill(id, on, text) {
    const el = $("#" + id);
    el.className = "status-pill " + (on ? "on" : "off");
    el.querySelector(".pill-text").textContent = text;
  }

  /* ============ LOG THEO TỪNG BOT (append-only, không giật) ============ */
  function ensureBuf(bot) {
    if (!logBuf[bot]) logBuf[bot] = [];
    return logBuf[bot];
  }

  async function loadInitialLog(bot) {
    try {
      const r = await fetch(`/api/botlog/${encodeURIComponent(bot)}`);
      const j = await r.json();
      if (!j.lines) return;
      if (j.running === false) return;   // bot tắt -> không nạp log cũ
      ensureBuf(bot).push(...j.lines);
      trimBuf(bot);
      if (activeTab !== "manage") return;
      if (!splitMode && bot === currentLogBot) renderLogFromBuf(bot, true);
      if (splitMode) rebuildSplitGrid();
    } catch (e) {}
  }

  function trimBuf(bot) {
    const b = ensureBuf(bot);
    if (b.length > MAX_LOG_LINES) b.splice(0, b.length - MAX_LOG_LINES);
  }

  function appendBotLines(bot, lines) {
    ensureBuf(bot).push(...lines);
    trimBuf(bot);
    if (activeTab !== "manage") return;
    if (!splitMode) {
      if (bot === currentLogBot) appendLinesToEl($("#bot-log"), lines);
    } else {
      const pane = $("#split-pane-" + cssSafe(bot));
      if (pane) appendLinesToEl(pane.querySelector(".split-body"), lines);
    }
  }

  function appendLinesToEl(pre, lines) {
    if (!pre) return;
    const wasBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 80;
    const frag = document.createDocumentFragment();
    for (const l of lines) frag.appendChild(makeLineEl(l));
    pre.appendChild(frag);
    while (pre.childElementCount > MAX_LOG_LINES) pre.removeChild(pre.firstChild);
    if ($("#lv-auto").checked && wasBottom) pre.scrollTop = pre.scrollHeight;
  }

  function renderLogFromBuf(bot, forceScroll) {
    const pre = $("#bot-log");
    $("#chat-target").textContent = "🤖 " + (bot || "—");
    $("#chat-input").placeholder = bot
      ? `Nhắn chat cho '${bot}'... (Enter để gửi)`
      : "Chọn một bot ở danh sách bên trên...";
    if (!bot) { pre.innerHTML = '<span style="opacity:.5">Chọn một bot để xem log & chat...</span>'; return; }
    const st = botStates[bot];
    if (!st || !st.running) {
      // Bot tắt -> báo OFF rõ ràng, không hiện log cũ
      pre.innerHTML = '<span class="off-line">⏹ Bot đang TẮT</span>';
      return;
    }
    pre.innerHTML = "";
    const b = ensureBuf(bot);
    if (!b.length) {
      pre.innerHTML = '<span style="opacity:.5">(chưa có log — bot chưa ghi gì)</span>';
      return;
    }
    appendLinesToEl(pre, b);
    pre.scrollTop = pre.scrollHeight;
  }

  function cssSafe(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  /* ============ NHẮN CHAT VÀO BOT ============ */
  function appendLocalChat(bot, msg) {
    const line = `§7➤ [bạn → ${bot}]: §f${msg}`;
    ensureBuf(bot).push(line);
    trimBuf(bot);
    if (activeTab !== "manage") return;
    if (!splitMode) {
      if (bot === currentLogBot) appendLinesToEl($("#bot-log"), [line]);
    } else {
      const pane = $("#split-pane-" + cssSafe(bot));
      if (pane) appendLinesToEl(pane.querySelector(".split-body"), [line]);
    }
  }

  async function sendChat() {
    const bot = currentLogBot;
    const input = $("#chat-input");
    const msg = input.value.trim();
    if (!bot) return toast("❌ Chọn một bot trước", true);
    if (!msg) return;
    if (!botStates[bot] || !botStates[bot].running)
      return toast("❌ Bot đang TẮT — không gửi được", true);
    input.disabled = true;
    try {
      const r = await fetch("/api/bot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot, message: msg }),
      });
      const j = await r.json();
      if (j.ok) {
        appendLocalChat(bot, msg);
        input.value = "";
        toast("💬 Đã gửi: " + msg);
      } else toast("❌ " + (j.error || "Lỗi"), true);
    } catch (e) {
      toast("❌ Không kết nối được server", true);
    }
    input.disabled = false;
    input.focus();
  }
  $("#chat-send").addEventListener("click", sendChat);
  $("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  /* ---------- Danh sách nút chọn bot ---------- */
  async function refreshBotStatuses() {
    try {
      const list = await (await fetch("/api/bots/status")).json();
      list.forEach((b) => {
        botStates[b.name] = { running: b.running, active: b.active, log_size: b.log_size };
        if (!logBuf[b.name] && b.running) loadInitialLog(b.name);
      });
      renderBotSelector();
    } catch (e) {}
  }

  function renderBotSelector() {
    const names = Object.keys(botStates).sort();
    const box = $("#lv-bots");
    if (!names.length) { box.innerHTML = `<span class="placeholder">Chưa có bot nào.</span>`; return; }
    if (!names.includes(currentLogBot)) {
      currentLogBot = names.find((n) => botStates[n].running) || names[0];
    }
    box.innerHTML = names.map((n) => {
      const st = botStates[n];
      const state = st.running ? "running" : (st.active !== false ? "stopped" : "off");
      const size = st.log_size > 0 ? fmtSize(st.log_size) : "";
      return `<button class="lv-btn ${state} ${n === currentLogBot ? "active" : ""}" data-name="${esc(n)}">
        <span class="pulse-dot"></span>${esc(n)}<span class="lv-size">${size}</span>
      </button>`;
    }).join("");
    box.querySelectorAll(".lv-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentLogBot = btn.dataset.name;
        renderBotSelector();
        renderLogFromBuf(currentLogBot, true);
      });
    });
    if (!splitMode) renderLogFromBuf(currentLogBot, true);
  }

  function updateBotDots() {
    $$(".lv-btn").forEach((btn) => {
      const st = botStates[btn.dataset.name];
      if (!st) return;
      btn.classList.toggle("running", st.running);
      btn.classList.toggle("stopped", !st.running && st.active !== false);
    });
    $$(".acc-card").forEach((card) => {
      const st = botStates[card.dataset.name];
      const dot = card.querySelector(".acc-dot");
      if (st && dot) dot.className = "acc-dot " + (st.running ? "run" : "idle");
    });
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  /* ============ CHẾ ĐỘ CHIA Ô (kiểu ttyd) ============ */
  function rebuildSplitGrid() {
    const grid = $("#split-grid");
    if (!grid) return;
    // Chỉ hiện NHỮNG BOT ĐANG CHẠY (chạy bao nhiêu hiện bấy nhiêu)
    const names = Object.keys(botStates)
      .filter((n) => botStates[n].running)
      .sort((a, b) => a.localeCompare(b));
    if (!names.length) { grid.innerHTML = `<span class="placeholder">Chưa có bot nào đang chạy.</span>`; return; }
    grid.querySelectorAll(".split-pane").forEach((p) => {
      if (!names.includes(p.dataset.bot)) p.remove();
    });
    const have = new Set();
    grid.querySelectorAll(".split-pane").forEach((p) => have.add(p.dataset.bot));
    for (const n of names) {
      if (have.has(n)) continue;
      const pane = document.createElement("div");
      pane.className = "split-pane";
      pane.dataset.bot = n;
      pane.id = "split-pane-" + cssSafe(n);
      pane.innerHTML = `<div class="split-head"><span class="pulse-dot"></span>${esc(n)}</div><div class="split-body"></div>`;
      grid.appendChild(pane);
    }
    for (const n of names) {
      const pane = $("#split-pane-" + cssSafe(n));
      if (!pane) continue;
      const dot = pane.querySelector(".pulse-dot");
      dot.className = "pulse-dot";
      const body = pane.querySelector(".split-body");
      if (body.childElementCount === 0) {
        body.innerHTML = "";
        const b = ensureBuf(n);
        if (b.length) appendLinesToEl(body, b);
        body.scrollTop = body.scrollHeight;
      }
    }
  }

  function applySplitMode() {
    $("#single-view").style.display = splitMode ? "none" : "";
    $("#split-grid").style.display = splitMode ? "" : "none";
    $("#btn-mode").textContent = splitMode ? "☰ Một ô" : "▤ Chia ô (ttyd)";
    localStorage.setItem("split_mode", splitMode ? "1" : "0");
    if (splitMode) rebuildSplitGrid();
  }

  /* ============ QUẢN LÝ BOT ============ */
  async function refreshAccounts() {
    try {
      const list = await (await fetch("/api/accounts")).json();
      renderAccounts(list);
    } catch (e) {}
  }

  function renderAccounts(list) {
    const box = $("#account-list");
    if (!list.length) {
      box.innerHTML = `<div class="placeholder">Chưa có tài khoản nào. Bấm "Thêm Bot mới".</div>`;
      return;
    }
    box.innerHTML = list.map((a) => {
      const st = botStates[a.name] || {};
      const running = !!st.running;
      return `
      <div class="acc-card" data-name="${esc(a.name)}">
        <div class="acc-head">
          <div class="acc-avatar">${a.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="acc-name">${esc(a.name)} <span class="acc-dot ${running ? "run" : "idle"}" title="${running ? "đang chạy" : "không chạy"}"></span></div>
            <div class="acc-detail">script: ${esc(a.script || "—")}</div>
          </div>
        </div>
        <div class="acc-actions">
          <button class="mini-btn ${a.active !== false ? "toggle-off" : "toggle-on"}" data-act="toggle" data-name="${esc(a.name)}">
            ${a.active !== false ? "⏸ Khóa" : "▶ Mở khóa"}
          </button>
          <button class="mini-btn del" data-act="delete" data-name="${esc(a.name)}">🗑 Xóa</button>
        </div>
      </div>`;
    }).join("");

    box.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.name;
        if (btn.dataset.act === "delete" && !confirm(`Xóa tài khoản '${name}' khỏi danh sách?`)) return;
        const url = btn.dataset.act === "toggle" ? "/api/accounts/toggle" : "/api/accounts/delete";
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          const j = await r.json();
          if (j.ok) { toast("✅ Đã lưu!"); refreshAccounts(); }
          else toast("❌ " + (j.error || "Lỗi"), true);
        } catch (e) { toast("❌ Lỗi kết nối", true); }
      });
    });
  }

  $("#btn-add-toggle").addEventListener("click", () => $("#add-form").classList.toggle("show"));
  $("#btn-add-save").addEventListener("click", async () => {
    const body = {
      name: $("#add-name").value.trim(),
      server: $("#add-server").value.trim() || "aquamc.vn",
      script: $("#add-script").value.trim() || "login_afk.txt",
    };
    if (!body.name) return toast("❌ Nhập tên tài khoản", true);
    try {
      const r = await fetch("/api/accounts/add", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.ok) {
        toast("✅ Đã thêm bot " + body.name);
        $("#add-name").value = ""; $("#add-form").classList.remove("show");
        refreshAccounts();
      } else toast("❌ " + (j.error || "Lỗi"), true);
    } catch (e) { toast("❌ Lỗi kết nối", true); }
  });

  /* ============ QUICK ACTIONS (điều khiển run.sh) ============ */
  async function runAction(action, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await fetch("/api/terminal/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (j.ok) toast("⚙️ " + j.message);
      else toast("❌ " + (j.error || "Lỗi"), true);
    } catch (e) {
      toast("❌ Không kết nối được server", true);
    }
    if (btn) setTimeout(() => (btn.disabled = false), 6000);
  }
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => runAction(btn.dataset.action, btn));
  });

  /* ============ TERMINAL (run.sh qua WebSocket) ============ */
  function initTerminal() {
    const host = $("#terminal");
    if (!host || term || typeof Terminal === "undefined") return;

    term = new Terminal({
      fontFamily: '"Cascadia Code", "Fira Code", monospace, monospace',
      fontSize: 13.5,
      cursorBlink: true,
      theme: {
        background: "#0b1120", foreground: "#dbe7f5", cursor: "#34d399",
        selectionBackground: "rgba(52,211,153,0.25)",
        black: "#0b1120", red: "#f87171", green: "#34d399", yellow: "#fbbf24",
        blue: "#60a5fa", magenta: "#a78bfa", cyan: "#22d3ee", white: "#dbe7f5",
      },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      wsTerm = new WebSocket(`${proto}://${location.host}/ws/term`);
      wsTerm.onopen = () => wsTerm.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      wsTerm.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "out") term.write(msg.data);
          else if (msg.type === "replay") { term.reset(); term.write(msg.data); }
        } catch (e) {}
      };
      wsTerm.onclose = () => setTimeout(connect, 1500);
      wsTerm.onerror = () => wsTerm.close();
    }
    term.onData((data) => {
      if (wsTerm && wsTerm.readyState === 1) wsTerm.send(JSON.stringify({ type: "input", data }));
    });
    host.addEventListener("click", () => term.focus());

    window.addEventListener("resize", () => {
      fit.fit();
      if (wsTerm && wsTerm.readyState === 1)
        wsTerm.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    });
    connect();
  }

  $("#btn-term-restart").addEventListener("click", async () => {
    toast("♻️ Đang mở lại terminal...");
    try {
      await fetch("/api/terminal/restart", { method: "POST" });
      if (wsTerm) wsTerm.close();
      setTimeout(() => { if (term) term.reset(); }, 400);
    } catch (e) { toast("❌ Lỗi", true); }
  });

  /* ============ CAPTCHA ============ */
  async function refreshCaptchas() {
    try {
      captchas = await (await fetch("/api/captchas")).json();
      renderCaptchas();
    } catch (e) {}
  }

  async function bridgeAction(action) {
    try {
      const r = await fetch("/api/captcha/bridge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (j.ok) toast("✅ " + j.message);
      else toast("❌ " + (j.error || "Lỗi"), true);
    } catch (e) { toast("❌ Lỗi kết nối", true); }
  }
  $("#btn-bridge-start").addEventListener("click", () => bridgeAction("start"));
  $("#btn-bridge-stop").addEventListener("click", () => bridgeAction("stop"));

  function renderCaptchas() {
    const grid = $("#captcha-grid");
    if (!captchas.length) {
      grid.innerHTML = `<div class="placeholder">Chưa có ảnh nào. Bot sẽ tự render khi nhận CAPTCHA.</div>`;
      $("#captcha-preview").innerHTML = `<span class="placeholder">Chưa có ảnh captcha</span>`;
      return;
    }
    grid.innerHTML = captchas.map((c, i) => `
      <div class="cap-thumb ${i === 0 ? "active" : ""}" data-file="${c.file}">
        <img src="/captcha_dumps/${c.file}" alt="captcha" loading="lazy">
        <div class="cap-time">${c.time}</div>
        <div class="cap-acc">${esc(c.account)}</div>
      </div>`).join("");
    grid.querySelectorAll(".cap-thumb").forEach((t) => {
      t.addEventListener("click", () => {
        grid.querySelectorAll(".cap-thumb").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        setPreview(t.dataset.file);
      });
    });
    setPreview(captchas[0].file);
  }

  function setPreview(file) {
    const c = captchas.find((x) => x.file === file) || {};
    $("#captcha-preview").innerHTML =
      `<img src="/captcha_dumps/${file}?t=${Date.now()}" alt="captcha">` +
      `<div class="preview-acc">👤 ${esc(c.account || "?")}</div>`;
  }

  $("#btn-captcha-submit").addEventListener("click", async () => {
    const code = $("#captcha-code").value.trim();
    if (!code) return toast("❌ Nhập mã captcha", true);
    try {
      const r = await fetch("/api/captcha/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (j.ok) { toast("✅ " + j.message); $("#captcha-code").value = ""; }
      else toast("❌ " + (j.error || "Lỗi"), true);
    } catch (e) { toast("❌ Lỗi kết nối", true); }
  });
  $("#captcha-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#btn-captcha-submit").click();
  });

  /* ============ LOG run.log (Tổng quan) ============ */
  async function refreshLog() {
    try {
      const j = await (await fetch("/api/log")).json();
      $("#log-content").textContent = j.log || "(run.log trống)";
    } catch (e) {}
  }
  setInterval(refreshLog, 8000);

  /* ============ UTIL ============ */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ============ INIT ============ */
  const hoverToggle = $("#hover-toggle");
  hoverToggle.classList.toggle("on", hoverEnabled);
  hoverToggle.querySelector(".toggle-label").textContent = hoverEnabled ? "Hover" : "Click";
  hoverToggle.addEventListener("click", () => {
    localStorage.setItem("hover_tabs", hoverEnabled ? "off" : "on");
    location.reload();
  });

  $("#btn-mode").addEventListener("click", () => {
    splitMode = !splitMode;
    applySplitMode();
  });

  applySplitMode();
  connectEvents();
  refreshStatusOnce();
  refreshAccounts();
  refreshLog();
  refreshBotStatuses();
  refreshCaptchas();
  const firstTab = $$(".tab").find((t) => t.classList.contains("active"));
  if (firstTab) moveIndicator(firstTab);
  initTerminal();

  function refreshStatusOnce() {
    fetch("/api/status").then((r) => r.json()).then((s) => { statusData = s; applyStatus(); }).catch(() => {});
  }
})();
