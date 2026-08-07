import React from 'react';
import { Play, Square, RotateCcw, RefreshCw, Cpu, Server, User } from 'lucide-react';
import { MCCProcessStatus } from '../types';

interface MCCHeaderProps {
  status: MCCProcessStatus;
  wsConnected: boolean;
  hasBot: boolean;
  autoRelog: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onToggleAutoRelog: (enabled: boolean) => void;
}

export const MCCHeader: React.FC<MCCHeaderProps> = ({
  status,
  wsConnected,
  hasBot,
  autoRelog,
  onStart,
  onStop,
  onRestart,
  onToggleAutoRelog,
}) => {
  const formatUptime = (sec: number) => {
    if (!sec) return '0s';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <header className="sticky top-0 z-20 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-5 py-3">
      <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">
              MCC Control Center
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              {status.username} @ {status.serverHost}:{status.serverPort}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className={`badge ${wsConnected ? 'badge-green' : 'badge-red'}`}>
            <span className={`dot ${wsConnected ? 'dot-on' : 'dot-off'}`} />
            {wsConnected ? 'WS Connected' : 'WS Offline'}
          </span>

          <span className={`badge ${status.running ? 'badge-green' : 'badge-slate'}`}>
            <Cpu className="w-3 h-3" />
            {status.running ? `MCC Online • ${formatUptime(status.uptimeSeconds)}` : 'MCC Offline'}
          </span>

          <span className="badge badge-indigo">
            <Server className="w-3 h-3" />
            {status.serverHost}:{status.serverPort}
          </span>

          <span className="badge badge-amber">
            <User className="w-3 h-3" />
            {status.username || '—'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!hasBot ? (
            <span className="text-xs text-slate-500">Tạo bot trước khi chạy MCC</span>
          ) : !status.running ? (
            <button onClick={onStart} className="btn btn-primary">
              <Play className="w-4 h-4 fill-current" /> Start MCC
            </button>
          ) : (
            <button onClick={onStop} className="btn btn-danger">
              <Square className="w-4 h-4 fill-current" /> Stop MCC
            </button>
          )}

          <button
            onClick={() => onToggleAutoRelog(!autoRelog)}
            disabled={!hasBot}
            className={autoRelog ? 'btn btn-amber' : 'btn btn-ghost'}
            title={autoRelog ? 'Tắt tự động kết nối lại' : 'Bật tự động kết nối lại'}
          >
            <RotateCcw className="w-4 h-4" />
            {autoRelog ? 'AutoRelog: BẬT' : 'AutoRelog: TẮT'}
          </button>

          <button onClick={onRestart} disabled={!hasBot} className="btn btn-ghost" title="Restart MCC">
            <RefreshCw className="w-4 h-4" /> Restart
          </button>
        </div>
      </div>
    </header>
  );
};