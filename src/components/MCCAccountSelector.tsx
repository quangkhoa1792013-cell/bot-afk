import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { User, Server, Plus, Trash2, Check, Layers, X, Key, ShieldCheck, Gamepad2, Bot, FileText, AlertTriangle, Bookmark, BookmarkPlus, Trash } from 'lucide-react';
import { AccountSummary, AccountProfile } from '../types';
import { MC_VERSIONS } from '../lib/mcVersions';
import {
  loadSavedAccounts,
  saveSavedAccount,
  deleteSavedAccount,
  resolveAccountCredentials,
  SavedAccount,
} from '../lib/savedAccounts';

interface MCCAccountSelectorProps {
  accounts: AccountSummary[];
  activeAccountId: string;
  scripts: { name: string; content: string }[];
  onSelectAccount: (accountId: string) => void;
  onAddAccount: (profile: Omit<AccountProfile, 'id'>) => void;
  onDeleteAccount: (accountId: string) => void;
  onStartMCC: () => void;
  onStopMCC: () => void;
}

export const MCCAccountSelector: React.FC<MCCAccountSelectorProps> = ({
  accounts,
  activeAccountId,
  scripts,
  onSelectAccount,
  onAddAccount,
  onDeleteAccount,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AccountSummary | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => loadSavedAccounts());
  const [saveToVault, setSaveToVault] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '-',
    accountType: 'offline',
    serverHost: '',
    serverPort: 25565,
    minecraftVersion: 'auto',
    script: '',
  });

  const applySavedAccount = (acc: SavedAccount) => {
    setFormData((prev) => ({
      ...prev,
      username: acc.username,
      password: acc.accountType === 'offline' ? '-' : acc.password,
      accountType: acc.accountType,
      name: acc.username,
    }));
  };

  const handleRemoveSavedAccount = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedAccounts(deleteSavedAccount(id));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.serverHost.trim()) return;

    const creds = resolveAccountCredentials(formData.accountType, formData.password);

    if (saveToVault) {
      setSavedAccounts(
        saveSavedAccount({
          username: formData.username.trim(),
          password: creds.password,
          accountType: formData.accountType as SavedAccount['accountType'],
        })
      );
    }

    onAddAccount({
      name: formData.name.trim() || formData.username.trim(),
      username: formData.username.trim(),
      password: creds.password,
      accountType: creds.accountType,
      serverHost: formData.serverHost.trim(),
      serverPort: Number(formData.serverPort) || 25565,
      minecraftVersion: formData.minecraftVersion,
      script: formData.script || undefined,
    });

    setFormData({
      name: '',
      username: '',
      password: '-',
      accountType: 'offline',
      serverHost: '',
      serverPort: 25565,
      minecraftVersion: 'auto',
      script: '',
    });
    setShowAddModal(false);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDeleteAccount(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const selectedScript = scripts.find((s) => s.name === formData.script);

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Account Tabs Header */}
        <div className="flex items-center gap-2 text-slate-300 font-medium text-sm shrink-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <span>Danh Sách Bot:</span>
          <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
            {accounts.length} Bots
          </span>
        </div>

        {/* Empty State: no bots -> show create CTA only */}
        {accounts.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="text-slate-500">Chưa có bot nào.</span>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-950/40 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              Tạo Bot Đầu Tiên
            </button>
          </div>
        ) : (
          /* Bot Cards Row */
          <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin scrollbar-thumb-slate-700">
            {accounts.map((acc) => {
              const isSelected = acc.id === activeAccountId;
              return (
                <div
                  key={acc.id}
                  onClick={() => onSelectAccount(acc.id)}
                  className={`group cursor-pointer relative flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all duration-200 shrink-0 select-none ${
                    isSelected
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30'
                      : 'bg-slate-850 border-slate-750/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Status Dot */}
                  <div className="relative flex items-center justify-center">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        acc.running ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    {acc.running && (
                      <span className="absolute w-4 h-4 bg-emerald-400/30 rounded-full animate-ping" />
                    )}
                  </div>

                  {/* Account Details */}
                  <div className="flex flex-col text-left pr-1">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-100">
                      <span>{acc.name}</span>
                      <span className="text-[10px] font-mono text-emerald-400/90 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                        {acc.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                      <Server className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate max-w-[140px]">
                        {acc.serverHost}:{acc.serverPort}
                      </span>
                    </div>
                  </div>

                  {/* Delete Button (always available) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(acc);
                    }}
                    title="Xóa vĩnh viễn bot này"
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Add Bot Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 font-medium text-xs transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Bot</span>
            </button>
          </div>
        )}
      </div>

      {/* Add Bot Modal - Rendered via Portal directly to body to avoid backdrop clipping */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showAddModal && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                {/* Backdrop Overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowAddModal(false)}
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
                />

                {/* Centered Modal Content Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 320 }}
                  className="relative z-10 bg-slate-900 border border-slate-750/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-emerald-950/30 overflow-hidden max-h-[90vh] overflow-y-auto"
                >
                  {/* Decorative glow background */}
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                  {/* Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                          Tạo Bot Server Mới
                        </h3>
                        <p className="text-xs text-slate-400">Mỗi bot là 1 thư mục riêng trong bots/</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddModal(false)}
                      className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleCreate} className="space-y-4">
                    {/* Saved Accounts (Google-style) */}
                    {savedAccounts.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                          Acc Đã Lưu (chọn để điền nhanh)
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {savedAccounts.map((acc) => (
                            <span
                              key={acc.id}
                              onClick={() => applySavedAccount(acc)}
                              title={`${acc.username} (${acc.accountType === 'offline' ? 'Offline' : acc.accountType})`}
                              className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-emerald-500 text-xs text-slate-200 font-mono cursor-pointer transition-all"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${acc.accountType === 'offline' ? 'bg-emerald-400' : 'bg-indigo-400'}`} />
                              {acc.username}
                              <button
                                type="button"
                                onClick={(e) => handleRemoveSavedAccount(acc.id, e)}
                                className="text-slate-500 hover:text-rose-400 transition-colors"
                                title="Xóa acc đã lưu"
                              >
                                <Trash className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Tên Bot (thư mục bots/tên)
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: khoablabla, afk-1..."
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-slate-600"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-emerald-400" />
                          IP Server (Host) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="aquamc.vn hoặc york-mark.gl.joinmc.link"
                          value={formData.serverHost}
                          onChange={(e) => setFormData({ ...formData, serverHost: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-mono transition-all placeholder:text-slate-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Port</label>
                        <input
                          type="number"
                          value={formData.serverPort}
                          onChange={(e) => setFormData({ ...formData, serverPort: Number(e.target.value) })}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-mono transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-emerald-400" />
                          Username / Tên Acc <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="geasf"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-mono transition-all placeholder:text-slate-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-emerald-400" />
                          Mật Khẩu
                        </label>
                        <input
                          type="password"
                          disabled={formData.accountType === 'offline'}
                          placeholder={formData.accountType === 'offline' ? 'Offline - tự động dùng "-"' : 'Mật khẩu acc'}
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-mono transition-all placeholder:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Script Login Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        Script Login (tự chạy sau khi join)
                      </label>
                      <select
                        value={formData.script}
                        onChange={(e) => setFormData({ ...formData, script: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all cursor-pointer"
                      >
                        <option value="">— Không dùng script —</option>
                        {scripts.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {selectedScript && (
                        <pre className="mt-1.5 bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] font-mono text-emerald-300 whitespace-pre-wrap overflow-x-auto max-h-24 overflow-y-auto">
                          {selectedScript.content}
                        </pre>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Loại Acc</label>
                        <select
                          value={formData.accountType}
                          onChange={(e) => {
                            const t = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              accountType: t,
                              password: t === 'offline' ? '-' : prev.password === '-' ? '' : prev.password,
                            }));
                          }}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all cursor-pointer"
                        >
                          <option value="offline">Offline Mode (tự động dùng "-")</option>
                          <option value="mojang">Mojang / Premium (có mật khẩu)</option>
                          <option value="microsoft">Microsoft Account</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />
                          Phiên Bản MC
                        </label>
                        <select
                          value={formData.minecraftVersion}
                          onChange={(e) => setFormData({ ...formData, minecraftVersion: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all cursor-pointer"
                        >
                          <option value="auto">Auto (Tự Phát Hiện)</option>
                          <option value="1.21.11">1.21.11 (khuyến nghị cho aquamc)</option>
                          <option disabled>──────────</option>
                          {MC_VERSIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Save to vault (Google-style) */}
                    <label className="flex items-center gap-2.5 bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-3 cursor-pointer hover:border-amber-500/40 transition-all select-none">
                      <input
                        type="checkbox"
                        checked={saveToVault}
                        onChange={(e) => setSaveToVault(e.target.checked)}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className="flex items-center gap-2 text-xs text-slate-300">
                        <BookmarkPlus className="w-4 h-4 text-amber-400" />
                        Lưu acc này vào bộ nhớ để lần sau không phải nhập lại (như mật khẩu đã lưu của Google)
                      </span>
                    </label>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-sm font-medium transition-all"
                      >
                        Hủy Bỏ
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-950/50 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Check className="w-4 h-4" />
                        Tạo Bot Mới
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Delete Confirmation Modal - GUI instead of confirm() */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {deleteTarget && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setDeleteTarget(null)}
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 320 }}
                  className="relative z-10 bg-slate-900 border border-rose-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-rose-950/30"
                >
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-4">
                    <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">Xóa Bot?</h3>
                      <p className="text-xs text-slate-400">
                        Thao tác này sẽ xóa vĩnh viễn thư mục <code className="text-rose-300 font-mono">bots/{deleteTarget.id}/</code>
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm mb-5 space-y-1 font-mono">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Tên bot:</span>
                      <span className="text-slate-100 font-bold">{deleteTarget.name}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Username:</span>
                      <span className="text-slate-100">{deleteTarget.username}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Server:</span>
                      <span className="text-slate-100">{deleteTarget.serverHost}:{deleteTarget.serverPort}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Trạng thái:</span>
                      <span className={deleteTarget.running ? 'text-emerald-400' : 'text-rose-400'}>
                        {deleteTarget.running ? 'Đang chạy' : 'Đã dừng'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setDeleteTarget(null)}
                      className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-sm font-medium transition-all"
                    >
                      Hủy Bỏ
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Trash2 className="w-4 h-4" />
                      Xóa Vĩnh Viễn
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
