import React, { useMemo, useState } from 'react';
import { CheckSquare, Square, Send, Rocket, Timer, Globe, Activity, Users, TerminalSquare, Trash2, Plus, RotateCcw, Power, LayoutGrid } from 'lucide-react';
import { AccountSummary, MCCProcessStatus } from '../types';
import { MCCAddBotModal } from './MCCAddBotModal';

export interface DashboardBot extends AccountSummary {
  status?: MCCProcessStatus;
}

interface MCCDashboardProps {
  accounts: DashboardBot[];
  onSelectAccount: (accountId: string) => void;
  onEnterBot: (accountId: string) => void;
  onBroadcastCommand: (accountIds: string[], command: string, staggerMs: number) => void;
  onBroadcastStart: (accountIds: string[], staggerMs: number) => void;
  onBroadcastStop: (accountIds: string[]) => void;
  onStartBot?: (accountId: string) => void;
  onStopBot?: (accountId: string) => void;
  onToggleAutoRelog?: (accountId: string, enabled: boolean) => void;
  onDeleteBot?: (accountId: string) => void;
  scripts?: { name: string; content: string }[];
  onAddBot?: (profile: any) => void;
}

const formatUptime = (s: number) => {
  if (!s || s <= 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
};

export const MCCDashboard: React.FC<MCCDashboardProps> = ({
  accounts,
  onSelectAccount,
  onEnterBot,
  onBroadcastCommand,
  onBroadcastStart,
  onBroadcastStop,
  onStartBot,
  onStopBot,
  onToggleAutoRelog,
  onDeleteBot,
  scripts,
  onAddBot,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [command, setCommand] = useState('');
  const [stagger, setStagger] = useState(8); // seconds between bots
  const [activeCommand, setActiveCommand] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = accounts.length > 0 && selected.size === accounts.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(accounts.map((a) => a.id)));
  };

  const selectedAccounts = accounts.filter((a) => selected.has(a.id));

  const handleSend = () => {
    if (selected.size === 0 || !command.trim()) return;
    onBroadcastCommand(Array.from(selected), command.trim(), stagger * 1000);
    setActiveCommand(command.trim());
    setCommand('');
  };

  const handleStart = () => {
    if (selected.size === 0) return;
    onBroadcastStart(Array.from(selected), stagger * 1000);
    setActiveCommand('');
  };

  const handleStop = () => {
    if (selected.size === 0) return;
    onBroadcastStop(Array.from(selected));
  };

  const stats = useMemo(() => {
    const running = accounts.filter((a) => a.running).length;
    return { total: accounts.length, running, stopped: accounts.length - running };
  }, [accounts]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header + Stats */}
      <div className="panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Dashboard Trung Tâm</h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Chọn nhiều bot, gửi 1 hành động chung — có giãn cách để tránh kick "login too fast"
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="stat">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Tổng bot</div>
          </div>
          <div className="stat !border-emerald-800/40">
            <div className="stat-value text-emerald-400">{stats.running}</div>
            <div className="stat-label">Đang chạy</div>
          </div>
          <div className="stat !border-rose-800/40">
            <div className="stat-value text-rose-400">{stats.stopped}</div>
            <div className="stat-label">Đã dừng</div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm Bot
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Users className="w-4 h-4 text-indigo-400" />
            Hành Động Hàng Loạt
            <button onClick={toggleAll} className="btn btn-ghost !py-1 !px-2">
              {allSelected ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
              {allSelected ? 'Bỏ tất cả' : 'Chọn tất cả'}
            </button>
          </div>
          <span className="badge badge-indigo">Đã chọn {selected.size} bot</span>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch gap-2">
          <div className="flex-1 flex items-center gap-2">
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Lệnh gửi cho các bot đã chọn (vd: /login ..., /tpa...)"
              className="input input-mono flex-1"
            />
            <button
              onClick={handleSend}
              disabled={selected.size === 0 || !command.trim()}
              className="btn btn-primary"
            >
              <Send className="w-3.5 h-3.5" /> Gửi
            </button>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-amber-400" />
              <label className="text-[11px] text-slate-400 font-mono">Giãn cách / bot (s):</label>
              <input
                type="number"
                min={0}
                max={120}
                value={stagger}
                onChange={(e) => setStagger(Math.max(0, Number(e.target.value) || 0))}
                className="input-sm w-16 text-center"
              />
            </div>

            <button onClick={handleStart} disabled={selected.size === 0} className="btn btn-amber">
              <Rocket className="w-3.5 h-3.5" /> Start
            </button>
            <button onClick={handleStop} disabled={selected.size === 0} className="btn btn-danger">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          </div>
        </div>

        {activeCommand && (
          <div className="text-[11px] font-mono text-indigo-300 bg-indigo-950/40 border border-indigo-800/50 rounded-lg px-3 py-2">
            📤 Đã gửi "{activeCommand}" đến {selected.size} bot (giãn cách {stagger}s)...
          </div>
        )}
      </div>

      {/* Bots Table */}
      <div className="table-wrap">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-8">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                    {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th>Bot</th>
                <th>Server</th>
                <th>Trạng thái</th>
                <th>Online</th>
                <th>PID</th>
                <th className="text-right">Điều khiển</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm font-mono">
                    Chưa có bot nào. Bấm "Thêm Bot" để tạo con đầu tiên.
                  </td>
                </tr>
              )}
              {accounts.map((acc) => {
                const isSel = selected.has(acc.id);
                const status = acc.running;
                return (
                  <tr
                    key={acc.id}
                    onClick={() => toggle(acc.id)}
                    className={`cursor-pointer transition-colors ${isSel ? 'row-selected' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      {isSel ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4 text-slate-600" />}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`dot ${status ? 'dot-on' : 'dot-off'}`} />
                        <div>
                          <div className="text-slate-100 font-semibold text-xs">{acc.name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{acc.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-400">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-500" />
                        {acc.serverHost}:{acc.serverPort}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {status ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <Activity className="w-3 h-3" /> ONLINE
                        </span>
                      ) : (
                        <span className="text-rose-400">OFFLINE</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-400">
                      {status ? formatUptime(acc.uptimeSeconds) : '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{acc.pid || '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onEnterBot(acc.id)}
                          title="Vào điều khiển bot này"
                          className="btn btn-ghost !px-2.5 !py-1.5 text-[11px]"
                        >
                          <TerminalSquare className="w-3 h-3" /> Điều khiển
                        </button>
                        {acc.running ? (
                          <button
                            onClick={() => onStopBot?.(acc.id)}
                            title="Dừng bot này"
                            className="btn btn-ghost !px-2.5 !py-1.5 text-[11px] !text-rose-300 hover:!bg-rose-950/40"
                          >
                            <Power className="w-3 h-3" /> Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => onStartBot?.(acc.id)}
                            title="Start bot này"
                            className="btn btn-ghost !px-2.5 !py-1.5 text-[11px] !text-emerald-300"
                          >
                            <Power className="w-3 h-3" /> Start
                          </button>
                        )}
                        <button
                          onClick={() => onToggleAutoRelog?.(acc.id, !acc.autoRelog)}
                          title={acc.autoRelog ? 'Tắt AutoRelog cho bot này' : 'Bật AutoRelog cho bot này'}
                          className={`btn !px-2.5 !py-1.5 text-[11px] ${
                            acc.autoRelog ? 'btn-amber' : 'btn-ghost'
                          }`}
                        >
                          <RotateCcw className="w-3 h-3" /> {acc.autoRelog ? 'Relog: BẬT' : 'Relog'}
                        </button>
                        <button
                          onClick={() => onDeleteBot?.(acc.id)}
                          title="Xóa bot này"
                          className="btn-icon text-[11px]"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Bot Modal */}
      {onAddBot && scripts && (
        <MCCAddBotModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          scripts={scripts}
          onAddAccount={onAddBot}
        />
      )}
    </div>
  );
};