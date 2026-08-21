const { invoke } = window.__TAURI__.core
const { listen } = window.__TAURI__.event

const $ = (id) => document.getElementById(id)

let lastState = null
let cfgCache = null

function fmt(n, d = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return Number(n).toFixed(d)
}

function renderState(s) {
  lastState = s

  const badge = $('conn-badge')
  const text = $('conn-text')
  if (s.connected) {
    badge.className = 'badge online'
    text.textContent = s.mock ? 'Đã kết nối (MOCK)' : 'Đã kết nối'
  } else {
    badge.className = 'badge offline'
    text.textContent = 'Ngắt kết nối'
  }
  $('server-info').textContent = `${s.serverHost}:${s.serverPort} · ${s.version || '?'}`

  if (s.position) {
    $('pos-x').textContent = s.position.x.toFixed(1)
    $('pos-y').textContent = s.position.y.toFixed(1)
    $('pos-z').textContent = s.position.z.toFixed(1)
  }

  const mb = $('moving-badge')
  if (s.moving) {
    mb.textContent = `🏃 Đang di chuyển${s.target ? ` → (${s.target.x}, ${s.target.y}, ${s.target.z})` : ''}`
    mb.className = 'chip active'
  } else {
    mb.textContent = 'Đang đứng yên'
    mb.className = 'chip'
  }
  $('eating-badge').classList.toggle('hidden', !s.eating)

  const hp = Math.max(0, Math.min(20, s.health))
  $('hp-bar').style.width = `${(hp / 20) * 100}%`
  $('hp-num').textContent = `${Math.round(hp)}/20`
  $('food-bar').style.width = `${(Math.max(0, Math.min(20, s.food)) / 20) * 100}%`
  $('food-num').textContent = `${Math.round(s.food)}/20`

  const hpBar = $('hp-bar')
  hpBar.classList.toggle('warn-fill', hp <= 6)
  if (hp <= 6) hpBar.style.background = 'linear-gradient(90deg,#ff2222,#ff5555)'
  else hpBar.style.background = ''

  $('deaths-chip').textContent = `☠ Chết: ${s.deaths}`
  const up = s.uptimeSec
  const upStr =
    up >= 3600
      ? `${Math.floor(up / 3600)}h${Math.floor((up % 3600) / 60)}m`
      : up >= 60 ? `${Math.floor(up / 60)}m${up % 60}s` : `${up}s`
  $('uptime-chip').textContent = `⏱ ${upStr}`

  const errEl = $('last-error')
  if (s.lastError) {
    errEl.textContent = `⚠ ${s.lastError}`
    errEl.classList.remove('hidden')
  } else {
    errEl.classList.add('hidden')
  }

  $('bot-username').textContent = s.username || '—'
  $('bot-version').textContent = s.version || '—'
  $('bot-server').textContent = `${s.serverHost}:${s.serverPort}`
  $('bot-mock').textContent = s.mock ? 'Có' : 'Không'

  if (s.viewerUrl) {
    $('viewer-url-label').textContent = s.viewerUrl
  }
}

let viewerLoaded = false
function maybeLoadViewer(force = false) {
  const frame = $('viewer-frame')
  const ph = $('viewer-placeholder')
  if (lastState && lastState.viewerUrl && (force || !viewerLoaded)) {
    frame.src = lastState.viewerUrl
    frame.classList.remove('hidden')
    ph.classList.add('hidden')
    viewerLoaded = true
  } else if (!lastState || !lastState.viewerUrl) {
    frame.classList.add('hidden')
    ph.classList.remove('hidden')
  }
}

const LOG_MAX = 400
function appendLog(level, msg) {
  const box = $('log-box')
  const div = document.createElement('div')
  div.className = `log-line ${level}`
  const t = new Date().toLocaleTimeString()
  div.textContent = `[${t}] [${level}] ${msg}`
  box.appendChild(div)
  while (box.childElementCount > LOG_MAX) box.removeChild(box.firstChild)
  box.scrollTop = box.scrollHeight
}

async function refreshState() {
  try {
    renderState(await invoke('get_state'))
    maybeLoadViewer()
  } catch (e) {}
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'))
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'))
    btn.classList.add('active')
    $(`tab-${btn.dataset.tab}`).classList.add('active')
    if (btn.dataset.tab === 'viewer') maybeLoadViewer(true)
  })
})

$('btn-go').addEventListener('click', async () => {
  const x = parseFloat($('gx').value)
  const y = parseFloat($('gy').value)
  const z = parseFloat($('gz').value)
  if ([x, y, z].some((v) => Number.isNaN(v))) return
  try {
    appendLog('info', `Lệnh goto (${x}, ${y}, ${z})`)
    await invoke('goto', { x, y, z, timeoutMs: null })
  } catch (e) {
    appendLog('error', `goto thất bại: ${e}`)
  }
})

$('btn-stop').addEventListener('click', async () => {
  try {
    await invoke('stop_bot')
    appendLog('info', 'Đã gửi lệnh dừng')
  } catch (e) {
    appendLog('error', `dừng thất bại: ${e}`)
  }
})

$('btn-ping').addEventListener('click', async () => {
  try {
    const ms = await invoke('ping_bot')
    appendLog('info', `IPC pong: +${Date.now() - ms}ms`)
  } catch (e) {
    appendLog('error', `ping thất bại: ${e}`)
  }
})

$('btn-open-viewer-window').addEventListener('click', async () => {
  try {
    const url = await invoke('open_viewer')
    appendLog('info', `Đã mở viewer: ${url}`)
  } catch (e) {
    appendLog('error', String(e))
  }
})

