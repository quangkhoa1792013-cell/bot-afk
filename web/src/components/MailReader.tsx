import {
  useStore, setState, toggleFavorite, toggleRead, deleteMail,
  fmtFull, fmtSize, avatarGradient, senderName, highlightOtp, toast, esc,
  type Attachment,
} from '../store';

/** Màn hình đọc mail FULL-WIDTH (ẩn danh sách khi bấm 1 mail).
 *  Có nút "← Quay lại Hộp thư". break-words: không bao giờ tràn lề. */
export default function MailReader() {
  const selected = useStore((s) => s.selected);

  if (!selected) return null;

  const mail = selected;
  const hasHtml = !!mail.htmlBody && mail.htmlBody.length > 0;
  const hasText = !!mail.textBody && mail.textBody.trim().length > 0;

  return (
    <section className="min-w-0 flex-1 overflow-y-auto">
      {/* Thanh trên: Quay lại + hành động */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-[#0f1115]/95 px-4 py-2 backdrop-blur">
        <button
          onClick={() => setState({ selected: null })}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-indigo-300 hover:bg-white/10"
        >
          ← Quay lại Hộp thư
        </button>
        <div className="flex-1" />
        <ReaderBtn
          onClick={() => toggleFavorite(mail)}
          title="Yêu thích"
          className={mail.favorite ? 'text-amber-400' : ''}
        >
          ★
        </ReaderBtn>
        <ReaderBtn onClick={() => toggleRead(mail)} title="Đã đọc / chưa đọc">
          {mail.read ? '🫥' : '📖'}
        </ReaderBtn>
        <ReaderBtn
          onClick={() => { if (confirm('Xóa mail này?')) deleteMail(mail.id); }}
          title="Xóa"
          className="hover:!text-red-300"
        >
          🗑
        </ReaderBtn>
      </div>

      {/* Nội dung - cột giữa rộng rãi */}
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        {/* Tiêu đề lớn */}
        <h1 className="break-words text-2xl font-bold leading-snug text-white">
          {mail.subject || '(không có tiêu đề)'}
        </h1>

        {/* Box người gửi */}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[15px] font-bold text-white ${avatarGradient(mail.fromAddr)}`}>
            {senderName(mail.fromAddr).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14px] font-semibold text-gray-100">{senderName(mail.fromAddr)}</span>
              <span className="truncate text-[12px] text-gray-500">&lt;{mail.fromAddr}&gt;</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-gray-500">
              <span>
                Tới: <span className="text-gray-400">{mail.toAddr}</span>
              </span>
              <span>Nhận lúc {fmtFull(mail.receivedAt)}</span>
            </div>
          </div>
          {mail.hasAttachments > 0 && (
            <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[11px] text-gray-300">
              📎 {mail.attachments.length} file
            </span>
          )}
        </div>

        {/* OTP nổi bật */}
        {mail.otp && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
            <span className="text-sm text-amber-200">🔑 Mã xác nhận phát hiện:</span>
            <span className="font-mono text-2xl font-black tracking-widest text-amber-300">{mail.otp}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(mail.otp!);
                toast(`Đã copy mã <b>${esc(mail.otp!)}</b> vào clipboard`);
              }}
              className="rounded-lg bg-amber-400/90 px-3 py-1 text-[12px] font-bold text-black hover:bg-amber-300"
            >
              📋 Copy
            </button>
          </div>
        )}

        {/* Khung nội dung rộng rãi */}
        <div className="mt-4 min-w-0">
          {hasHtml ? (
            <iframe
              title={mail.subject}
              srcDoc={mail.htmlBody}
              sandbox=""
              className="h-[65vh] min-h-[420px] w-full rounded-xl border border-white/10 bg-white"
            />
          ) : hasText ? (
            <pre
              className="whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-white/[0.03] p-5 text-[14px] leading-relaxed text-gray-200"
              dangerouslySetInnerHTML={{ __html: highlightOtp(mail.textBody, mail.otp) }}
            />
          ) : (
            <div className="p-6 text-center text-sm text-gray-500">Mail này không có nội dung.</div>
          )}
        </div>

        {/* Link phát hiện */}
        {mail.urls.length > 0 && (
          <div className="mt-5">
            <div className="mb-1.5 text-[13px] font-semibold text-gray-400">🔗 Link trong mail</div>
            <div className="flex flex-wrap gap-2">
              {mail.urls.map((u, i) => (
                <a
                  key={i}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-full truncate rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] text-indigo-300 hover:bg-indigo-500/20"
                  title={u}
                >
                  {u}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Khung File đính kèm: card nhỏ, bấm để Mở/Tải */}
        {mail.attachments.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-[13px] font-semibold text-gray-400">
              📎 File đính kèm ({mail.attachments.length})
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {mail.attachments.map((a) => (
                <AttachmentCard key={a.id} mailId={mail.id} att={a} />
              ))}
            </div>
          </div>
        )}

        <div className="h-6" />
      </div>
    </section>
  );
}

/** Card file đính kèm: bấm vào card = Mở xem trực tiếp (inline),
 *  bấm nút ⬇ = Tải về máy (?download=1). */
function AttachmentCard({ mailId, att }: { mailId: string; att: Attachment }) {
  const url = `/api/mails/${mailId}/attachments/${att.id}`;
  const icon = attIcon(att.fileName);
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3
      transition hover:border-indigo-400/50 hover:bg-indigo-500/10">
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-gray-200" title={att.fileName}>
          {att.fileName}
        </div>
        <div className="text-[11px] text-gray-500">{fmtSize(att.size)}</div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={`Mở xem ${att.fileName}`}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-gray-300 hover:bg-white/15"
      >
        Mở
      </a>
      <a
        href={`${url}?download=1`}
        title={`Tải ${att.fileName}`}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-gray-300 hover:bg-indigo-500/30"
      >
        ⬇
      </a>
    </div>
  );
}

/** Icon theo loại file. */
function attIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext ?? '')) return '🖼';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx'].includes(ext ?? '')) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext ?? '')) return '📗';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return '🗜';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext ?? '')) return '🎵';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext ?? '')) return '🎬';
  return '📄';
}

function ReaderBtn({
  children, onClick, title, className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-gray-400
        hover:bg-white/10 hover:text-gray-100 ${className}`}
    >
      {children}
    </button>
  );
}