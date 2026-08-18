import { useState } from 'react';
import {
  useStore, setState, setProfileTab, updateProfile, toast, esc,
  fmtFull, type Profile,
} from '../store';
import ProfileModal from './ProfileModal';
import ProfileMailList from './ProfileMailList';

/** Workspace của 1 Profile (Web-in-Web):
 *  - Tab 🌐 Bot Web: nhúng web local của bot qua iframe
 *  - Tab 📥 Mail: danh sách mail riêng của assigned_email
 *  - Tab ℹ️ Thông tin: chi tiết + ghi chú
 *  Khi có mail mới tới email của profile -> banner flash + badge tab Mail. */
export default function ProfileWorkspace() {
  const profiles = useStore((s) => s.profiles);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const tab = useStore((s) => s.profileTab);
  const flash = useStore((s) => s.profileFlash);
  const [editOpen, setEditOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const profile: Profile | null = profiles.find((p) => p.id === activeProfileId) ?? null;

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-500">
        <div className="text-4xl">🤖</div>
        <div>Profile không tồn tại hoặc đã bị xóa.</div>
        <button
          onClick={() => setState({ activeProfileId: null, folder: 'profiles' })}
          className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] hover:bg-white/10"
        >
          ← Quay lại danh sách Profile
        </button>
      </div>
    );
  }

  const isFlashing = flash[profile.id] !== undefined;
  const inactive = profile.status === 'inactive';

  const toggleStatus = async () => {
    await updateProfile(profile.id, { status: inactive ? 'active' : 'inactive' });
    toast(inactive ? `Đã kích hoạt <b>${esc(profile.name)}</b>` : `Đã tạm tắt <b>${esc(profile.name)}</b>`);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* Thanh trên: quay lại + tên + trạng thái + hành động */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0f1115]/95 px-4 py-2.5 backdrop-blur">
        <button
          onClick={() => setState({ activeProfileId: null, folder: 'profiles' })}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-indigo-300 hover:bg-white/10"
        >
          ← Quản lý Profile
        </button>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold text-white">{profile.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold
                ${inactive ? 'bg-white/10 text-gray-400' : 'bg-emerald-500/15 text-emerald-300'}`}
            >
              {inactive ? '⚪ Inactive' : '🟢 Active'}
            </span>
            {isFlashing && (
              <span className="profile-ping h-2.5 w-2.5 rounded-full bg-amber-400" title="Có mail mới!" />
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-gray-500">{profile.assignedEmail}</div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setEditOpen(true)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-gray-300 hover:bg-white/10"
        >
          ✏️ Sửa
        </button>
        <button
          onClick={toggleStatus}
          className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold
            ${inactive
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
        >
          {inactive ? '▶️ Kích hoạt' : '⏸ Tạm tắt'}
        </button>
      </div>

      {/* Banner mail mới (flash trên tab của profile này) */}
      {isFlashing && (
        <div className="profile-flash flex items-center gap-2 border-b border-amber-400/40 bg-amber-400/10 px-4 py-2 text-[13px] text-amber-200">
          <span className="profile-ping h-2.5 w-2.5 rounded-full bg-amber-400" />
          📥 <b>{esc(profile.name)}</b> vừa nhận mail mới tới <span className="font-mono">{esc(profile.assignedEmail)}</span>!
          <button
            onClick={() => setProfileTab('mail')}
            className="ml-1 rounded-lg bg-amber-400/90 px-2.5 py-1 text-[12px] font-bold text-black hover:bg-amber-300"
          >
            Xem ngay
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 px-4 pt-2">
        <TabBtn active={tab === 'web'} onClick={() => setProfileTab('web')}>🌐 Bot Web</TabBtn>
        <TabBtn active={tab === 'mail'} onClick={() => setProfileTab('mail')}>
          📥 Mail
          {profile.unreadCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold text-black">
              {profile.unreadCount}
            </span>
          )}
        </TabBtn>
        <TabBtn active={tab === 'info'} onClick={() => setProfileTab('info')}>ℹ️ Thông tin</TabBtn>
      </div>

      <div className="min-w-0 flex-1">
        {tab === 'web' && (
          <BotWebTab profile={profile} iframeKey={iframeKey} onReload={() => setIframeKey((k) => k + 1)} />
        )}
        {tab === 'mail' && <ProfileMailList profile={profile} />}
        {tab === 'info' && <InfoTab profile={profile} />}
      </div>

      {editOpen && <ProfileModal profile={profile} onClose={() => setEditOpen(false)} />}
    </section>
  );
}

/* ---------------- Tab Bot Web (iframe nhúng web local của bot) ---------------- */

function BotWebTab({ profile, iframeKey, onReload }: {
  profile: Profile;
  iframeKey: number;
  onReload: () => void;
}) {
  const url = profile.targetUrl.trim();

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar iframe */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
        <span className="shrink-0 text-[12px] text-gray-500">🌐</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-indigo-300">{url || '(chưa đặt target_url)'}</span>
        <button
          onClick={onReload}
          disabled={!url}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-gray-300 hover:bg-white/10 disabled:opacity-40"
          title="Tải lại iframe"
        >
          🔄 Tải lại
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-gray-300 hover:bg-indigo-500/20"
            title="Mở ở tab mới"
          >
            ↗ Tab mới
          </a>
        )}
      </div>

      {/* Khung nhúng web local của bot */}
      {url ? (
        <div className="relative min-h-0 flex-1 bg-[#1a1e26]">
          <iframe
            key={iframeKey}
            title={`Bot web: ${profile.name}`}
            src={url}
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-gray-500">
          <div className="text-4xl">🕸</div>
          <div className="text-sm">Profile này chưa có <span className="font-mono text-indigo-300">target_url</span>.</div>
          <div className="text-[12px] text-gray-600">Bấm ✏️ Sửa ở trên để đặt URL web local của bot (vd: http://localhost:8080).</div>
        </div>
      )}

      <div className="border-t border-white/10 px-4 py-1.5 text-[11px] text-gray-600">
        💡 Nếu trang trống: bot web có thể chặn nhúng (X-Frame-Options) — bấm <b>↗ Tab mới</b> để mở riêng.
      </div>
    </div>
  );
}

/* ---------------- Tab Thông tin ---------------- */

function InfoTab({ profile }: { profile: Profile }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-[15px] font-bold text-white">{profile.name}</h2>
        <div className="mt-3 space-y-2 text-[13px]">
          <InfoRow label="📧 assigned_email" value={profile.assignedEmail} mono />
          <InfoRow label="🌐 target_url" value={profile.targetUrl || '—'} mono />
          <InfoRow label="📥 Mail đã nhận" value={`${profile.mailCount} mail · ${profile.unreadCount} chưa đọc`} />
          <InfoRow label="🟢 Trạng thái" value={profile.status === 'active' ? 'Active' : 'Inactive'} />
          <InfoRow label="🕐 Tạo lúc" value={fmtFull(profile.createdAt)} />
          <InfoRow label="🕐 Sửa lúc" value={fmtFull(profile.updatedAt)} />
          {profile.notes && (
            <div>
              <div className="mt-2 text-[12px] font-semibold text-gray-400">📝 Ghi chú</div>
              <div className="mt-1 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[13px] text-gray-300">
                {profile.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`min-w-0 truncate text-right ${mono ? 'font-mono text-indigo-300' : 'text-gray-200'}`}>{value}</span>
    </div>
  );
}

/* ---------------- Tab button ---------------- */

function TabBtn({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-lg px-3.5 py-2 text-[13px] font-semibold transition
        ${active
          ? 'border-b-2 border-indigo-400 bg-indigo-500/10 text-indigo-200'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
    >
      {children}
    </button>
  );
}