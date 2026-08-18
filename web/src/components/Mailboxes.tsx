import { useState } from 'react';
import {
  useStore, createMailbox, updateMailbox, removeMailbox, goToMailbox,
  fmtTime, toast, esc, type Mailbox,
} from '../store';

/** Trang "Địa chỉ hòm thư": tạo/quản lý các địa chỉ.
 *  Bấm vào một địa chỉ => chuyển sang "Hộp thư đến" của riêng nó. */
export default function Mailboxes() {
  const mailboxes = useStore((s) => s.mailboxes);
  const domain = useStore((s) => s.domain);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Mailbox | null>(null);
  const [editName, setEditName] = useState('');
  const [editNote, setEditNote] = useState('');
  const [filter, setFilter] = useState('');

  const preview = name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64);
  const list = mailboxes.filter((m) => !filter || m.name.includes(filter) || m.note.includes(filter));

  const onCreate = async () => {
    const clean = name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(clean)) {
      toast('Tên chỉ gồm chữ thường, số, dấu chấm, gạch ngang, gạch dưới', 'error');
      return;
    }
    setBusy(true);
    try {
      await createMailbox(clean, note.trim());
      toast(`Đã tạo <b>${esc(clean)}@${esc(domain)}</b> 🎉`);
      setName('');
      setNote('');
    } catch (e) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    const clean = editName.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(clean)) {
      toast('Tên chỉ gồm chữ thường, số, dấu chấm, gạch ngang, gạch dưới', 'error');
      return;
    }
    try {
      await updateMailbox(editing.id, { name: clean, note: editNote.trim() });
      toast('Đã lưu thay đổi');
      setEditing(null);
    } catch (e) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-[#0f1115]">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <h1 className="text-xl font-bold text-white">📫 Địa chỉ hòm thư</h1>
        <p className="mt-1 text-[13px] text-gray-500">
          Tạo các địa chỉ <span className="text-indigo-300">tên@{domain}</span>. Chỉ mail gửi tới địa chỉ
          đã tạo mới được nhận. Bấm vào một địa chỉ để xem hòm thư riêng của nó.
        </p>

        {/* Form tạo */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="tên địa chỉ (vd: github01)"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
            <span className="text-gray-500">@{domain}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ghi chú (vd: đăng ký GitHub)"
              className="min-w-0 flex-[1.2] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px]
                placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
            />
            <button
              onClick={onCreate}
              disabled={busy || !name.trim()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-[14px] font-semibold text-white
                hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ➕ Tạo
            </button>
          </div>
          {preview && (
            <div className="mt-2 text-[12px] text-gray-500">
              Địa chỉ sẽ là: <span className="font-mono text-indigo-300">{preview}@{domain}</span>
            </div>
          )}
        </div>

        {/* Bộ lọc */}
        {mailboxes.length > 1 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔍 Lọc theo tên / ghi chú…"
            className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px]
              placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
          />
        )}

        {/* Danh sách địa chỉ */}
        {list.length === 0 ? (
          <div className="mt-10 text-center text-gray-500">
            <div className="text-4xl">🏷</div>
            <div className="mt-2 text-sm">Chưa có địa chỉ nào. Tạo địa chỉ đầu tiên ở trên!</div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((mb) =>
              editing?.id === mb.id ? (
                <div key={mb.id} className="rounded-2xl border border-indigo-400/40 bg-indigo-500/10 p-4">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[14px] focus:outline-none"
                  />
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="ghi chú"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] focus:outline-none"
                  />
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={onSaveEdit} className="rounded-lg bg-emerald-500 px-3 py-1 text-[12px] font-bold text-white hover:bg-emerald-400">💾 Lưu</button>
                    <button onClick={() => setEditing(null)} className="rounded-lg bg-white/10 px-3 py-1 text-[12px] text-gray-300 hover:bg-white/20">Hủy</button>
                  </div>
                </div>
              ) : (
                <div
                  key={mb.id}
                  onClick={() => goToMailbox(mb.name)}
                  className="group cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-indigo-400/50 hover:bg-indigo-500/10"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[15px] font-bold text-white">
                        {mb.name}<span className="text-gray-500">@{domain}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-gray-500">{mb.note || '—'}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-bold text-indigo-300">
                      {mb.mailCount} mail
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-gray-600">Tạo {fmtTime(mb.createdAt)} · Bấm để xem hòm thư</span>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(`${mb.name}@${domain}`);
                          toast(`Đã copy <b>${esc(mb.name)}@${esc(domain)}</b>`);
                        }}
                        className="rounded px-1.5 py-0.5 text-sm hover:bg-white/10"
                        title="Copy địa chỉ"
                      >
                        📋
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(mb);
                          setEditName(mb.name);
                          setEditNote(mb.note);
                        }}
                        className="rounded px-1.5 py-0.5 text-sm hover:bg-white/10"
                        title="Sửa"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Xóa địa chỉ ${mb.name}@${domain}? Mail cũ vẫn giữ lại.`)) {
                            removeMailbox(mb.id);
                          }
                        }}
                        className="rounded px-1.5 py-0.5 text-sm hover:bg-red-500/15 hover:text-red-300"
                        title="Xóa"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}