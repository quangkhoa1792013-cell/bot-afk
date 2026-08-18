import { useMemo, useState } from 'react';
import {
  useStore, setState, openMail, toggleFavorite, toggleRead, deleteMail,
  setFolder, loadMails, bulkDelete, toggleSelect, toggleSelectAll, clearSelection,
  fmtTime, makeSnippet, senderName, mailboxOf,
  type Mail,
} from '../store';

/** Danh sách mail kiểu Gmail: MỖI MAIL LÀ 1 DÒNG NGANG trải rộng full-width.
 *  [checkbox][★][người gửi][tiêu đề - snippet cùng 1 dòng][📎][thời gian] */
export default function MailList() {
  const folder = useStore((s) => s.folder);
  const mailboxFilter = useStore((s) => s.mailboxFilter);
  const search = useStore((s) => s.search);
  const mails = useStore((s) => s.mails);
  const sent = useStore((s) => s.sent);
  const selectedIds = useStore((s) => s.selectedIds);
  const mailboxes = useStore((s) => s.mailboxes);
  const domain = useStore((s) => s.domain);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const isSent = folder === 'sent';
  const allChecked = useMemo(
    () => mails.length > 0 && mails.every((m) => selectedIds.includes(m.id)),
    [mails, selectedIds],
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* Thanh công cụ */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <button
          onClick={() => setState({ sidebarOpen: true })}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-gray-400 hover:bg-white/10 lg:hidden"
          title="Menu"
        >
          ☰
        </button>
        <input
          value={search}
          onChange={(e) => { setState({ search: e.target.value }); loadMails(); }}
          placeholder="🔍 Tìm OTP, người gửi, tiêu đề…"
          className="w-full max-w-md rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px]
            placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
        />
        {folder === 'inbox' && mailboxes.length > 0 && (
          <select
            value={mailboxFilter ?? ''}
            onChange={(e) => setFolder('inbox', e.target.value || null)}
            className="max-w-[220px] rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[13px]
              text-gray-300 focus:border-indigo-400/60 focus:outline-none"
            title="Xem hòm thư của địa chỉ nào"
          >
            <option value="">🗂 Tất cả địa chỉ</option>
            {mailboxes.map((mb) => (
              <option key={mb.id} value={mb.name}>
                📫 {mb.name}@{domain}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setState({ showCompose: true })}
          className="rounded-lg bg-indigo-500 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-400"
        >
          ✍️ Soạn mail
        </button>
      </div>

      {/* Thanh chọn nhiều */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-[13px] text-amber-200">
          <span className="font-bold">Đã chọn {selectedIds.length} mail</span>
          <button
            onClick={() => { if (confirm(`Xóa ${selectedIds.length} mail đã chọn?`)) bulkDelete(); }}
            className="rounded-lg bg-red-500/90 px-3 py-1 font-semibold text-white hover:bg-red-400"
          >
            🗑 Xóa đã chọn
          </button>
          <button onClick={clearSelection} className="text-amber-300 underline-offset-2 hover:underline">
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Danh sách 1 dòng */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!isSent && mails.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500">
            <div className="mb-2 text-4xl">📭</div>
            {folder === 'unread'
              ? 'Không còn mail chưa đọc 🎉'
              : folder === 'favorite'
                ? 'Chưa có mail yêu thích nào'
                : 'Hòm thư đang trống. Tạo địa chỉ trong "📫 Địa chỉ hòm thư" rồi gửi mail tới đó!'}
          </div>
        )}
        {isSent && sent.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500">Chưa có mail nào được gửi đi.</div>
        )}

        {!isSent &&
          mails.map((mail) => (
            <MailRow
              key={mail.id}
              mail={mail}
              folder={folder}
              checked={selectedIds.includes(mail.id)}
              confirmId={confirmId}
              onConfirm={setConfirmId}
            />
          ))}

        {isSent &&
          sent.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 hover:bg-white/[0.04]">
              <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span className="w-44 shrink-0 truncate text-[13px] font-semibold text-gray-200">{s.toAddr}</span>
                <span className="truncate text-[13px] text-gray-300">{s.subject}</span>
                <span className="text-gray-600">-</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-gray-500">{s.body.slice(0, 80)}</span>
              </div>
              <span className={`shrink-0 text-[12px] ${s.status === 'sent' ? 'text-emerald-400' : 'text-red-400'}`}>
                {s.status === 'sent' ? '✅ Đã gửi' : `❌ ${s.status}`}
              </span>
              <span className="w-20 shrink-0 text-right text-[12px] text-gray-500">{fmtTime(s.sentAt)}</span>
            </div>
          ))}
      </div>
    </section>
  );
}

