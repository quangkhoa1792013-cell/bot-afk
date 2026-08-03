import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { User, Server, Plus, Trash2, Check, Layers, X, Key, ShieldCheck, Gamepad2 } from 'lucide-react';
import { AccountSummary, AccountProfile } from '../types';

interface MCCAccountSelectorProps {
  accounts: AccountSummary[];
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onAddAccount: (profile: Omit<AccountProfile, 'id'>) => void;
  onDeleteAccount: (accountId: string) => void;
  onStartMCC: () => void;
  onStopMCC: () => void;
}

export const MCCAccountSelector: React.FC<MCCAccountSelectorProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onAddAccount,
  onDeleteAccount,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '-',
    accountType: 'mojang',
    serverHost: '',
    serverPort: 25565,
    minecraftVersion: 'auto',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.serverHost.trim()) return;

    onAddAccount({
      name: formData.name.trim() || formData.username.trim(),
      username: formData.username.trim(),
      password: formData.password || '-',
      accountType: formData.accountType,
      serverHost: formData.serverHost.trim(),
      serverPort: Number(formData.serverPort) || 25565,
      minecraftVersion: formData.minecraftVersion,
    });

    setFormData({
      name: '',
      username: '',
      password: '-',
      accountType: 'mojang',
      serverHost: '',
      serverPort: 25565,
      minecraftVersion: 'auto',
    });
    setShowAddModal(false);
  };

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Account Tabs Header */}
        <div className="flex items-center gap-2 text-slate-300 font-medium text-sm shrink-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <span>Danh Sách Tài Khoản Bot:</span>
          <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
            {accounts.length} Bots
          </span>
        </div>

        {/* Account Cards Row */}
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

                {/* Delete Button (If more than 1 account) */}
                {accounts.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn bot profile "${acc.name}" (${acc.username}) không?`)) {
                        onDeleteAccount(acc.id);
                      }
                    }}
                    title="Xóa vĩnh viễn tài khoản này"
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Account Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 font-medium text-xs transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Acc Bot</span>
          </button>
        </div>
      </div>

      {/* Add Account Modal - Rendered via Portal directly to body to avoid backdrop clipping */}
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
                  className="relative z-10 bg-slate-900 border border-slate-750/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-emerald-950/30 overflow-hidden"
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
                          Thêm Account & Bot Server Mới
                        </h3>
                        <p className="text-xs text-slate-400">Tạo profile bot Minecraft kết nối tự động</p>
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
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Tên Gợi Nhớ (Profile Label)
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Bot Farm Survival, Bot Skyblock 2..."
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
                          placeholder="york-mark.gl.joinmc.link hoặc aquamc.vn"
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
                          placeholder="Dấu '-' nếu dùng Offline"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-mono transition-all placeholder:text-slate-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Loại Acc</label>
                        <select
                          value={formData.accountType}
                          onChange={(e) => setFormData({ ...formData, accountType: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all cursor-pointer"
                        >
                          <option value="mojang">Mojang / Offline (Không Pass)</option>
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
                          <option value="1.20.4">1.20.4</option>
                          <option value="1.20.1">1.20.1</option>
                          <option value="1.19.4">1.19.4</option>
                          <option value="1.18.2">1.18.2</option>
                          <option value="1.16.5">1.16.5</option>
                          <option value="1.12.2">1.12.2</option>
                          <option value="1.8.9">1.8.9</option>
                        </select>
                      </div>
                    </div>

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
                        Tạo Acc Bot Mới
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

