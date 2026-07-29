import React from 'react';
import { Play, Square, RefreshCw, Terminal, Server, User, ShieldCheck, Cpu } from 'lucide-react';
import { MCCProcessStatus } from '../types';

interface MCCHeaderProps {
  status: MCCProcessStatus;
  wsConnected: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

export const MCCHeader: React.FC<MCCHeaderProps> = ({
  status,
  wsConnected,
  onStart,
  onStop,
  onRestart,
}) => {
  const formatUptime = (sec: number) => {
    if (!sec) return '0s';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-20">
      <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left Title & Status */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Terminal className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">
                Minecraft Console Client <span className="text-emerald-400 font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">MCC Web UI</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Minecraft Console Client v26.2 (Linux x64 Native Backend)
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          {/* WebSocket Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${wsConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span>{wsConnected ? 'WS Connected' : 'WS Offline'}</span>
          </div>

          {/* MCC Process Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${status.running ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
            <Cpu className="w-3.5 h-3.5" />
            <span>
              {status.running ? `MCC Online (PID: ${status.pid || 'Active'})` : 'MCC Offline'}
            </span>
            {status.running && (
              <span className="text-[10px] bg-cyan-950 px-1.5 py-0.5 rounded text-cyan-300 ml-1">
                {formatUptime(status.uptimeSeconds)}
              </span>
            )}
          </div>

          {/* Target Server */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
            <Server className="w-3.5 h-3.5 text-indigo-400" />
            <span>{status.serverHost}:{status.serverPort}</span>
          </div>

          {/* Username */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span>{status.username} ({status.accountType})</span>
          </div>
        </div>

        {/* Process Action Controls */}
        <div className="flex items-center gap-2">
          {!status.running ? (
            <button
              onClick={onStart}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-950/50 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Start MCC
            </button>
          ) : (
            <button
              onClick={onStop}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-rose-950/50 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop MCC
            </button>
          )}

          <button
            onClick={onRestart}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            title="Restart MCC Process"
          >
            <RefreshCw className="w-4 h-4" />
            Restart
          </button>
        </div>
      </div>
    </header>
  );
};
