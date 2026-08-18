import { useEffect, useState } from 'react';

/* ============ Kiểu dữ liệu ============ */

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface Mail {
  id: string;
  toAddr: string;
  fromAddr: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  otp: string | null;
  urlsJson: string | null;
  read: number;
  favorite: number;
  receivedAt: number;
  hasAttachments: number;
}

export interface MailDetail extends Mail {
  urls: string[];
  attachments: Attachment[];
}

export interface SentMail {
  id: string;
  toAddr: string;
  subject: string;
  body: string;
  status: string;
  sentAt: number;
}

export interface Mailbox {
  id: string;
  name: string;
  note: string;
  createdAt: number;
  mailCount: number;
}

export type Folder = 'mailboxes' | 'all' | 'inbox' | 'unread' | 'favorite' | 'sent';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'otp' | 'error';
}

interface Stats {
  total: number;
  unread: number;
  favorite: number;
}

interface State {
  folder: Folder;
  /** Địa chỉ hòm thư đang lọc (mục "Hộp thư đến"): tên mailbox hoặc null = tất cả */
  mailboxFilter: string | null;
  search: string;
  mails: Mail[];
  sent: SentMail[];
  mailboxes: Mailbox[];
  domain: string;
  selected: MailDetail | null;
  stats: Stats;
  sseOnline: boolean;
  showCompose: boolean;
  showSettings: boolean;
  sidebarOpen: boolean;
  /** Các mail đang tick checkbox (xóa hàng loạt) */
  selectedIds: string[];
  toasts: Toast[];
}

/* ============ Store mini (không cần thư viện) ============ */

let state: State = {
  folder: 'inbox',
  mailboxFilter: null,
  search: '',
  mails: [],
  sent: [],
  mailboxes: [],
  domain: 'khoablabla.ddns.net',
  selected: null,
  stats: { total: 0, unread: 0, favorite: 0 },
  sseOnline: false,
  showCompose: false,
  showSettings: false,
  sidebarOpen: false,
  selectedIds: [],
  toasts: [],
};

