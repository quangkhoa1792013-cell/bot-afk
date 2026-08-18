/**
 * Smoke test end-to-end (model địa chỉ hòm thư):
 *  - Spawn app (SMTP_PORT=2525, WEB_PORT=3100 - không cần sudo)
 *  - Tạo 2 địa chỉ qua API: test@..., shop@...
 *  - Gửi mail qua SMTP: 2 mail tới test@, 1 mail tới shop@ (attachment)
 *  - Verify: OTP extractor, link kích hoạt, download attachment, CRUD, mailCount
 *  - Verify: địa chỉ CHƯA tạo bị từ chối (550)
 *
 * Chạy:  node test/smoke.js
 */
'use strict';

const { spawn } = require('node:child_process');
const nodemailer = require('nodemailer');
const path = require('node:path');

const SMTP_PORT = 2525;
const WEB_PORT = 3100;
const API = `http://127.0.0.1:${WEB_PORT}/api`;
const DOMAIN = 'khoablabla.ddns.net';

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiJson(path, opts = {}, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      if (res.ok) return { status: res.status, data: await res.json() };
      return { status: res.status, data: await res.json() };
    } catch { await sleep(500); }
  }
  throw new Error(`API timeout: ${path}`);
}

async function main() {
  console.log('== Khởi động app (test mode, không sudo) ==');
  const app = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      SMTP_PORT: String(SMTP_PORT),
      WEB_PORT: String(WEB_PORT),
      MAIL_TTL_HOURS: '24',
      DATA_DIR: '/tmp/opencode/smoke-data',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', (d) => process.stdout.write(`  [app] ${d}`));
  app.stderr.on('data', (d) => process.stdout.write(`  [app-err] ${d}`));

  try {
    // Đợi app sẵn sàng
    await apiJson('/health', {}, 40);
    console.log('  App đã sẵn sàng.');

    // ============ 1. Tạo địa chỉ ============
    console.log('\n== Tạo địa chỉ hòm thư ==');
    const m1 = await apiJson('/mailboxes', { method: 'POST', body: JSON.stringify({ name: 'test', note: 'Hòm test' }) });
    const m2 = await apiJson('/mailboxes', { method: 'POST', body: JSON.stringify({ name: 'shop', note: 'Mua sắm' }) });
    check('Tạo test@ 201', m1.status === 201, String(m1.status));
    check('Tạo shop@ 201', m2.status === 201, String(m2.status));
    const dup = await apiJson('/mailboxes', { method: 'POST', body: JSON.stringify({ name: 'test' }) });
    check('Tạo trùng tên -> 409', dup.status === 409, String(dup.status));
    const bad = await apiJson('/mailboxes', { method: 'POST', body: JSON.stringify({ name: 'VẢI ÔI@@' }) });
    check('Tên không hợp lệ -> 400', bad.status === 400, String(bad.status));

    // ============ 2. Gửi mail qua SMTP ============
    console.log('\n== Gửi mail tới địa chỉ đã tạo ==');
    const smtp = nodemailer.createTransport({
      host: '127.0.0.1',
      port: SMTP_PORT,
      secure: false,
      tls: { rejectUnauthorized: false },
    });

    await smtp.sendMail({
      from: 'shop-online@gmail.com',
      to: `test@${DOMAIN}`,
      subject: 'Mã xác nhận đăng nhập',
      text: 'Xin chào,\nMã xác nhận của bạn là: 482913\nMã có hiệu lực trong 5 phút.',
    });
    console.log('  ✔ Mail VN -> test@ (OTP 482913)');

    await smtp.sendMail({
      from: '"Netflix" <no-reply@netflix.com>',
      to: `shop@${DOMAIN}`,
      subject: 'Your verification code',
      html: '<p>Your verification code is <b>719284</b></p><p>Or activate: <a href="https://auth.netflix.com/activate?code=719284">click here</a></p>',
    });
    console.log('  ✔ Mail EN -> shop@ (OTP 719284)');

    await smtp.sendMail({
      from: 'billing@bank.vn',
      to: `test@${DOMAIN}`,
      subject: 'Hóa đơn điện tử',
      text: 'Hóa đơn tháng 8 đính kèm.',
      attachments: [{ filename: 'invoice.txt', content: 'TONG TIEN: 1.200.000 VND\nThanks!' }],
    });
    console.log('  ✔ Mail attachment -> test@');

    // Gửi tới địa chỉ CHƯA tạo -> phải bị từ chối 550
    console.log('\n== Từ chối địa chỉ chưa tạo ==');
    let rejected = false;
    try {
      await smtp.sendMail({ from: 'a@b.c', to: `khongton-tai@${DOMAIN}`, subject: 'x', text: 'y' });
    } catch (err) {
      rejected = /550/.test(err.message);
    }
    check('Mail tới địa chỉ chưa tạo bị từ chối 550', rejected);

    // ============ 3. Verify qua API ============
    console.log('\n== Verify qua API ==');
    let list;
    for (let i = 0; i < 20; i++) {
      list = (await apiJson('/mails?folder=inbox&limit=50')).data.messages;
      if (list.length >= 3) break;
      await sleep(500);
    }
    check('Nhận đủ 3 mail', list.length >= 3, `(có ${list.length})`);

    const mailVn = list.find((m) => m.subject === 'Mã xác nhận đăng nhập');
    check('Subject VN đúng', !!mailVn, JSON.stringify(list.map((m) => m.subject)));
    check('To đúng địa chỉ test@', mailVn?.toAddr === `test@${DOMAIN}`);

    const mailEn = list.find((m) => m.subject === 'Your verification code');
    check('OTP tiếng Anh (719284)', mailEn?.otp === '719284', `(got ${mailEn?.otp})`);
    check('Link kích hoạt được bóc', !!mailEn && mailEn.urlsJson.includes('auth.netflix.com/activate'), mailEn?.urlsJson);

    const mailAtt = list.find((m) => m.subject === 'Hóa đơn điện tử');
    check('Mail có attachment flag', mailAtt?.hasAttachments === 1);

    const detail = await apiJson(`/mails/${mailAtt.id}`);
    check('Chi tiết có 1 attachment', detail.data.attachments?.length === 1);
    const att = detail.data.attachments[0];
    const attRes = await fetch(`${API}/mails/${mailAtt.id}/attachments/${att.id}`);
    const attText = await attRes.text();
    check('Download attachment đúng nội dung', attRes.status === 200 && attText.includes('1.200.000'), attText.slice(0, 40));
    check('MIME text/plain theo đuôi .txt', attRes.headers.get('content-type')?.startsWith('text/plain'), attRes.headers.get('content-type'));
    const disp = attRes.headers.get('content-disposition') ?? '';
    check('Content-Disposition inline + tên file', disp.startsWith('inline;') && disp.includes('invoice.txt'), disp);
    const attResDl = await fetch(`${API}/mails/${mailAtt.id}/attachments/${att.id}?download=1`);
    check('?download=1 -> attachment', attResDl.headers.get('content-disposition')?.startsWith('attachment;') === true,
      attResDl.headers.get('content-disposition'));
    const att404 = await fetch(`${API}/mails/${mailAtt.id}/attachments/deadbeef-dead-beef-dead-beefdeadbeef`);
    check('File không tồn tại -> 404 JSON', att404.status === 404 && (await att404.json()).error === 'File không tồn tại', String(att404.status));

    // ============ 4. Đếm mail theo địa chỉ ============
    console.log('\n== Đếm mail theo địa chỉ ==');
    const mboxes = (await apiJson('/mailboxes')).data.mailboxes;
    const testMb = mboxes.find((m) => m.name === 'test');
    const shopMb = mboxes.find((m) => m.name === 'shop');
    check('test@ có 2 mail', testMb?.mailCount === 2, `(got ${testMb?.mailCount})`);
    check('shop@ có 1 mail', shopMb?.mailCount === 1, `(got ${shopMb?.mailCount})`);

    // ============ 4b. Lọc mail theo địa chỉ hòm thư ============
    console.log('\n== Lọc mail theo địa chỉ (Hộp thư đến của từng địa chỉ) ==');
    const onlyTest = (await apiJson('/mails?mailbox=test&limit=50')).data.messages;
    const onlyShop = (await apiJson('/mails?mailbox=shop&limit=50')).data.messages;
    check('mailbox=test chỉ trả mail của test@',
      onlyTest.length === 2 && onlyTest.every((m) => m.toAddr.includes('test@')), `(got ${onlyTest.length})`);
    check('mailbox=shop chỉ trả mail của shop@',
      onlyShop.length === 1 && onlyShop.every((m) => m.toAddr.includes('shop@')), `(got ${onlyShop.length})`);

    // ============ 5. CRUD ============
    console.log('\n== CRUD ==');
    const patch = await apiJson(`/mails/${mailVn.id}`, { method: 'PATCH', body: JSON.stringify({ read: true, favorite: true }) });
    check('PATCH read+favorite 200', patch.status === 200);
    check('Favorite đã lưu', patch.data.favorite === 1);

    const favList = (await apiJson('/mails?folder=favorite&limit=50')).data.messages;
    check('Filter folder favorite', favList.some((m) => m.id === mailVn.id));

    const search = (await apiJson('/mails?search=482913&limit=50')).data.messages;
    check('Search theo OTP tìm thấy mail', search.some((m) => m.id === mailVn.id));

    const del = await apiJson(`/mails/${mailVn.id}`, { method: 'DELETE' });
    check('DELETE mail 200', del.status === 200);

    const mbPatch = await apiJson('/mailboxes/test-id-unknown', { method: 'PATCH', body: JSON.stringify({ note: 'x' }) });
    check('PATCH mailbox không tồn tại -> 404', mbPatch.status === 404, String(mbPatch.status));

    // Sửa tên địa chỉ
    const mbRename = await apiJson(`/mailboxes/${testMb.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'test2', note: 'Đổi tên xong' }) });
    check('Đổi tên địa chỉ 200', mbRename.status === 200, String(mbRename.status));
    const afterRename = (await apiJson('/mailboxes')).data.mailboxes;
    check('Tên mới test2 hiện trong list', afterRename.some((m) => m.name === 'test2'));

    const mbDel = await apiJson(`/mailboxes/${shopMb.id}`, { method: 'DELETE' });
    check('DELETE mailbox 200', mbDel.status === 200);
    const afterDel = (await apiJson('/mailboxes')).data.mailboxes;
    check('shop@ không còn trong list', !afterDel.some((m) => m.name === 'shop'));

    // Gửi tới địa chỉ vừa xóa -> bị từ chối
    let rejected2 = false;
    try {
      await smtp.sendMail({ from: 'a@b.c', to: `shop@${DOMAIN}`, subject: 'x', text: 'y' });
    } catch (err) {
      rejected2 = /550/.test(err.message);
    }
    check('Mail tới địa chỉ đã xóa bị từ chối 550', rejected2);

    console.log(`\n== KẾT QUẢ: ${passed} passed, ${failed} failed ==`);
  } catch (err) {
    failed++;
    console.error('\nLỗi smoke test:', err.message);
  } finally {
    app.kill('SIGTERM');
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 500);
  }
}

main();