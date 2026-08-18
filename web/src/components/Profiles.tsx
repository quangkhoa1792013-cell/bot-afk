import { useMemo, useState } from 'react';
import {
  useStore, openProfile, removeProfile, toast, esc, fmtTime, avatarGradient,
  type Profile,
} from '../store';
import ProfileModal from './ProfileModal';

/** Trang "Quản lý Profile": danh sách card Profile + tạo/sửa/xóa.
 *  Bấm vào card -> mở Workspace (Bot Web iframe / Mail / Thông tin).
 *  Card nhận mail mới sẽ flash + badge unread tăng. */
export default function Profiles() {
  const profiles = useStore((s) => s.profiles);
  const flash = useStore((s) => s.profileFlash);
  const [modal, setModal] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null });
  const [filter, setFilter] = useState('');

  const list = useMemo(
    () => profiles.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.assignedEmail.includes(filter.toLowerCase())),
    [profiles, filter],
  );

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-[#0f1115]">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header + nút tạo */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">🤖 Quản lý Profile</h1>
            <p className="mt-1 text-[13px] text-gray-500">
              1 Profile = 1 bot (email riêng + web local). Bấm vào Profile để mở điều khiển tập trung (Web-in-Web).
            </p>
          </div>
          <button
            onClick={() => setModal({ open: true, profile: null })}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-indigo-400"
          >
            ➕ Tạo Profile
          </button>
        </div>

        {/* Bộ lọc */}
        {profiles.length > 1 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔍 Lọc theo tên / email…"
            className="mt-3 w-full max-w-md rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px]
              placeholder:text-gray-500 focus:border-indigo-400/60 focus:outline-none"
          />
        )}

        {/* Danh sách card */}
        {list.length === 0 ? (
          <div className="mt-14 text-center text-gray-500">
            <div className="float-slow text-5xl">🤖</div>
            <div className="mt-3 text-sm">Chưa có Profile nào. Tạo Profile đầu tiên để gán email + nhúng web bot!</div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => {
              const isFlashing = flash[p.id] !== undefined;
              return (
                <div
                  key={p.id}
                  onClick={() => openProfile(p.id)}
                  className={`group cursor-pointer rounded-2xl border bg-white/[0.03] p-4 transition
                    ${isFlashing
                      ? 'profile-flash border-amber-400/60'
                      : 'border-white/10 hover:border-indigo-400/50 hover:bg-indigo-500/10'}
                    ${p.status === 'inactive' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[13px] font-bold text-white ${avatarGradient(p.name)}`}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-bold text-white">{p.name}</div>
                        <div className="truncate font-mono text-[11px] text-gray-500">{p.assignedEmail}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isFlashing && (
                        <span className="profile-ping h-2.5 w-2.5 rounded-full bg-amber-400" title="Có mail mới!" />
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold
                          ${p.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-gray-400'}`}
                      >
                        {p.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500">
                    <span className="flex items-center gap-1">
                      {p.targetUrl ? (
                        <>
                          🌐 <span className="truncate font-mono text-indigo-300">{p.targetUrl}</span>
                        </>
                      ) : (
                        <>🌐 <span className="text-gray-600">chưa có web</span></>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      📧 {p.mailCount} mail · <b className={p.unreadCount > 0 ? 'text-amber-300' : ''}>{p.unreadCount} chưa đọc</b>
                    </span>
                  </div>

                  {p.notes && <div className="mt-2 truncate text-[12px] text-gray-500">{p.notes}</div>}

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-gray-600">Tạo {fmtTime(p.createdAt)}</span>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(p.assignedEmail); toast(`Đã copy <b>${esc(p.assignedEmail)}</b>`); }}
                        className="rounded px-1.5 py-0.5 text-sm hover:bg-white/10"
                        title="Copy email"
                      >
                        📋
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setModal({ open: true, profile: p }); }}
                        className="rounded px-1.5 py-0.5 text-sm hover:bg-white/10"
                        title="Sửa"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Xóa Profile "${p.name}"? (Mail cũ vẫn giữ trong hòm thư)`)) {
                            removeProfile(p.id);
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
              );
            })}
          </div>
        )}
      </div>

      {modal.open && <ProfileModal profile={modal.profile} onClose={() => setModal({ open: false, profile: null })} />}
    </section>
  );
}