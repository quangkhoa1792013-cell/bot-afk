import React, { useState, useEffect } from 'react';
import { Compass, Users, MapPin, Trophy, RefreshCw, Navigation, Crosshair, Sparkles } from 'lucide-react';
import { ChatMessageLog } from '../types';

interface MCCMinimapRadarProps {
  position: { x: number; y: number; z: number; yaw: number; pitch: number };
  onUpdatePosition: (pos: Partial<{ x: number; y: number; z: number; yaw: number; pitch: number }>) => void;
  logs: ChatMessageLog[];
  onSendCommand: (cmd: string) => void;
}

export const MCCMinimapRadar: React.FC<MCCMinimapRadarProps> = ({
  position,
  onUpdatePosition,
  logs,
  onSendCommand,
}) => {
  const [nearbyPlayers, setNearbyPlayers] = useState<string[]>([]);
  const [scoreboardTitle, setScoreboardTitle] = useState<string>('AquaMC Survival Server');
  const [scoreboardLines, setScoreboardLines] = useState<string[]>([
    '🌐 Server: aquamc.vn',
    '📊 Status: Realtime Synchronized',
    '📍 Coords Source: MCC Terminal Packet',
    '👥 Online: Live Detection'
  ]);
  const [isScanning, setIsScanning] = useState(false);

  // Parse position updates or tablist from chat logs in real-time
  useEffect(() => {
    if (logs.length === 0) return;
    const latestLogs = logs.slice(-40);

    for (const log of latestLogs) {
      const text = log.text;

      // Extract Position e.g. "Position: X: 120, Y: 64, Z: -300" or "Logged in at (-123, 64, 567)"
      const posMatch = text.match(/X:\s*(-?\d+(?:\.\d+)?)\s*,?\s*Y:\s*(-?\d+(?:\.\d+)?)\s*,?\s*Z:\s*(-?\d+(?:\.\d+)?)/i) ||
                       text.match(/(?:position|location|coords|at)\D*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
      
      if (posMatch) {
        const x = parseFloat(posMatch[1]);
        const y = parseFloat(posMatch[2]);
        const z = parseFloat(posMatch[3]);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          onUpdatePosition({
            x: Math.round(x),
            y: Math.round(y),
            z: Math.round(z),
          });
        }
      }

      // Check if text contains player join/leave or list
      if (text.includes('Players:') || text.includes('Online (') || text.includes('Connected players')) {
        const parts = text.split(/[:\)]/)[1] || text.split(/[:\)]/)[0];
        if (parts) {
          const names = parts.split(',').map((n) => n.trim().replace(/^[^a-zA-Z0-9_]+/, '')).filter((n) => n.length > 2 && !n.includes(' '));
          if (names.length > 0) setNearbyPlayers(Array.from(new Set(names)));
        }
      }

      // Check for scoreboard / server header
      if (text.includes('Scoreboard') || text.includes('TPS:') || text.includes('Ping:')) {
        setScoreboardLines((prev) => {
          const clean = text.replace(/\[MCC\]\s*/, '').trim();
          if (!prev.includes(clean)) return [clean, ...prev.slice(0, 3)];
          return prev;
        });
      }
    }
  }, [logs, onUpdatePosition]);

  const handleScanCoords = () => {
    setIsScanning(true);
    onSendCommand('/position');
    setTimeout(() => onSendCommand('/whereami'), 400);
    setTimeout(() => onSendCommand('/list'), 800);
    setTimeout(() => setIsScanning(false), 2000);
  };

  // Calculate Radar Sight Line Coordinates based on Yaw
  // Yaw in MC: 0 = South (+Z), 90 = West (-X), 180 = North (-Z), 270 = East (+X)
  const rad = ((position.yaw - 90) * Math.PI) / 180;
  const lineLength = 36;
  const endX = 64 + Math.cos(rad) * lineLength;
  const endY = 64 + Math.sin(rad) * lineLength;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            Minimap Radar &amp; Tọa Độ Thực (Realtime Coords &amp; Radar)
          </h3>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleScanCoords}
            className={`flex items-center gap-1.5 text-xs font-mono font-semibold px-3 py-1 rounded-lg border transition-all cursor-pointer ${
              isScanning
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white shadow-md'
            }`}
          >
            <Crosshair className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Đang Quét Server Packet...' : '📍 Quét Tọa Độ Thật (/position)'}
          </button>

          <button
            onClick={() => onSendCommand('/list')}
            className="flex items-center gap-1 text-xs font-mono text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 rounded-lg border border-cyan-500/30 cursor-pointer transition-colors"
            title="Quét danh sách người chơi trên server"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Quét Tablist (/list)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Radar Map Graphic */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="text-[11px] font-mono font-semibold text-slate-400 mb-2 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-cyan-400" /> Radar Quét Vùng Lân Cận (128x128)
          </div>

          <div className="relative w-36 h-36 rounded-full border-2 border-cyan-500/50 bg-[#060e1a] flex items-center justify-center shadow-2xl overflow-hidden">
            {/* Radar Sweep Animation Line */}
            <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-spin opacity-40 pointer-events-none" style={{ animationDuration: '6s' }}>
              <div className="w-1/2 h-1/2 bg-gradient-to-br from-cyan-500/30 to-transparent origin-bottom-right rounded-tl-full" />
            </div>

            {/* Grid Circles */}
            <div className="absolute w-24 h-24 rounded-full border border-cyan-500/20 pointer-events-none" />
            <div className="absolute w-12 h-12 rounded-full border border-cyan-500/30 pointer-events-none" />
            <div className="absolute w-full h-[1px] bg-cyan-500/20 pointer-events-none" />
            <div className="absolute h-full w-[1px] bg-cyan-500/20 pointer-events-none" />

            {/* Compass Directions */}
            <span className="absolute top-1 text-[9px] font-bold font-mono text-cyan-400">N</span>
            <span className="absolute bottom-1 text-[9px] font-bold font-mono text-cyan-400">S</span>
            <span className="absolute left-1 text-[9px] font-bold font-mono text-cyan-400">W</span>
            <span className="absolute right-1 text-[9px] font-bold font-mono text-cyan-400">E</span>

            {/* SVG Direction Cone & Needle */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 128 128">
              <line
                x1="64"
                y1="64"
                x2={endX}
                y2={endY}
                stroke="#22d3ee"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx={endX} cy={endY} r="3.5" fill="#22d3ee" />
            </svg>

            {/* Center Player Dot */}
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-lg shadow-emerald-400/80 z-10 animate-pulse" />

            {/* Nearby Players Detected */}
            {nearbyPlayers.slice(0, 4).map((p, idx) => {
              const angles = [45, 135, 215, 300];
              const dists = [32, 28, 42, 35];
              const a = (angles[idx % 4] * Math.PI) / 180;
              const px = 64 + Math.cos(a) * dists[idx % 4];
              const py = 64 + Math.sin(a) * dists[idx % 4];
              return (
                <div
                  key={p + idx}
                  className="absolute w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-900 shadow"
                  style={{ left: `${(px / 128) * 100}%`, top: `${(py / 128) * 100}%` }}
                  title={`Player: ${p}`}
                />
              );
            })}
          </div>

          <div className="mt-2 text-[10px] font-mono text-slate-400 text-center flex items-center gap-2">
            <span>Góc nhìn: <strong className="text-cyan-300">{position.yaw.toFixed(0)}° Yaw</strong></span>
            <span>|</span>
            <span>Độ ngẩng: <strong className="text-cyan-300">{position.pitch.toFixed(0)}° Pitch</strong></span>
          </div>
        </div>

        {/* Current Coordinates & Manual Movement / Sync */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2">
          <div className="text-[11px] font-mono font-semibold text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Tọa Độ Hiện Tại (Coords)
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              XYZ Sync
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 font-mono text-center">
            <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
              <span className="text-[10px] text-slate-500 block uppercase">X</span>
              <span className="text-sm font-bold text-emerald-400">{position.x}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
              <span className="text-[10px] text-slate-500 block uppercase">Y</span>
              <span className="text-sm font-bold text-emerald-400">{position.y}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
              <span className="text-[10px] text-slate-500 block uppercase">Z</span>
              <span className="text-sm font-bold text-emerald-400">{position.z}</span>
            </div>
          </div>

          {/* Quick Adjustment Input Controls */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-mono text-slate-400 block">Điều chỉnh / Nhập tọa độ tham chiếu:</span>
            <div className="flex items-center gap-1 font-mono">
              <input
                type="number"
                value={position.x}
                onChange={(e) => onUpdatePosition({ x: Number(e.target.value) })}
                className="w-1/3 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                placeholder="X"
              />
              <input
                type="number"
                value={position.y}
                onChange={(e) => onUpdatePosition({ y: Number(e.target.value) })}
                className="w-1/3 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                placeholder="Y"
              />
              <input
                type="number"
                value={position.z}
                onChange={(e) => onUpdatePosition({ z: Number(e.target.value) })}
                className="w-1/3 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                placeholder="Z"
              />
            </div>

            {/* Quick Movement Actions */}
            <div className="flex items-center gap-1 pt-1">
              <button
                onClick={() => onSendCommand('/move north')}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 cursor-pointer"
              >
                ⬆️ North
              </button>
              <button
                onClick={() => onSendCommand('/move south')}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 cursor-pointer"
              >
                ⬇️ South
              </button>
              <button
                onClick={() => onSendCommand('/move west')}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 cursor-pointer"
              >
                ⬅️ West
              </button>
              <button
                onClick={() => onSendCommand('/move east')}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 cursor-pointer"
              >
                ➡️ East
              </button>
            </div>
          </div>
        </div>

        {/* Players Nearby & Scoreboard */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2">
          <div className="text-[11px] font-mono font-semibold text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" /> Scoreboard &amp; Player Info
            </span>
            <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
              Live Data
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 font-mono text-xs space-y-1 text-slate-300 min-h-[90px]">
            <div className="text-amber-300 font-bold border-b border-slate-800 pb-1 text-[11px] flex items-center justify-between">
              <span>{scoreboardTitle}</span>
              <Sparkles className="w-3 h-3 text-amber-400" />
            </div>
            {scoreboardLines.map((line, idx) => (
              <div key={idx} className="text-[11px] text-slate-300 truncate">
                {line}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-indigo-400" /> Người chơi lân cận:
            </span>
            <span className="text-indigo-300 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              {nearbyPlayers.length > 0 ? `${nearbyPlayers.length} Bot/Players` : 'Đang quét...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