$('btn-reload-viewer').addEventListener('click', () => {
  viewerLoaded = false
  maybeLoadViewer(true)
})

$('btn-copy-cur').addEventListener('click', () => {
  if (lastState && lastState.position) {
    $('gx').value = Math.floor(lastState.position.x)
    $('gy').value = Math.floor(lastState.position.y)
    $('gz').value = Math.floor(lastState.position.z)
  }
})

const SAVED_KEY = 'minebot_saved_coords'
function getSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || [] } catch { return [] }
}
function setSaved(list) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list))
}
function renderSaved() {
  const list = getSaved()
  const box = $('saved-list')
  box.innerHTML = ''
  list.forEach((item, idx) => {
    const el = document.createElement('span')
    el.className = 'saved-item'
    el.innerHTML = `<b>${item.name}</b><code>${item.x},${item.y},${item.z}</code><span class="del">✕</span>`
    el.addEventListener('click', (ev) => {
      if (ev.target.classList.contains('del')) {
        list.splice(idx, 1); setSaved(list); renderSaved(); return
      }
      $('gx').value = item.x; $('gy').value = item.y; $('gz').value = item.z
      $('btn-go').click()
    })
    box.appendChild(el)
  })
}
$('btn-save-coord').addEventListener('click', () => {
  const name = $('save-name').value.trim() || 'Point'
  const x = parseFloat($('gx').value), y = parseFloat($('gy').value), z = parseFloat($('gz').value)
  if ([x, y, z].some(Number.isNaN)) return
  const list = getSaved()
  list.push({ name, x, y, z })
  setSaved(list)
  $('save-name').value = ''
  renderSaved()
})
renderSaved()

$('btn-clear-log').addEventListener('click', () => ($('log-box').innerHTML = ''))

async function loadConfig() {
  try {
    cfgCache = await invoke('get_config')
    $('cfg-host').value = cfgCache.server.host
    $('cfg-port').value = cfgCache.server.port
    $('cfg-version').value = cfgCache.server.version || ''
    $('cfg-username').value = cfgCache.account.username || ''
    $('cfg-sprint').checked = cfgCache.movement.sprint
    $('cfg-parkour').checked = cfgCache.movement.allowParkour
    $('cfg-dig').checked = cfgCache.movement.canDig
    $('cfg-tol').value = cfgCache.movement.goalTolerance
    $('cfg-eat').checked = cfgCache.autoEat.enabled
    $('cfg-startat').value = cfgCache.autoEat.startAtFood
    $('cfg-lowhp').value = cfgCache.autoEat.lowHealth
    $('cfg-viewer').checked = cfgCache.viewer.enabled
    $('cfg-vport').value = cfgCache.viewer.port
  } catch (e) {
    appendLog('error', `không đọc được config: ${e}`)
  }
}

function collectConfig() {
  return {
    server: {
      host: $('cfg-host').value,
      port: parseInt($('cfg-port').value) || 25565,
      version: $('cfg-version').value.trim(),
    },
    account: { username: $('cfg-username').value.trim() },
    movement: {
      sprint: $('cfg-sprint').checked,
      allowParkour: $('cfg-parkour').checked,
      canDig: $('cfg-dig').checked,
      goalTolerance: parseFloat($('cfg-tol').value) || 1.0,
    },
    autoEat: {
      enabled: $('cfg-eat').checked,
      startAtFood: parseInt($('cfg-startat').value) || 14,
      lowHealth: parseInt($('cfg-lowhp').value) || 10,
    },
    viewer: {
      enabled: $('cfg-viewer').checked,
      port: parseInt($('cfg-vport').value) || 3001,
      firstPerson: false,
    },
  }
}

$('btn-save-cfg').addEventListener('click', async () => {
  try {
    const path = await invoke('save_config', { config: collectConfig() })
    $('cfg-status').textContent = `✔ Đã lưu: ${path} — restart bot để áp dụng toàn bộ.`
    appendLog('info', `config saved -> ${path}`)
  } catch (e) {
    $('cfg-status').textContent = `✖ Lỗi: ${e}`
  }
})

$('btn-apply-runtime').addEventListener('click', async () => {
  try {
    const patch = {
      sprint: $('cfg-sprint').checked,
      allowParkour: $('cfg-parkour').checked,
      canDig: $('cfg-dig').checked,
      autoEatStartAtFood: parseInt($('cfg-startat').value) || 14,
      autoEatLowHealth: parseInt($('cfg-lowhp').value) || 10,
    }
    await invoke('set_config_runtime', { patch })
    $('cfg-status').textContent = '✔ Đã áp dụng runtime cho bot đang chạy.'
  } catch (e) {
    $('cfg-status').textContent = `✖ Lỗi: ${e}`
  }
})

window.addEventListener('DOMContentLoaded', async () => {
  await listen('bot-event', (ev) => {
    const payload = ev.payload
    if (!payload || !payload.event) return
    if (payload.event === 'state') {
      renderState(payload.data)
    } else if (payload.event === 'log') {
      appendLog(payload.data.level || 'info', payload.data.msg || '')
    } else if (payload.event === 'death') {
      appendLog('warn', 'Bot đã chết!')
    } else if (payload.event === 'spawn') {
      appendLog('info', 'Bot đã vào thế giới (spawn)')
    }
  })

  setInterval(refreshState, 1000)
  await loadConfig()
  await refreshState()
})
