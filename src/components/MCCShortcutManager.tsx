import React, { useState } from 'react';
import { X, Plus, Trash2, Globe, Zap } from 'lucide-react';
import { CommandShortcut } from '../types';

interface MCCShortcutManagerProps {
  open: boolean;
  onClose: () => void;
  shortcuts: { global: CommandShortcut[]; local: CommandShortcut[] };
  onAddShortcut: (scope: 'global' | 'local', label: string, command: string) => void;
  onDeleteShortcut: (scope: 'global' | 'local', shortcutId: string) => void;
  accountName: string;
  /** 'modal' = popup cửa sổ; 'inline' = nhúng trực tiếp vào tab (mặc định hiện Global) */
  variant?: 'modal' | 'inline';
}

export const MCCShortcutManager: React.FC<MCCShortcutManagerProps> = ({
  open,
  onClose,
  shortcuts,
  onAddShortcut,
  onDeleteShortcut,
  accountName,
  variant = 'modal',
}) => {
  const [tab, setTab] = useState<'global' | 'local'>(variant === 'inline' ? 'global' : 'global');
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');

  if (!open) return null;

  const handleAdd = (scope: 'global' | 'local') => {
    if (!label.trim() || !command.trim()) return;
    onAddShortcut(scope, label.trim(), command.trim());
    setLabel('');
    setCommand('');
  };

  const list = tab === 'global' ? shortcuts.global : shortcuts.local;

  const body = (
    <>
      {/* Tabs */}
      <div className="px-5 pt-4 pb-2 flex gap-2">
        <button
          onClick={() => setTab('global')}
          className={`seg-item ${tab === 'global' ? 'seg-item-active' : ''}`}
        >
          <Globe className="w-3.5 h-3.5" />
          Global (mọi bot)
        </button>
        <button
          onClick={() => setTab('local')}
          className={`seg-item ${tab === 'local' ? 'seg-item-active' : ''}`}
        >
          <Zap className="w-3.5 h-3.5" />
          Local (bot {accountName})
        </button>
      </div>

      {/* Info */}
      <div className="px-5 pb-2">
        <p className="text-[11px] text-slate-400 font-mono">
          {tab === 'global'
            ? 'Phím tắt Global áp dụng cho TẤT CẢ các bot. Thêm 1 lần, dùng cho mọi con.'
            : `Phím tắt Local chỉ áp dụng riêng cho bot ${accountName}.`}
        </p>
      </div>

      {/* Add form */}
      <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
        <input
          type="text"
          placeholder="Nhãn (vd: /tpa home)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd(tab)}
          className="input-sm"
        />
        <input
          type="text"
          placeholder="Lệnh (vd: /tpa khoablabla)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd(tab)}
          className="input-sm"
        />
        <button
          onClick={() => handleAdd(tab)}
          disabled={!label.trim() || !command.trim()}
          className="btn btn-primary"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm
        </button>
      </div>

      {/* List */}
      <div className="px-5 pb-5 space-y-1.5">
        {list.length === 0 && (
          <p className="text-[11px] text-slate-500 font-mono py-4 text-center">
            Chưa có phím tắt {tab === 'global' ? 'global' : 'local'}. Thêm bên trên nhé.
          </p>
        )}
        {list.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 group"
          >
            <span className="text-xs font-semibold text-emerald-300 shrink-0">{s.label}</span>
            <span className="flex-1 text-xs font-mono text-slate-400 truncate">{s.command}</span>
            <button
              onClick={() => onDeleteShortcut(tab, s.id)}
              className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
              title="Xóa phím tắt"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  );

  if (variant === 'inline') {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-100">Phím Tắt Lệnh - Quản Lý Toàn Cục (Global)</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {body}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-100">Phím Tắt Lệnh</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
};