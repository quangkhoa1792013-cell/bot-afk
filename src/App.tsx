import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBotWebSocket } from './hooks/useBotWebSocket';
import { MCCHeader } from './components/MCCHeader';
import { MCCAccountSelector } from './components/MCCAccountSelector';
import { MCCTerminal } from './components/MCCTerminal';
import { MCCMinimapRadar } from './components/MCCMinimapRadar';
import { MCCMovementPanel } from './components/MCCMovementPanel';
import { MCCConfigEditor } from './components/MCCConfigEditor';
import { MCCCommandGuide } from './components/MCCCommandGuide';
import { MCCMapCaptchaPanel } from './components/MCCMapCaptchaPanel';
import { MCCShortcutManager } from './components/MCCShortcutManager';
import { MCCDashboard } from './components/MCCDashboard';
import {
  LayoutDashboard, Terminal, Map, Sliders, BookOpen, Zap, ShieldAlert,
  MoreVertical, ChevronDown, Server, MapPin,
} from 'lucide-react';

type TabKey = 'dashboard' | 'console' | 'captcha' | 'config' | 'guide' | 'shortcuts';

const TAB_LABELS: Record<TabKey, string> = {
  dashboard: 'Dashboard',
  console: 'Bảng Điều Khiển',
  captcha: 'Map Captcha',
  config: 'Cấu Hình INI',
  guide: 'Hướng Dẫn Lệnh',
  shortcuts: 'Phím Tắt Lệnh',
};

