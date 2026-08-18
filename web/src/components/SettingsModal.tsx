import { useEffect, useState } from 'react';
import { useStore, setState, api, toast } from '../store';

interface Settings {
  telegramBotToken: string;
  telegramChatId: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFromName: string;
}

/** Modal "Cài đặt": Telegram + SMTP outbound. */
export default function SettingsModal() {
  const show = useStore((s) => s.showSettings);
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    api<{ settings: Settings }>('/settings')
      .then((d) => setForm(d.settings))
      .catch((e) => toast(`Lỗi tải cài đặt: ${(e as Error).message}`, 'error'));
  }, [show]);

  if (!show || !form) return null;

  const close = () => setState({ showSettings: false });

  const save = async () => {
    setBusy(true);
    try {
      await api('/settings', { method: 'POST', body: JSON.stringify(form) });
      toast('✅ Đã lưu cài đặt');
      close();
    } catch (e) {
      toast(`Lưu lỗi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={close}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#161a21] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-white">⚙️ Cài đặt</h2>
          <button onClick={close} className="rounded-lg px-2 py-1 text-gray-400 hover:bg-white/10">✕</button>
        </div>

        <div className="space-y-4 p-5">
          {/* Telegram */}
          <div>
            <div className="mb-2 text-[13px] font-bold text-gray-300">🤖 Telegram</div>
            <Field label="Bot Token (từ @BotFather)" hint="Để trống nếu không cần báo Telegram">
              <input value={form.telegramBotToken} onChange={(e) => set({ telegramBotToken: e.target.value })}
                placeholder="123456789:AA…" className={inputCls} />
            </Field>
            <Field label="Chat ID (từ @userinfobot)">
              <input value={form.telegramChatId} onChange={(e) => set({ telegramChatId: e.target.value })}
                placeholder="-100123456789" className={inputCls} />
            </Field>
          </div>

          {/* SMTP outbound */}
          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-[13px] font-bold text-gray-300">📤 SMTP gửi mail (từ dashboard)</div>
            <Field label="Host" hint="vd: smtp.gmail.com">
              <input value={form.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Port">
                <input type="number" value={form.smtpPort} onChange={(e) => set({ smtpPort: Number(e.target.value) })}
                  className={inputCls} />
              </Field>
              <Field label="Bảo mật (SSL/TLS)">
                <select value={form.smtpSecure ? '1' : '0'}
                  onChange={(e) => set({ smtpSecure: e.target.value === '1' })}
                  className={inputCls}>
                  <option value="0">Không (STARTTLS)</option>
                  <option value="1">Có (SSL)</option>
                </select>
              </Field>
            </div>
            <Field label="Tài khoản">
              <input value={form.smtpUser} onChange={(e) => set({ smtpUser: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Mật khẩu ứng dụng">
              <input type="password" value={form.smtpPass} onChange={(e) => set({ smtpPass: e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="Tên người gửi">
              <input value={form.smtpFromName} onChange={(e) => set({ smtpFromName: e.target.value })}
                className={inputCls} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <button onClick={close} className="rounded-lg bg-white/10 px-4 py-2 text-[13px] text-gray-300 hover:bg-white/20">
              Hủy
            </button>
            <button onClick={save} disabled={busy}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-indigo-400 disabled:opacity-50">
              {busy ? 'Đang lưu…' : '💾 Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] placeholder:text-gray-500 ' +
  'focus:border-indigo-400/60 focus:outline-none';

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[12px] font-semibold text-gray-400">{label}</label>
        {hint && <span className="text-[11px] text-gray-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}