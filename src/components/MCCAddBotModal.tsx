import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { User, Server, Plus, Check, X, Key, ShieldCheck, Gamepad2, Bot, FileText, Bookmark, BookmarkPlus, Trash } from 'lucide-react';
import { AccountProfile } from '../types';
import { MC_VERSIONS } from '../lib/mcVersions';
import {
  loadSavedAccounts,
  saveSavedAccount,
  deleteSavedAccount,
  resolveAccountCredentials,
  SavedAccount,
} from '../lib/savedAccounts';

interface MCCAddBotModalProps {
  open: boolean;
  onClose: () => void;
  scripts: { name: string; content: string }[];
  onAddAccount: (profile: Omit<AccountProfile, 'id'>) => void;
}

export const MCCAddBotModal: React.FC<MCCAddBotModalProps> = ({ open, onClose, scripts, onAddAccount }) => {
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

  if (!open) return null;

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
    onClose();
  };

  const selectedScript = scripts.find((s) => s.name === formData.script);

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
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
              onClick={onClose}
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
                onClick={onClose}
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
    </AnimatePresence>,
    document.body
  );
};