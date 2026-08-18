import { setFolder, useStore, setState, clearAll } from '../store';

const ITEMS: { folder: 'mailboxes' | 'all' | 'inbox' | 'unread' | 'favorite' | 'sent'; label: string; icon: string }[] = [
  { folder: 'mailboxes', label: 'Địa chỉ hòm thư', icon: '📫' },
  { folder: 'all', label: 'Toàn bộ thư', icon: '📥' },
  { folder: 'inbox', label: 'Hộp thư đến', icon: '🗂' },
  { folder: 'unread', label: 'Chưa đọc', icon: '🟢' },
  { folder: 'favorite', label: 'Yêu thích', icon: '⭐' },
  { folder: 'sent', label: 'Đã gửi', icon: '📤' },
];

/** Cột 1 (200px): menu chính. */
export default function Sidebar() {
  const folder = useStore((s) => s.folder);
  const stats = useStore((s) => s.stats);
  const mailboxes = useStore((s) => s.mailboxes);
  const sseOnline = useStore((s) => s.sseOnline);
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  const badgeFor = (f: string): number | null => {
    if (f === 'unread') return stats.unread;
    if (f === 'mailboxes') return mailboxes.length;
    if (f === 'inbox') return stats.total;
    return null;
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[200px] shrink-0 flex-col border-r border-white/10
        bg-[#101318] transition-transform duration-200 lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3.5">
        <span className="text-xl">✉️</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">Hòm thư tạm</div>
          <div className="truncate text-[11px] text-gray-500">{stats.total} mail</div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {ITEMS.map((item) => {
          const active = folder === item.folder;
          const badge = badgeFor(item.folder);
          return (
            <button
              key={item.folder}
              onClick={() => setFolder(item.folder)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition
                ${active ? 'bg-indigo-500/20 font-semibold text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              <span className="w-5 shrink-0 text-center text-sm">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {badge !== null && badge > 0 && (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold
                  ${active ? 'bg-indigo-500/30 text-indigo-200' : 'bg-white/10 text-gray-400'}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Đáy: trạng thái + cài đặt */}
      <div className="border-t border-white/10 p-2">
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-gray-500">
          <span className={`h-2 w-2 shrink-0 rounded-full ${sseOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {sseOnline ? 'Đang kết nối thời gian thực' : 'Mất kết nối'}
        </div>
        <button
          onClick={() => setState({ showSettings: true })}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-gray-400 hover:bg-white/5 hover:text-gray-200"
        >
          <span className="w-5 text-center text-sm">⚙️</span>
          Cài đặt
        </button>
        {stats.total > 0 && (
          <button
            onClick={() => { if (confirm(`Xóa toàn bộ ${stats.total} mail?`)) clearAll(); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-gray-500 hover:bg-red-500/10 hover:text-red-300"
          >
            <span className="w-5 text-center text-sm">🗑</span>
            Xóa toàn bộ mail
          </button>
        )}
      </div>
    </aside>
  );
}