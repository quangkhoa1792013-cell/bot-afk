import React from 'react';
import { HelpCircle, Terminal, Send, Zap, BookOpen } from 'lucide-react';

interface MCCCommandGuideProps {
  onSendCommand: (cmd: string) => void;
}

export const MCCCommandGuide: React.FC<MCCCommandGuideProps> = ({ onSendCommand }) => {
  const commands = [
    { cmd: '/help', desc: 'Display built-in MCC help and command list' },
    { cmd: '/connect aquamc.vn', desc: 'Connect to a Minecraft server host' },
    { cmd: '/reconnect', desc: 'Disconnect and immediately reconnect to the current server' },
    { cmd: '/quit', desc: 'Safely disconnect from server and terminate MCC process' },
    { cmd: '/inventory', desc: 'View current inventory slots and held items' },
    { cmd: '/tab', desc: 'View current player list (Tablist) in console' },
    { cmd: '/useitem', desc: 'Use or eat the item currently held in hand' },
    { cmd: '/fish', desc: 'Start or stop the AutoFishing bot' },
    { cmd: '/farmer start', desc: 'Start the automated crop farmer bot' },
    { cmd: '/digbot start', desc: 'Start the AutoDig block mining bot' },
    { cmd: '/move 100 64 200', desc: 'Move to specified coordinates (requires Terrain and Movements enabled)' },
    { cmd: '/look yaw pitch', desc: 'Change player camera facing angle' },
    { cmd: '/tell username hello', desc: 'Send private whisper message to a player' },
  ];

  return (
    <div className="panel p-5 space-y-4">
      <div className="panel-header !px-0 !pt-0">
        <div className="panel-title">
          <BookOpen className="w-5 h-5 text-indigo-400" />
          <span>Hướng Dẫn Lệnh MCC</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {commands.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-colors"
          >
            <div className="space-y-0.5 pr-2">
              <span className="text-xs font-mono font-bold text-emerald-400 block">{item.cmd}</span>
              <span className="text-[11px] text-slate-400 block">{item.desc}</span>
            </div>
            <button
              onClick={() => onSendCommand(item.cmd)}
              className="btn btn-ghost !px-2.5 !py-1 shrink-0"
            >
              <Send className="w-3 h-3" />
              Run
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
