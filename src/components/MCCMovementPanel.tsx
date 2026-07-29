import React, { useState } from 'react';
import {
  Compass,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Eye,
  Footprints,
  ShieldAlert,
  Zap,
  Target,
  Navigation
} from 'lucide-react';

interface MCCMovementPanelProps {
  onSendCommand: (command: string) => void;
  isMccRunning: boolean;
  position: { x: number; y: number; z: number; yaw: number; pitch: number };
  onUpdatePosition: (pos: Partial<{ x: number; y: number; z: number; yaw: number; pitch: number }>) => void;
}

export const MCCMovementPanel: React.FC<MCCMovementPanelProps> = ({
  onSendCommand,
  isMccRunning,
  position,
  onUpdatePosition,
}) => {
  const [stepSize, setStepSize] = useState<number>(1);
  const [targetX, setTargetX] = useState<string>('0');
  const [targetY, setTargetY] = useState<string>('64');
  const [targetZ, setTargetZ] = useState<string>('0');

  const moveDirection = (dir: 'north' | 'south' | 'east' | 'west' | 'up' | 'down') => {
    onSendCommand(`/move ${dir} ${stepSize}`);

    // Update local estimated minimap position
    let { x, y, z } = position;
    if (dir === 'north') z -= stepSize;
    if (dir === 'south') z += stepSize;
    if (dir === 'west') x -= stepSize;
    if (dir === 'east') x += stepSize;
    if (dir === 'up') y += stepSize;
    if (dir === 'down') y -= stepSize;
    onUpdatePosition({ x, y, z });
  };

  const lookDirection = (dir: 'north' | 'south' | 'east' | 'west' | 'up' | 'down') => {
    onSendCommand(`/look ${dir}`);
    let yaw = position.yaw;
    let pitch = position.pitch;
    if (dir === 'north') yaw = 180;
    if (dir === 'south') yaw = 0;
    if (dir === 'west') yaw = 90;
    if (dir === 'east') yaw = 270;
    if (dir === 'up') pitch = -90;
    if (dir === 'down') pitch = 90;
    onUpdatePosition({ yaw, pitch });
  };

  const handleGoToCoords = (e: React.FormEvent) => {
    e.preventDefault();
    const nx = parseFloat(targetX) || 0;
    const ny = parseFloat(targetY) || 64;
    const nz = parseFloat(targetZ) || 0;
    onSendCommand(`/move ${nx} ${ny} ${nz}`);
    onUpdatePosition({ x: nx, y: ny, z: nz });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Hệ Thống Di Chuyển & Góc Nhìn (Movement)</h3>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px] font-mono text-slate-400">
          <span>Bước di chuyển:</span>
          <select
            value={stepSize}
            onChange={(e) => setStepSize(Number(e.target.value))}
            className="bg-slate-900 text-emerald-400 font-bold focus:outline-none cursor-pointer rounded px-1"
          >
            <option value={1}>1 block</option>
            <option value={3}>3 blocks</option>
            <option value={5}>5 blocks</option>
            <option value={10}>10 blocks</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* D-Pad Directional Movement Controls */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center space-y-3">
          <span className="text-[11px] font-mono font-semibold text-slate-400 flex items-center gap-1">
            <Footprints className="w-3.5 h-3.5 text-emerald-400" /> Bàn Phím Hướng Di Chuyển (Move)
          </span>

          <div className="grid grid-cols-3 gap-2 w-44">
            <div />
            <button
              onClick={() => moveDirection('north')}
              disabled={!isMccRunning}
              className="p-3 bg-slate-800 hover:bg-emerald-600 disabled:opacity-40 text-slate-200 hover:text-white rounded-lg flex items-center justify-center font-mono font-bold text-xs cursor-pointer transition-all active:scale-95 shadow"
              title="Đi về Bắc (North / -Z)"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <div />

            <button
              onClick={() => moveDirection('west')}
              disabled={!isMccRunning}
              className="p-3 bg-slate-800 hover:bg-emerald-600 disabled:opacity-40 text-slate-200 hover:text-white rounded-lg flex items-center justify-center font-mono font-bold text-xs cursor-pointer transition-all active:scale-95 shadow"
              title="Đi về Tây (West / -X)"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onSendCommand('/sneak')}
              disabled={!isMccRunning}
              className="p-2 bg-slate-900 border border-slate-700 hover:bg-amber-600 text-amber-400 hover:text-white rounded-lg flex items-center justify-center font-mono font-bold text-[10px] cursor-pointer transition-all active:scale-95"
              title="Bật/Tắt Sneak (Cúi) hoặc Nhảy"
            >
              SNEAK
            </button>
            <button
              onClick={() => moveDirection('east')}
              disabled={!isMccRunning}
              className="p-3 bg-slate-800 hover:bg-emerald-600 disabled:opacity-40 text-slate-200 hover:text-white rounded-lg flex items-center justify-center font-mono font-bold text-xs cursor-pointer transition-all active:scale-95 shadow"
              title="Đi về Đông (East / +X)"
            >
              <ArrowRight className="w-4 h-4" />
            </button>

            <div />
            <button
              onClick={() => moveDirection('south')}
              disabled={!isMccRunning}
              className="p-3 bg-slate-800 hover:bg-emerald-600 disabled:opacity-40 text-slate-200 hover:text-white rounded-lg flex items-center justify-center font-mono font-bold text-xs cursor-pointer transition-all active:scale-95 shadow"
              title="Đi về Nam (South / +Z)"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
            <div />
          </div>

          <div className="flex items-center gap-2 pt-1 w-full justify-center">
            <button
              onClick={() => moveDirection('up')}
              disabled={!isMccRunning}
              className="px-3 py-1.5 bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white text-[11px] font-mono rounded-md cursor-pointer transition-colors"
            >
              ▲ Lên (+Y)
            </button>
            <button
              onClick={() => moveDirection('down')}
              disabled={!isMccRunning}
              className="px-3 py-1.5 bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white text-[11px] font-mono rounded-md cursor-pointer transition-colors"
            >
              ▼ Xuống (-Y)
            </button>
          </div>
        </div>

        {/* Camera Look / Facing Direction */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-3">
          <span className="text-[11px] font-mono font-semibold text-slate-400 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-cyan-400" /> Quay Hướng Nhìn (Look Angle)
          </span>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => lookDirection('north')}
              disabled={!isMccRunning}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500 text-slate-300 text-xs font-mono rounded-lg cursor-pointer transition-all text-left flex items-center justify-between"
            >
              <span>N (North)</span>
              <span className="text-[10px] text-cyan-400">180°</span>
            </button>
            <button
              onClick={() => lookDirection('south')}
              disabled={!isMccRunning}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500 text-slate-300 text-xs font-mono rounded-lg cursor-pointer transition-all text-left flex items-center justify-between"
            >
              <span>S (South)</span>
              <span className="text-[10px] text-cyan-400">0°</span>
            </button>
            <button
              onClick={() => lookDirection('west')}
              disabled={!isMccRunning}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500 text-slate-300 text-xs font-mono rounded-lg cursor-pointer transition-all text-left flex items-center justify-between"
            >
              <span>W (West)</span>
              <span className="text-[10px] text-cyan-400">90°</span>
            </button>
            <button
              onClick={() => lookDirection('east')}
              disabled={!isMccRunning}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500 text-slate-300 text-xs font-mono rounded-lg cursor-pointer transition-all text-left flex items-center justify-between"
            >
              <span>E (East)</span>
              <span className="text-[10px] text-cyan-400">270°</span>
            </button>
            <button
              onClick={() => lookDirection('up')}
              disabled={!isMccRunning}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500 text-slate-300 text-xs font-mono rounded-lg cursor-pointer transition-all text-left flex items-center justify-between"
            >
              <span>Nhìn Lên (Up)</span>
              <span className="text-[10px] text-cyan-400">-90°</span>
            </button>
            <button
              onClick={() => lookDirection('down')}
              disabled={!isMccRunning}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500 text-slate-300 text-xs font-mono rounded-lg cursor-pointer transition-all text-left flex items-center justify-between"
            >
              <span>Nhìn Xuống (Down)</span>
              <span className="text-[10px] text-cyan-400">90°</span>
            </button>
          </div>

          {/* Direct Coordinate Pathing Input */}
          <form onSubmit={handleGoToCoords} className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
              <Target className="w-3 h-3 text-indigo-400" /> Di chuyển tới Tọa Độ cụ thể:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="X"
                value={targetX}
                onChange={(e) => setTargetX(e.target.value)}
                className="w-1/3 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                placeholder="Y"
                value={targetY}
                onChange={(e) => setTargetY(e.target.value)}
                className="w-1/3 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                placeholder="Z"
                value={targetZ}
                onChange={(e) => setTargetZ(e.target.value)}
                className="w-1/3 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!isMccRunning}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs rounded cursor-pointer transition-colors shrink-0"
              >
                Go
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