export default function App() {
  const {
    wsConnected,
    accounts,
    activeAccountId,
    scripts,
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
    setAutoRelog,
    autoRelog,
    updateServerAccount,
    clearLogs,
    shortcuts,
    addShortcut,
    deleteShortcut,
    broadcastCommand,
    broadcastStart,
    broadcastStop,
    startMccFor,
    stopMccFor,
    setAutoRelogFor,
  } = useBotWebSocket();

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [showShortcutManager, setShowShortcutManager] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const extrasRef = useRef<HTMLDivElement>(null);

  // Close the "more tabs" dropdown when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (extrasRef.current && !extrasRef.current.contains(e.target as Node)) {
        setExtrasOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

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

  const setTab = (tab: TabKey) => {
    setActiveTab(tab);
    setExtrasOpen(false);
  };

  // Primary tabs row: dashboard, console, captcha (core) + extras dropdown
  const coreTabs: TabKey[] = ['dashboard', 'console'];
  const extraTabs: TabKey[] = ['config', 'guide', 'shortcuts'];

  const renderTabButton = (tab: TabKey, icon: React.ReactNode, extra?: React.ReactNode) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
        activeTab === tab
          ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/40'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
      }`}
    >
      {icon} {TAB_LABELS[tab]}
      {extra}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-emerald-600 selection:text-white">
      {activeTab !== 'dashboard' && (
        <MCCHeader
          status={mccStatus}
          wsConnected={wsConnected}
          hasBot={accounts.length > 0}
          autoRelog={autoRelog}
          onStart={startMCC}
          onStop={stopMCC}
          onRestart={restartMCC}
          onToggleAutoRelog={setAutoRelog}
        />
      )}

      {activeTab !== 'dashboard' && (
        <MCCAccountSelector
          accounts={accounts}
          activeAccountId={activeAccountId}
          scripts={scripts}
          onSelectAccount={selectAccount}
          onAddAccount={addAccount}
          onDeleteAccount={deleteAccount}
        />
      )}

      <main className="max-w-[1700px] w-full mx-auto p-4 flex-1 flex flex-col gap-4">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1">
            {coreTabs.map((tab) =>
              renderTabButton(tab, tab === 'dashboard' ? <LayoutDashboard className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />)
            )}

            <button
              onClick={() => setActiveTab('captcha')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer relative border ${
                activeTab === 'captcha'
                  ? 'bg-amber-600/15 text-amber-300 border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-transparent'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              Map Captcha
              {hasCaptchaAlert && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
              )}
            </button>

            {/* More tools dropdown */}
            <div className="relative" ref={extrasRef}>
              <button
                onClick={() => setExtrasOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
              >
                <MoreVertical className="w-3.5 h-3.5" />
                Thêm
                <ChevronDown className="w-3 h-3" />
              </button>

              {extrasOpen && (
                <div className="absolute right-0 mt-2 z-50 w-52 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
                  {extraTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTab(tab)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 w-full text-left text-xs transition-colors cursor-pointer border-b border-slate-800/60 last:border-b-0 ${
                        activeTab === tab
                          ? 'bg-emerald-600/15 text-emerald-300'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {tab === 'config' ? <Sliders className="w-4 h-4" /> : tab === 'guide' ? <BookOpen className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {TAB_LABELS[tab]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right side: live coords badge */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400">
            <button
              onClick={() => setActiveTab('console')}
              className="badge badge-indigo cursor-pointer hover:bg-indigo-500/20"
              title="Xem chi tiết toạ độ ở tab Bảng Điều Khiển"
            >
              <MapPin className="w-3 h-3" />
              X {position.x} · Y {position.y} · Z {position.z}
            </button>
          </div>
        </div>

        {/* Captcha Alert Floating Quick Button if on another tab */}
        {hasCaptchaAlert && activeTab !== 'captcha' && (
          <div className="bg-amber-950/80 border border-amber-500/50 p-3 rounded-xl flex items-center justify-between text-xs font-mono text-amber-200 animate-pulse">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Phát hiện thông báo Captcha từ Server! Mở tab Map Captcha để xử lý ngay.</span>
            </div>
            <button
              onClick={() => setActiveTab('captcha')}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded cursor-pointer transition-colors"
            >
              Mở Tab →
            </button>
          </div>
        )}

        {/* Tab Contents */}
        <div className="flex-1 flex flex-col gap-4">
          {activeTab === 'dashboard' && (
            <MCCDashboard
              accounts={accounts}
              onSelectAccount={selectAccount}
              onEnterBot={(accountId) => {
                selectAccount(accountId);
                setActiveTab('console');
              }}
              onBroadcastCommand={broadcastCommand}
              onBroadcastStart={broadcastStart}
              onBroadcastStop={broadcastStop}
              onStartMcc={startMccFor}
              onStopMcc={stopMccFor}
              onToggleAutoRelog={setAutoRelogFor}
              onDeleteBot={deleteAccount}
              scripts={scripts}
              onAddBot={addAccount}
            />
          )}

          {activeTab === 'console' && (
            <div className="flex flex-col gap-4">
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

              <MCCTerminal
                logs={logs}
                onSendCommand={sendCommand}
                onClearLogs={clearLogs}
                isMccRunning={mccStatus.running}
                shortcuts={shortcuts}
                onManageShortcuts={() => setShowShortcutManager(true)}
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
                accountId={activeAccountId}
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

          {activeTab === 'shortcuts' && (
            <div className="flex-1">
              <MCCShortcutManager
                open={true}
                onClose={() => setShowShortcutManager(false)}
                shortcuts={shortcuts}
                onAddShortcut={addShortcut}
                onDeleteShortcut={deleteShortcut}
                accountName={
                  accounts.find((a) => a.id === activeAccountId)?.name || activeAccountId || '...'
                }
                variant="inline"
              />
            </div>
          )}
        </div>
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 py-3 px-6 text-xs text-slate-500 font-mono flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>MCC Console Client — Web Control Engine</span>
        </div>
        <div>
          Server: <span className="text-slate-300 font-bold">{mccStatus.username} @ {mccStatus.serverHost}:{mccStatus.serverPort}</span>
        </div>
      </footer>

      <MCCShortcutManager
        open={showShortcutManager}
        onClose={() => setShowShortcutManager(false)}
        shortcuts={shortcuts}
        onAddShortcut={addShortcut}
        onDeleteShortcut={deleteShortcut}
        accountName={
          accounts.find((a) => a.id === activeAccountId)?.name || activeAccountId || '...'
        }
      />
    </div>
  );
}