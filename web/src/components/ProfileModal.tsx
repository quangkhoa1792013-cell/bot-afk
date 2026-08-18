import { useEffect, useState } from 'react';
import {
  useStore, createProfile, updateProfile, toast, esc, type Profile,
} from '../store';

/** Modal tạo/sửa Profile: name, assigned_email, target_url, notes, status. */
export default function ProfileModal({
  profile, onClose,
}: {
  profile: Profile | null;
  onClose: () => void;
}) {
  const domain = useStore((s) => s.domain);
  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.assignedEmail ?? '');
  const [targetUrl, setTargetUrl] = useState(profile?.targetUrl ?? '');
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [status, setStatus] = useState<Profile['status']>(profile?.status ?? 'active');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) return toast('Nhập tên Profile (vd: Discord Bot 01)', 'error');
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanEmail)) {
      return toast('Email gán không hợp lệ (vd: bot01@' + esc(domain) + ')', 'error');
    }
    const cleanUrl = targetUrl.trim();
    if (cleanUrl && !/^https?:\/\/.+/.test(cleanUrl)) {
      return toast('target_url phải bắt đầu bằng http:// hoặc https://', 'error');
    }

    setBusy(true);
    try {
      const payload = {
        name: cleanName,
        assignedEmail: cleanEmail,
        targetUrl: cleanUrl,
        notes: notes.trim(),
        status,
      };
      if (profile) {
        await updateProfile(profile.id, payload);
        toast(`Đã lưu Profile <b>${esc(cleanName)}</b>`);
      } else {
        await createProfile(payload);
        toast(`Đã tạo Profile <b>${esc(cleanName)}</b> 🎉`);
      }
      onClose();
    } catch (e) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#14171d] p-5 shadow-2xl"
      >
        <div className="text-[15px] font-bold text-white">
          {profile ? `✏️ Sửa Profile: ${esc(profile.name)}` : '🤖 Tạo Profile mới'}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[12px] font-semibold text-gray-400">Tên Profile *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vd: Discord Bot 01"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold text-gray-400">Email gán (assigned_email) *</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`vd: bot01@${domain}`}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
            <div className="mt-1 text-[11px] text-gray-600">
              Mail gửi tới địa chỉ này sẽ báo ngay lên card/tab của Profile.
            </div>
          </div>

          <div>
            <label className="text-[12px] font-semibold text-gray-400">URL web local của bot (target_url)</label>
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="vd: http://localhost:8080"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
            <div className="mt-1 text-[11px] text-gray-600">
              Nhúng vào tab 🌐 Bot Web bằng iframe. Để trống nếu bot chưa có web.
            </div>
          </div>

          <div>
            <label className="text-[12px] font-semibold text-gray-400">Ghi chú (notes)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="vd: Bot Discord verify OTP, chạy local:8080"
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold text-gray-400">Trạng thái</label>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setStatus('active')}
                className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold transition
                  ${status === 'active'
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
              >
                🟢 Active
              </button>
              <button
                onClick={() => setStatus('inactive')}
                className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold transition
                  ${status === 'inactive'
                    ? 'border-red-400/50 bg-red-500/15 text-red-300'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
              >
                ⚪ Inactive
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] text-gray-300 hover:bg-white/10"
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white
              hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Đang lưu…' : profile ? '💾 Lưu thay đổi' : '➕ Tạo Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}