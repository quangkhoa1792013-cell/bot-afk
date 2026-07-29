import React, { useState, useRef, useEffect } from 'react';
import { Send, Terminal, Trash2, ArrowDown, Search, Zap, Filter, Maximize2, Minimize2 } from 'lucide-react';
import { ChatMessageLog } from '../types';

interface MCCTerminalProps {
  logs: ChatMessageLog[];
  onSendCommand: (command: string) => void;
  onClearLogs: () => void;
  isMccRunning: boolean;
}

export const MCCTerminal: React.FC<MCCTerminalProps> = ({
  logs,
  onSendCommand,
  onClearLogs,
  isMccRunning,
}) => {
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'chat' | 'system' | 'action' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isCompact, setIsCompact] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = inputText.trim();
    if (!cmd) return;

    onSendCommand(cmd);
    setHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInputText(history[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setInputText('');
      } else {
        setHistoryIndex(nextIdx);
        setInputText(history[nextIdx] || '');
      }
    }
  };

  // Limit max rendered logs in DOM to last 350 for fast scrolling & concise layout
  const displayLogs = logs.slice(-350).filter((log) => {
    if (filterType !== 'all' && log.type !== filterType) return false;
    if (!searchQuery) return true;
    return log.text.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const sendQuickMacro = (macro: string) => {
    onSendCommand(macro);
  };

  return (
    <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
      {/* Terminal Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono font-semibold text-slate-200">
            MCC Log Console ({displayLogs.length} / {logs.length} dòng)
          </span>
          {isMccRunning && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Stream
            </span>
          )}
        </div>

        {/* Tools: Filter, Search & Clear */}
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5 text-[11px] font-mono">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2 py-0.5 rounded cursor-pointer ${filterType === 'all' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilterType('chat')}
              className={`px-2 py-0.5 rounded cursor-pointer ${filterType === 'chat' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Chat
            </button>
            <button
              onClick={() => setFilterType('action')}
              className={`px-2 py-0.5 rounded cursor-pointer ${filterType === 'action' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Lệnh
            </button>
            <button
              onClick={() => setFilterType('error')}
              className={`px-2 py-0.5 rounded cursor-pointer ${filterType === 'error' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Lỗi
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm log..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-md pl-8 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono w-28 sm:w-36"
            />
          </div>

          <button
            onClick={() => setIsCompact(!isCompact)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
            title={isCompact ? "Mở rộng chiều cao" : "Thu gọn chiều cao"}
          >
            {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 rounded-md transition-colors"
            title="Xóa Log Terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Moderate height scrollable log area (h-[380px] or h-[260px] in compact mode) */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className={`${
          isCompact ? 'h-[260px]' : 'h-[380px]'
        } overflow-y-auto p-3.5 font-mono text-xs leading-relaxed space-y-1 select-text bg-[#0b1120] transition-all`}
      >
        {displayLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10 gap-2">
            <Terminal className="w-7 h-7 stroke-1 text-slate-600" />
            <p>Chưa có console output. Bấm "Start MCC" ở trên để kết nối server.</p>
          </div>
        ) : (
          displayLogs.map((log, index) => {
            let typeColor = 'text-slate-300';
            if (log.type === 'error' || log.text.includes('ERROR')) typeColor = 'text-rose-400 bg-rose-950/20 px-1 rounded';
            if (log.type === 'kicked' || log.text.includes('KICKED')) typeColor = 'text-amber-400 bg-amber-950/20 px-1 rounded font-bold';
            if (log.type === 'action') typeColor = 'text-cyan-400 font-bold';
            if (log.type === 'system') typeColor = 'text-indigo-300 italic';

            return (
              <div key={`${log.id}-${index}`} className={`flex items-start gap-2 hover:bg-slate-900/50 px-1.5 py-0.5 rounded ${typeColor}`}>
                <span className="text-slate-500 shrink-0 text-[10px] select-none">
                  [{log.timestamp}]
                </span>
                {log.ansiHtml ? (
                  <span
                    className="break-all whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: log.ansiHtml }}
                  />
                ) : (
                  <span className="break-all whitespace-pre-wrap">{log.text}</span>
                )}
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Auto-scroll Indicator Floating Button */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-16 right-6 px-3 py-1 bg-emerald-600/90 text-white text-xs font-mono rounded-full shadow-lg flex items-center gap-1.5 hover:bg-emerald-500 transition-all z-10 cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Cuộn Xuống Dưới
        </button>
      )}

      {/* Quick Action Commands Macro Bar */}
      <div className="bg-slate-900/90 border-t border-slate-800 px-3 py-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
        <span className="text-slate-400 flex items-center gap-1 font-semibold text-[10px]">
          <Zap className="w-3 h-3 text-amber-400" /> Phím tắt lệnh:
        </span>
        <button
          onClick={() => sendQuickMacro('/help')}
          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded cursor-pointer"
        >
          /help
        </button>
        <button
          onClick={() => sendQuickMacro('/inventory')}
          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded cursor-pointer"
        >
          /inventory
        </button>
        <button
          onClick={() => sendQuickMacro('/tab')}
          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded cursor-pointer"
        >
          /tab
        </button>
        <button
          onClick={() => sendQuickMacro('/server smp')}
          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded cursor-pointer"
        >
          /server smp
        </button>
        <button
          onClick={() => sendQuickMacro('/reconnect')}
          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 rounded cursor-pointer"
        >
          /reconnect
        </button>
        <button
          onClick={() => sendQuickMacro('/quit')}
          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 rounded cursor-pointer"
        >
          /quit
        </button>
      </div>

      {/* Command Input Bar */}
      <form onSubmit={handleSend} className="bg-slate-900 border-t border-slate-800 p-2.5 flex items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <span className="absolute left-3 text-emerald-400 font-mono text-sm font-bold">&gt;</span>
          <input
            type="text"
            placeholder={
              isMccRunning
                ? "Nhập chat hoặc lệnh MCC (vd: /login <matkhau> hoặc /connect aquamc.vn)..."
                : "MCC đang offline. Nhấn 'Start MCC' ở trên để gửi lệnh."
            }
            disabled={!isMccRunning}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-8 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!isMccRunning || !inputText.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
          Gửi
        </button>
      </form>
    </div>
  );
};
