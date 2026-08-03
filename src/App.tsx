import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useBotWebSocket } from './hooks/useBotWebSocket';
import { MCCHeader } from './components/MCCHeader';
import { MCCAccountSelector } from './components/MCCAccountSelector';
import { MCCTerminal } from './components/MCCTerminal';
import { MCCMinimapRadar } from './components/MCCMinimapRadar';
import { MCCMovementPanel } from './components/MCCMovementPanel';
import { MCCConfigEditor } from './components/MCCConfigEditor';
import { MCCCommandGuide } from './components/MCCCommandGuide';
import { MCCMapCaptchaPanel } from './components/MCCMapCaptchaPanel';
import { Terminal, Sliders, BookOpen, Server, Navigation, Compass, Map, ShieldAlert } from 'lucide-react';

export default function App() {
  const {
    wsConnected,
    accounts,
    activeAccountId,
    selectAccount,
    addAccount,
    deleteAccount,
    mccStatus,
    logs,
    iniContent,
    parsedIni,
    playerPosition,
    startMCC,
    stopMCC,
    restartMCC,
    sendCommand,
    saveIni,
    autoFixIni,
    updateServerAccount,
    clearLogs,
  } = useBotWebSocket();

  const [activeTab, setActiveTab] = useState<'console' | 'captcha' | 'config' | 'guide'>('console');

  // Check if captcha keyword was recently received
  const hasCaptchaAlert = useMemo(() => {
    if (logs.length === 0) return false;
    const recent = logs.slice(-15);
    return recent.some((log) => {
      const text = log.text.toLowerCase();
      return (
        text.includes('captcha') ||
        text.includes('bản đồ') ||
        text.includes('mã xác thực') ||
        text.includes('/captcha')
      );
    });
  }, [logs]);

  // Player position state for Minimap & Movement tracking
  const [position, setPosition] = useState({
    x: 100,
    y: 64,
    z: 200,
    yaw: 180,
    pitch: 0,
  });

  // Sync real-time player position from backend WS
  useEffect(() => {
    if (playerPosition) {
      setPosition((prev) => ({
        ...prev,
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z,
        yaw: playerPosition.yaw !== undefined ? playerPosition.yaw : prev.yaw,
        pitch: playerPosition.pitch !== undefined ? playerPosition.pitch : prev.pitch,
      }));
    }
  }, [playerPosition]);

  const handleUpdatePosition = useCallback((newPos: Partial<typeof position>) => {
    setPosition((prev) => ({ ...prev, ...newPos }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-emerald-600 selection:text-white">
      {/* MCC Header Bar */}
      <MCCHeader
        status={mccStatus}
        wsConnected={wsConnected}
        onStart={startMCC}
        onStop={stopMCC}
        onRestart={restartMCC}
      />

      {/* Account Selector Bar */}
      <MCCAccountSelector
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={selectAccount}
        onAddAccount={addAccount}
        onDeleteAccount={deleteAccount}
        onStartMCC={startMCC}
        onStopMCC={stopMCC}
      />

      {/* Main Container */}
      <main className="max-w-[1700px] w-full mx-auto p-4 flex-1 flex flex-col gap-4">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'console'
                  ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Bảng Điều Khiển &amp; Minimap</span>
            </button>

            <button
              onClick={() => setActiveTab('captcha')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer relative ${
                activeTab === 'captcha'
                  ? 'bg-amber-600 text-white font-semibold shadow-md shadow-amber-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Map className="w-4 h-4 text-amber-300" />
              <span>Giải Mã Map Captcha</span>
              {hasCaptchaAlert && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('config')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'config'
                  ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Chỉnh Sửa Cấu Hình INI</span>
            </button>

            <button
              onClick={() => setActiveTab('guide')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'guide'
                  ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Hướng Dẫn Lệnh MCC</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              {mccStatus.serverHost}:{mccStatus.serverPort}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-semibold">Tọa độ: X:{position.x} Y:{position.y} Z:{position.z}</span>
          </div>
        </div>

        {/* Captcha Alert Floating Quick Button if on another tab */}
        {hasCaptchaAlert && activeTab !== 'captcha' && (
          <div className="bg-amber-950/80 border border-amber-500/50 p-3 rounded-xl flex items-center justify-between text-xs font-mono text-amber-200 animate-pulse">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Phát hiện thông báo Captcha từ Server! Mở tab Giải Mã Map Captcha để xử lý ngay.</span>
            </div>
            <button
              onClick={() => setActiveTab('captcha')}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded cursor-pointer transition-colors"
            >
              Mở Tab Map Captcha →
            </button>
          </div>
        )}

        {/* Tab View Contents */}
        <div className="flex-1 flex flex-col gap-4">
          {activeTab === 'console' && (
            <div className="flex flex-col gap-4">
              {/* Top Row: Minimap Radar & Movement System */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MCCMinimapRadar
                  position={position}
                  onUpdatePosition={handleUpdatePosition}
                  logs={logs}
                  onSendCommand={sendCommand}
                />
                <MCCMovementPanel
                  onSendCommand={sendCommand}
                  isMccRunning={mccStatus.running}
                  position={position}
                  onUpdatePosition={handleUpdatePosition}
                />
              </div>

              {/* Bottom Row: Moderately sized, scrollable Live Terminal Log */}
              <MCCTerminal
                logs={logs}
                onSendCommand={sendCommand}
                onClearLogs={clearLogs}
                isMccRunning={mccStatus.running}
              />
            </div>
          )}

          {activeTab === 'captcha' && (
            <div className="flex-1">
              <MCCMapCaptchaPanel
                logs={logs}
                onSendCommand={sendCommand}
                onSaveIni={saveIni}
                iniContent={iniContent}
              />
            </div>
          )}

          {activeTab === 'config' && (
            <div className="flex-1">
              <MCCConfigEditor
                iniContent={iniContent}
                parsedIni={parsedIni}
                onSaveIni={saveIni}
                onAutoFixIni={autoFixIni}
                onUpdateServerAccount={updateServerAccount}
                mccStatus={mccStatus}
              />
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="flex-1">
              <MCCCommandGuide onSendCommand={sendCommand} />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-3 px-6 text-xs text-slate-500 font-mono flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Minecraft Console Client (MCC) - Web UI Engine</span>
        </div>
        <div>
          Server: <span className="text-slate-300 font-bold">{mccStatus.username} @ {mccStatus.serverHost}:{mccStatus.serverPort}</span>
        </div>
      </footer>
    </div>
  );
}