function MailRow({
  mail, folder, checked, confirmId, onConfirm,
}: {
  mail: Mail;
  folder: string;
  checked: boolean;
  confirmId: string | null;
  onConfirm: (id: string | null) => void;
}) {
  const unread = !mail.read;
  const snippet = makeSnippet(mail.textBody ?? '');

  return (
    <div
      onClick={() => openMail(mail.id)}
      title={`${mail.fromAddr} → ${mail.toAddr}`}
      className={`group flex cursor-pointer select-none items-center gap-3 border-b border-white/5 px-4
        transition-colors ${unread ? 'bg-white/[0.025]' : ''} hover:bg-[#1b212b]`}
    >
      {/* Checkbox + sao */}
      <input
        type="checkbox"
        checked={checked}
        onChange={() => toggleSelect(mail.id)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 accent-indigo-500"
        title="Chọn để xóa hàng loạt"
      />
      <button
        onClick={(e) => { e.stopPropagation(); toggleFavorite(mail); }}
        title="Yêu thích"
        className={`shrink-0 text-[15px] transition ${mail.favorite ? 'text-amber-400' : 'text-gray-700 hover:text-amber-300'}`}
      >
        ★
      </button>

      {/* Người gửi */}
      <span className={`w-48 shrink-0 truncate text-[13px] ${unread ? 'font-bold text-white' : 'text-gray-300'}`}>
        {senderName(mail.fromAddr)}
        {folder === 'all' && mail.toAddr && (
          <span className="ml-1 text-[11px] font-normal text-gray-600">→ {mailboxOf(mail.toAddr)}</span>
        )}
      </span>

      {/* Tiêu đề - snippet trên CÙNG 1 dòng, không bao giờ nhảy dòng */}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
        <span className={`truncate text-[13px] ${unread ? 'font-bold text-white' : 'text-gray-200'}`}>
          {mail.subject || '(không có tiêu đề)'}
        </span>
        {snippet && (
          <>
            <span className="shrink-0 text-gray-600">-</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-gray-500">{snippet}</span>
          </>
        )}
      </div>

      {/* OTP nhỏ + đính kèm + thời gian */}
      {mail.otp && (
        <span className="otp-chip shrink-0">🔑 {mail.otp}</span>
      )}
      {mail.hasAttachments > 0 && (
        <span className="shrink-0 text-[13px] text-gray-500" title="Có file đính kèm">📎</span>
      )}
      <span className="w-20 shrink-0 text-right text-[12px] text-gray-500">{fmtTime(mail.receivedAt)}</span>

      {/* Hành động khi hover */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        {confirmId === mail.id ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteMail(mail.id);
              onConfirm(null);
            }}
            className="rounded bg-red-500/90 px-2 py-1 text-[11px] font-bold text-white"
          >
            Chắc chắn?
          </button>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); toggleRead(mail); }}
              title={unread ? 'Đánh dấu đã đọc' : 'Đánh dấu chưa đọc'}
              className="rounded px-1.5 py-1 text-[13px] text-gray-500 hover:bg-white/10 hover:text-sky-300"
            >
              {unread ? '📖' : '🫥'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onConfirm(mail.id); }}
              title="Xóa"
              className="rounded px-1.5 py-1 text-[13px] text-gray-500 hover:bg-red-500/15 hover:text-red-300"
            >
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  );
}