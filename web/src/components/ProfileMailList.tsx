import { useCallback, useEffect, useState } from 'react';
import {
  useStore, openMail, loadProfileMails, toggleFavorite, toggleRead, deleteMail, loadProfiles,
  fmtTime, makeSnippet, senderName, type Mail, type Profile,
} from '../store';

/** Tab 📥 Mail của 1 Profile: danh sách mail gửi tới đúng assigned_email.
 *  Tự tải lại khi có mail mới (mailVersion tăng qua SSE).
 *  Bấm 1 mail -> mở màn hình đọc full-width (như hòm thư chung). */
export default function ProfileMailList({ profile }: { profile: Profile }) {
  const mailVersion = useStore((s) => s.mailVersion);
  const [mails, setMails] = useState<Mail[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async (kw: string) => {
    setLoading(true);
    try {
      const list = await loadProfileMails(profile.id, kw);
      setMails(list);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  // Tải lần đầu + mỗi khi có mail mới / đổi search
  useEffect(() => {
    load(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, mailVersion, search]);

  const refresh = async () => {
    await load(search);
    loadProfiles();
  };

  const onToggleRead = async (mail: Mail) => {
    await toggleRead(mail);
    refresh();
  };
  const onToggleFavorite = async (mail: Mail) => {
    await toggleFavorite(mail);
    refresh();
  };
  const onDelete = async (mail: Mail) => {
    await deleteMail(mail.id);
    refresh();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Thanh công cụ */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm trong mail của profile này…"
          className="w-full max-w-md rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px]
            placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
        />
        <span className="text-[12px] text-gray-500">
          {mails.length} mail tới <span className="font-mono text-indigo-300">{profile.assignedEmail}</span>
        </span>
        <div className="flex-1" />
        <button
          onClick={refresh}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-gray-300 hover:bg-white/10"
          title="Làm mới"
        >
          🔄
        </button>
      </div>

      {/* Danh sách */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {error && (
          <div className="p-6 text-center text-[13px] text-red-300">Lỗi tải mail: {error}</div>
        )}
        {!error && loading && mails.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500">Đang tải…</div>
        )}
        {!error && !loading && mails.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <div className="mb-2 text-4xl">📭</div>
            <div className="text-sm">
              Chưa có mail nào tới <span className="font-mono text-indigo-300">{profile.assignedEmail}</span>.
            </div>
            <div className="mt-1 text-[12px] text-gray-600">
              Gửi mail tới địa chỉ này — nó sẽ hiện ngay ở đây và báo lên tab của Profile.
            </div>
          </div>
        )}
        {!error &&
          mails.map((mail) => (
            <div
              key={mail.id}
              onClick={() => openMail(mail.id)}
              title={`${mail.fromAddr} → ${mail.toAddr}`}
              className={`group flex cursor-pointer select-none items-center gap-3 border-b border-white/5 px-4
                transition-colors ${!mail.read ? 'bg-white/[0.025]' : ''} hover:bg-[#1b212b]`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(mail); }}
                title="Yêu thích"
                className={`shrink-0 text-[15px] transition ${mail.favorite ? 'text-amber-400' : 'text-gray-700 hover:text-amber-300'}`}
              >
                ★
              </button>
              <span className={`w-48 shrink-0 truncate text-[13px] ${!mail.read ? 'font-bold text-white' : 'text-gray-300'}`}>
                {senderName(mail.fromAddr)}
              </span>
              <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
                <span className={`truncate text-[13px] ${!mail.read ? 'font-bold text-white' : 'text-gray-200'}`}>
                  {mail.subject || '(không có tiêu đề)'}
                </span>
                {makeSnippet(mail.textBody ?? '') && (
                  <>
                    <span className="shrink-0 text-gray-600">-</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-gray-500">
                      {makeSnippet(mail.textBody ?? '')}
                    </span>
                  </>
                )}
              </div>
              {mail.otp && <span className="otp-chip shrink-0">🔑 {mail.otp}</span>}
              {mail.hasAttachments > 0 && (
                <span className="shrink-0 text-[13px] text-gray-500" title="Có file đính kèm">📎</span>
              )}
              <span className="w-20 shrink-0 text-right text-[12px] text-gray-500">{fmtTime(mail.receivedAt)}</span>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                {confirmId === mail.id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(mail); setConfirmId(null); }}
                    className="rounded bg-red-500/90 px-2 py-1 text-[11px] font-bold text-white"
                  >
                    Chắc chắn?
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleRead(mail); }}
                      title={mail.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}
                      className="rounded px-1.5 py-1 text-[13px] text-gray-500 hover:bg-white/10 hover:text-sky-300"
                    >
                      {mail.read ? '🫥' : '📖'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmId(mail.id); }}
                      title="Xóa"
                      className="rounded px-1.5 py-1 text-[13px] text-gray-500 hover:bg-red-500/15 hover:text-red-300"
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}