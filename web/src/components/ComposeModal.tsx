import { useState } from 'react';
import { useStore, setState, api, toast, esc } from '../store';

/** Modal "Soạn mail mới" — gửi qua SMTP outbound đã cấu hình. */
export default function ComposeModal() {
  const show = useStore((s) => s.showCompose);
  const mailboxes = useStore((s) => s.mailboxes);
  const domain = useStore((s) => s.domain);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  if (!show) return null;

  const close = () => setState({ showCompose: false });

  const send = async () => {
    if (!to.trim()) return toast('Nhập địa chỉ người nhận', 'error');
    if (!subject.trim()) return toast('Nhập tiêu đề', 'error');
    setBusy(true);
    try {
      await api('/send', {
        method: 'POST',
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body }),
      });
      toast('✅ Mail đã gửi đi');
      setTo('');
      setSubject('');
      setBody('');
      close();
    } catch (e) {
      toast(`Gửi lỗi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#161a21] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-white">✍️ Soạn mail mới</h2>
          <button onClick={close} className="rounded-lg px-2 py-1 text-gray-400 hover:bg-white/10">✕</button>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-gray-400">Người nhận</label>
            <input
              list="compose-addresses"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="someone@gmail.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
            <datalist id="compose-addresses">
              {mailboxes.map((mb) => (
                <option key={mb.id} value={`${mb.name}@${domain}`} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-gray-400">Tiêu đề</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Tiêu đề mail"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-gray-400">Nội dung</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Nội dung…"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={close} className="rounded-lg bg-white/10 px-4 py-2 text-[13px] text-gray-300 hover:bg-white/20">
              Hủy
            </button>
            <button
              onClick={send}
              disabled={busy}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? 'Đang gửi…' : '📤 Gửi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}