const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore<T>(selector: (s: State) => T): T {
  const [val, setVal] = useState<T>(() => selector(state));
  useEffect(() => {
    const l = () => setVal(selector(state));
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return val;
}

/* ============ API ============ */

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

let toastSeq = 0;

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastSeq;
  setState({ toasts: [...getState().toasts, { id, text, kind }] });
  setTimeout(() => {
    setState({ toasts: getState().toasts.filter((t) => t.id !== id) });
  }, 5500);
}

/* ============ Hành động ============ */

export async function loadMeta(): Promise<void> {
  try {
    const meta = await api<{ domain: string; catchAll: boolean; smtpPort: number }>('/meta');
    setState({ domain: meta.domain });
  } catch {
    /* không có API -> giữ domain mặc định */
  }
}

export async function refreshStats(): Promise<void> {
  try {
    const s = await api<Stats>('/stats');
    setState({ stats: s });
  } catch {
    /* bỏ qua */
  }
}

export async function loadMailboxes(): Promise<void> {
  try {
    const data = await api<{ mailboxes: Mailbox[] }>('/mailboxes');
    setState({ mailboxes: data.mailboxes });
  } catch (e) {
    toast(`Lỗi tải địa chỉ: ${(e as Error).message}`, 'error');
  }
}

export async function loadSent(): Promise<void> {
  try {
    const data = await api<{ sent: SentMail[] }>('/sent');
    setState({ sent: data.sent });
  } catch (e) {
    toast(`Lỗi tải mail đã gửi: ${(e as Error).message}`, 'error');
  }
}

export async function loadMails(): Promise<void> {
  const s = getState();
  if (s.folder === 'mailboxes') return loadMailboxes();
  if (s.folder === 'sent') return loadSent();

  const folderForApi = s.folder === 'all' ? 'inbox' : s.folder;
  const params = new URLSearchParams({ folder: folderForApi, limit: '200' });
  if (s.search.trim()) params.set('search', s.search.trim());
  if (s.folder === 'inbox' && s.mailboxFilter) params.set('mailbox', s.mailboxFilter);

  try {
    const data = await api<{ messages: Mail[] }>(`/mails?${params}`);
    setState({ mails: data.messages });
  } catch (e) {
    toast(`Lỗi tải mail: ${(e as Error).message}`, 'error');
  }
  refreshStats();
}

/** Chuyển sang một mục (folder) + reset bộ lọc, tải lại danh sách. */
export function setFolder(folder: Folder, mailboxFilter: string | null = null): void {
  setState({ folder, mailboxFilter, search: '', selected: null, sidebarOpen: false });
  loadMails();
}

export async function openMail(id: string): Promise<void> {
  try {
    const detail = await api<MailDetail>(`/mails/${id}`);
    setState({ selected: detail });
    if (!detail.read) {
      await api(`/mails/${id}/read`, { method: 'PATCH' }).catch(() => {});
      loadMails();
    }
  } catch (e) {
    toast(`Lỗi mở mail: ${(e as Error).message}`, 'error');
  }
}

export async function toggleFavorite(mail: Mail): Promise<void> {
  try {
    await api(`/mails/${mail.id}/favorite`, { method: 'PATCH' });
    loadMails();
  } catch (e) {
    toast(`Lỗi: ${(e as Error).message}`, 'error');
  }
}

export async function toggleRead(mail: Mail): Promise<void> {
  try {
    await api(mail.read ? `/mails/${mail.id}/unread` : `/mails/${mail.id}/read`, { method: 'PATCH' });
    loadMails();
  } catch (e) {
    toast(`Lỗi: ${(e as Error).message}`, 'error');
  }
}

export async function deleteMail(id: string): Promise<void> {
  try {
    await api(`/mails/${id}`, { method: 'DELETE' });
    if (getState().selected?.id === id) setState({ selected: null });
    setState({ selectedIds: getState().selectedIds.filter((i) => i !== id) });
    toast('Đã xóa mail');
    loadMails();
  } catch (e) {
    toast(`Lỗi xóa: ${(e as Error).message}`, 'error');
  }
}

/* ============ Chọn nhiều (checkbox) ============ */

export function toggleSelect(id: string): void {
  const ids = getState().selectedIds;
  setState({
    selectedIds: ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
  });
}

export function toggleSelectAll(ids: string[]): void {
  const all = getState().selectedIds;
  const every = ids.length > 0 && ids.every((i) => all.includes(i));
  setState({ selectedIds: every ? [] : [...new Set([...all, ...ids])] });
}

export function clearSelection(): void {
  setState({ selectedIds: [] });
}

export async function bulkDelete(): Promise<void> {
  const ids = getState().selectedIds;
  if (!ids.length) return;
  try {
    await Promise.all(ids.map((id) => api(`/mails/${id}`, { method: 'DELETE' })));
    const sel = getState().selected;
    setState({
      selectedIds: [],
      selected: sel && ids.includes(sel.id) ? null : sel,
    });
    toast(`Đã xóa ${ids.length} mail`);
    loadMails();
  } catch (e) {
    toast(`Lỗi xóa: ${(e as Error).message}`, 'error');
  }
}

export async function clearAll(): Promise<void> {
  try {
    await api('/mails', { method: 'DELETE' });
    setState({ selected: null });
    toast('Đã xóa toàn bộ mail');
    loadMails();
  } catch (e) {
    toast(`Lỗi: ${(e as Error).message}`, 'error');
  }
}

/* ============ Mailbox (địa chỉ hòm thư) ============ */

export async function createMailbox(name: string, note: string): Promise<Mailbox> {
  const data = await api<{ mailbox: Mailbox }>('/mailboxes', {
    method: 'POST',
    body: JSON.stringify({ name, note }),
  });
  await loadMailboxes();
  return data.mailbox;
}

export async function updateMailbox(id: string, patch: { name?: string; note?: string }): Promise<void> {
  await api(`/mailboxes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  await loadMailboxes();
}

export async function removeMailbox(id: string): Promise<void> {
  await api(`/mailboxes/${id}`, { method: 'DELETE' });
  await loadMailboxes();
  loadMails();
}

/** Từ trang "Địa chỉ hòm thư", bấm vào 1 địa chỉ -> chuyển sang hòm thư riêng của nó. */
export function goToMailbox(name: string): void {
  setFolder('inbox', name);
}

/* ============ SSE: mail mới về là hiện ngay ============ */

export function connectSSE(): void {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    let evt: { type: string; payload?: unknown };
    try {
      evt = JSON.parse(e.data);
    } catch {
      return;
    }
    if (evt.type === 'new-mail') {
      const mail = evt.payload as Mail;
      const cur = getState();
      if (cur.folder === 'sent' || cur.folder === 'mailboxes') {
        loadMailboxes();
        refreshStats();
        return;
      }
      const inFilter =
        !cur.mailboxFilter || cur.folder !== 'inbox' ||
        mail.toAddr.toLowerCase().includes(cur.mailboxFilter.toLowerCase());
      if (inFilter) loadMails();
      else refreshStats();
      const code = (mail as { otp?: string | null }).otp;
      toast(
        `📥 <b>${esc(mail.subject || '(không có tiêu đề)')}</b>` +
          (code ? `<div class="text-amber-300 text-lg mt-1">🔑 Mã OTP: <b>${esc(code)}</b></div>` : ''),
        code ? 'otp' : 'info',
      );
      setState({ sseOnline: true });
    } else if (evt.type === 'mail-updated' || evt.type === 'mail-deleted' || evt.type === 'cleared') {
      loadMails();
    }
  };
  es.onerror = () => setState({ sseOnline: false });
}

/* ============ Tiện ích ============ */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export function fmtFull(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Avatar: gradient màu cố định theo tên người gửi */
const GRADIENTS = [
  'from-pink-500 to-rose-500',
  'from-violet-500 to-purple-500',
  'from-sky-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-fuchsia-500 to-pink-500',
  'from-cyan-500 to-sky-500',
  'from-lime-500 to-green-500',
];

export function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function senderName(fromAddr: string): string {
  const at = fromAddr.indexOf('@');
  return at > 0 ? fromAddr.slice(0, at) : fromAddr;
}

/** Lấy tên địa chỉ hòm thư từ địa chỉ nhận (phần trước @). */
export function mailboxOf(toAddr: string): string {
  const at = toAddr.indexOf('@');
  return at > 0 ? toAddr.slice(0, at) : toAddr;
}

/** Rút gọn câu đầu tiên (đủ ý) để làm snippet. */
export function makeSnippet(text: string): string {
  const clean = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= 140) return clean;
  const cut = clean.slice(0, 140);
  const last = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '), cut.lastIndexOf(' '));
  return (last > 60 ? cut.slice(0, last) : cut) + '…';
}

/** Highlight số OTP trong nội dung text. */
export function highlightOtp(text: string, otp: string | null): string {
  if (!otp || !text) return esc(text);
  const re = new RegExp(`(^|[^0-9])(${otp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([^0-9]|$)`, 'g');
  return esc(text).replace(re, `$1<span class="otp-strong">$2</span>$3`);
}