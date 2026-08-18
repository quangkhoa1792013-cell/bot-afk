'use strict';
/* Smoke test cho tính năng Profile (Web-in-Web):
 * CRUD /api/profiles, gửi mail tới assigned_email, lọc mail theo profile,
 * đếm unreadCount, SSE new-mail kèm profileIds.
 */
const { spawn } = require('node:child_process');
const nodemailer = require('nodemailer');
const path = require('node:path');

const SMTP_PORT = 2525;
const WEB_PORT = 3100;
const API = `http://127.0.0.1:${WEB_PORT}/api`;
const DOMAIN = 'khoablabla.ddns.net';
const DATA_DIR = '/tmp/opencode/profile-smoke-data';

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiJson(p, opts = {}, retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API}${p}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
      if (res.ok) return { status: res.status, data: await res.json() };
      return { status: res.status, data: await res.json() };
    } catch { await sleep(500); }
  }
  throw new Error(`API timeout: ${p}`);
}

async function main() {
  console.log('== Khởi động app (test profile) ==');
  const fs = require('node:fs');
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const app = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, SMTP_PORT: String(SMTP_PORT), WEB_PORT: String(WEB_PORT), DATA_DIR },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  try {
    await apiJson('/health');
    console.log('  App sẵn sàng.');

    // ===== CRUD =====
    console.log('\n== CRUD Profile ==');
    const p1 = await apiJson('/profiles', { method: 'POST', body: JSON.stringify({
      name: 'Discord Bot 01', assignedEmail: `bot01@${DOMAIN}`, targetUrl: 'http://localhost:8080',
      notes: 'Verify OTP Discord', status: 'active' }) });
    check('Tạo Profile 201', p1.status === 201, String(p1.status));
    check('Email lowercase', p1.data.assignedEmail === `bot01@${DOMAIN}`);
    const pid = p1.data.id;

    const dupName = await apiJson('/profiles', { method: 'POST', body: JSON.stringify({ name: 'Discord Bot 01', assignedEmail: 'x@y.com' }) });
    check('Trùng tên -> 409', dupName.status === 409, String(dupName.status));
    const dupEmail = await apiJson('/profiles', { method: 'POST', body: JSON.stringify({ name: 'Khác', assignedEmail: `bot01@${DOMAIN}` }) });
    check('Trùng email -> 409', dupEmail.status === 409, String(dupEmail.status));
    const badUrl = await apiQuery('/profiles', { method: 'POST', body: JSON.stringify({ name: 'X', assignedEmail: 'x@y.com', targetUrl: 'ftp://x' }) });
    check('target_url không http -> 400', badUrl.status === 400, String(badUrl.status));
    const badEmail = await apiQuery('/profiles', { method: 'POST', body: JSON.stringify({ name: 'X', assignedEmail: 'khong-phai-email' }) });
    check('email không hợp lệ -> 400', badEmail.status === 400, String(badEmail.status));

    const p2 = await apiJson('/profiles', { method: 'POST', body: JSON.stringify({
      name: 'Shopee Bot', assignedEmail: `shopee@${DOMAIN}`, targetUrl: '', status: 'inactive' }) });
    check('Tạo Profile 2 (inactive)', p2.status === 201, String(p2.status));

    const patch = await apiJson(`/profiles/${pid}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Sửa xong', targetUrl: 'http://localhost:9090' }) });
    check('PATCH Profile 200', patch.status === 200);
    check('PATCH đổi notes', patch.data.notes === 'Sửa xong');
    check('PATCH đổi targetUrl', patch.data.targetUrl === 'http://localhost:9090');

    const del = await apiJson(`/profiles/${p2.data.id}`, { method: 'DELETE' });
    check('DELETE Profile 200', del.status === 200);
    const notFound = await apiJson(`/profiles/${p2.data.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'x' }) });
    check('PATCH Profile không tồn tại -> 404', notFound.status === 404, String(notFound.status));

    // ===== Gửi mail tới assigned_email =====
    console.log('\n== Mail tới assigned_email ==');
    const smtp = nodemailer.createTransport({ host: '127.0.0.1', port: SMTP_PORT, secure: false, tls: { rejectUnauthorized: false } });
    await smtp.sendMail({
      from: 'discord@email.com',
      to: `bot01@${DOMAIN}`,
      subject: 'Mã xác nhận của bạn',
      text: 'Mã xác nhận: 123456',
    });
    console.log('  ✔ Đã gửi mail OTP -> bot01@');

    // Danh sách profiles có unreadCount tăng
    let profs = [];
    for (let i = 0; i < 20; i++) {
      profs = (await apiJson('/profiles')).data.profiles;
      if (profs.find((p) => p.id === pid)?.unreadCount > 0) break;
      await sleep(500);
    }
    const me = profs.find((p) => p.id === pid);
    check('unreadCount của Profile = 1', me?.unreadCount === 1, `(got ${me?.unreadCount})`);
    check('mailCount của Profile = 1', me?.mailCount === 1, `(got ${me?.mailCount})`);

    // Lọc mail theo profile
    const profMails = (await apiJson(`/profiles/${pid}/mails?limit=50`)).data.messages;
    check('GET /profiles/:id/mails trả đúng mail', profMails.length === 1 && profMails[0].toAddr === `bot01@${DOMAIN}` && profMails[0].otp === '123456',
      JSON.stringify(profMails.map((m) => ({ to: m.toAddr, otp: m.otp }))));

    // Search trong mail của profile
    const search = (await apiJson(`/profiles/${pid}/mails?search=123456`)).data.messages;
    check('Search OTP trong profile mails', search.length === 1, String(search.length));
    const noMatch = (await apiJson(`/profiles/${pid}/mails?search=zzzz`)).data.messages;
    check('Search không khớp -> rỗng', noMatch.length === 0, String(noMatch.length));

    // Mail gửi tới địa chỉ thuộc mailbox khác (không phải assigned_email) không làm bẩn danh sách
    await apiJson('/mailboxes', { method: 'POST', body: JSON.stringify({ name: 'other' }) });
    await smtp.sendMail({ from: 'a@b.c', to: `other@${DOMAIN}`, subject: 'x', text: 'y' });
    await sleep(500);
    const profMails2 = (await apiJson(`/profiles/${pid}/mails`)).data.messages;
    check('Mail địa chỉ khác không xuất hiện trong profile', profMails2.length === 1, String(profMails2.length));

    // ===== SSE: new-mail có profileIds =====
    console.log('\n== SSE profileIds ==');
    // Mở kết nối SSE (trả promise) KHÔNG await — gửi mail xong mới chờ event
    const ssePromise = new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      fetch(`${API}/events`, { signal: ctrl.signal })
        .then((res) => {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          let timer = setTimeout(() => { ctrl.abort(); reject(new Error('SSE timeout')); }, 20000);
          const pump = async () => {
            const { done, value } = await reader.read();
            if (done) return;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split('\n\n');
            buf = parts.pop() ?? '';
            for (const part of parts) {
              const evtLine = part.split('\n').find((l) => l.startsWith('event: '));
              const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
              if (evtLine?.endsWith('new-mail') && dataLine) {
                clearTimeout(timer);
                resolve({ close: () => ctrl.abort(), data: JSON.parse(dataLine.slice(6)) });
                return;
              }
            }
            void pump();
          };
          void pump();
        })
        .catch(reject);
    });
    // Hành động tạo mail — xảy ra TRONG LÚC SSE đang mở
    const sseMail = await apiJson('/profiles', { method: 'POST', body: JSON.stringify({ name: 'SSE Bot', assignedEmail: `sse@${DOMAIN}` }) });
    await smtp.sendMail({ from: 'a@b.c', to: `sse@${DOMAIN}`, subject: 'sse test', text: 'hello' });
    // Giờ mới chờ event new-mail
    const sse = await ssePromise;
    check('SSE new-mail có profileIds khớp', Array.isArray(sse.data.profileIds) && sse.data.profileIds.includes(sseMail.data.id),
      JSON.stringify(sse.data.profileIds));
    check('SSE new-mail có message', !!sse.data.message?.id);
    sse.close();

    // Xóa profile khỏi file -> file profiles.json tồn tại trong data dir
    check('profiles.json được tạo', fs.existsSync(path.join(DATA_DIR, 'profiles.json')));

    console.log(`\n== KẾT QUẢ PROFILE: ${passed} passed, ${failed} failed ==`);
  } catch (err) {
    failed++;
    console.error('\nLỗi:', err.message);
  } finally {
    app.kill('SIGTERM');
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 500);
  }
}

// fetch không abort trả error -> dùng helper riêng để bắt status lỗi
async function apiQuery(p, opts) {
  const res = await fetch(`${API}${p}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

main();