import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Server, Plus, Trash2, Layers, X, AlertTriangle } from 'lucide-react';
import { AccountSummary } from '../types';
import { MCCAddBotModal } from './MCCAddBotModal';

interface MCCAccountSelectorProps {
  accounts: AccountSummary[];
  activeAccountId: string;
  scripts: { name: string; content: string }[];
  onSelectAccount: (accountId: string) => void;
  onAddAccount: (profile: any) => void;
  onDeleteAccount: (accountId: string) => void;
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

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDeleteAccount(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Account Tabs Header */}
        <div className="flex items-center gap-2 text-slate-300 font-medium text-sm shrink-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <span>Danh Sách Bot</span>
          <span className="badge badge-slate">{accounts.length} Bots</span>
        </div>

        {/* Empty State: no bots -> show create CTA only */}
        {accounts.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="text-slate-500">Chưa có bot nào.</span>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" />
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
                  <span className={`dot ${acc.running ? 'dot-on' : 'dot-off'}`} />
                  {acc.running && <span className="absolute w-4 h-4 bg-emerald-400/30 rounded-full animate-ping" />}

                  <div className="flex flex-col text-left pr-1">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-100">
                      <span>{acc.name}</span>
                      <span className="badge badge-green !text-[9px] !px-1">{acc.username}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                      <Server className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate max-w-[140px]">
                        {acc.serverHost}:{acc.serverPort}
                      </span>
                    </div>
                  </div>

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

      {/* Add Bot Modal */}
      <MCCAddBotModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        scripts={scripts}
        onAddAccount={onAddAccount}
      />

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
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 cursor-pointer"
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