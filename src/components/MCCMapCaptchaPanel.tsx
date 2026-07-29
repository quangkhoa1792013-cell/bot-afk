import React, { useState, useEffect, useRef } from 'react';
import {
  Map,
  Eye,
  Send,
  Zap,
  RefreshCw,
  Terminal,
  CheckCircle2,
  ShieldAlert,
  Sliders,
  HelpCircle,
  Hash,
  Sparkles,
  Layers,
  Maximize2
} from 'lucide-react';
import { ChatMessageLog } from '../types';

interface MCCMapCaptchaPanelProps {
  logs: ChatMessageLog[];
  onSendCommand: (cmd: string) => void;
  onSaveIni?: (content: string) => void;
  iniContent?: string;
}

export const MCCMapCaptchaPanel: React.FC<MCCMapCaptchaPanelProps> = ({
  logs,
  onSendCommand,
  onSaveIni,
  iniContent = '',
}) => {
  const [viewMode, setViewMode] = useState<'canvas' | 'ascii'>('canvas');
  const [captchaCode, setCaptchaCode] = useState('');
  const [detectedPrompt, setDetectedPrompt] = useState<string | null>(null);
  const [sampleDigitText, setSampleDigitText] = useState('8 4 9 2');
  const [optSuccess, setOptSuccess] = useState(false);
  const [silentSuccess, setSilentSuccess] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(2.5); // 2.5x zoom for 128x128 map
  const [imageTimestamp, setImageTimestamp] = useState<number>(Date.now());
  const [activeImgSource, setActiveImgSource] = useState<'png' | 'canvas'>('png');

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Trigger Silent Anti-Kick mode via API
  const handleTriggerSilentMode = async () => {
    try {
      const res = await fetch('/api/mcc/silent-mode', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSilentSuccess(true);
        setTimeout(() => setSilentSuccess(false), 4000);
      }
    } catch {
      // Fallback in case of network issue
      handleOptimizeIniForVT100();
    }
  };

  // Update PNG Image code on server
  const handleUpdateServerPngCode = async (codeStr: string) => {
    try {
      await fetch('/api/captcha-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeStr }),
      });
      setImageTimestamp(Date.now());
    } catch (e) {
      console.error(e);
    }
  };

  // Scan logs for Captcha triggers
  useEffect(() => {
    if (logs.length === 0) return;
    const recentLogs = logs.slice(-25);

    for (const log of recentLogs) {
      const text = log.text.toLowerCase();
      if (
        text.includes('captcha') ||
        text.includes('bản đồ') ||
        text.includes('map') ||
        text.includes('mã xác thực') ||
        text.includes('nhập mã') ||
        text.includes('/captcha')
      ) {
        setDetectedPrompt(log.text);

        // Try to auto-extract numbers if log says e.g. "Mã captcha: 1234"
        const numMatch = log.text.match(/\b\d{4,6}\b/);
        if (numMatch) {
          setSampleDigitText(numMatch[0].split('').join(' '));
        }
      }
    }
  }, [logs]);

  // Render Map Preview on HTML5 Canvas (128x128 pixels)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas dimensions
    const width = 128;
    const height = 128;

    // 1. Fill map parchment background (#e3d3a3)
    ctx.fillStyle = '#e8d8ab';
    ctx.fillRect(0, 0, width, height);

    // 2. Add subtle map texture / grid noise
    ctx.fillStyle = '#d4c292';
    for (let x = 0; x < width; x += 16) {
      ctx.fillRect(x, 0, 1, height);
    }
    for (let y = 0; y < height; y += 16) {
      ctx.fillRect(0, y, width, 1);
    }

    // Outer wood frame border
    ctx.strokeStyle = '#5a3d1c';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    // Header banner text on Map
    ctx.fillStyle = '#2d1b0a';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AQUAMC CAPTCHA', width / 2, 22);

    // Sub-banner line
    ctx.fillStyle = '#b53f3f';
    ctx.fillRect(16, 26, 96, 2);

    // Render Captcha Digits in pixelated Minecraft Map Font
    ctx.fillStyle = '#111827'; // Dark bold text
    ctx.font = 'bold 26px monospace';
    ctx.fillText(sampleDigitText, width / 2, 70);

    // Add noise dots for security anti-bot pattern simulation
    ctx.fillStyle = '#8c764e';
    for (let i = 0; i < 40; i++) {
      const rx = (i * 37) % 110 + 9;
      const ry = (i * 19) % 110 + 9;
      ctx.fillRect(rx, ry, 2, 2);
    }

    // Bottom instruction line
    ctx.fillStyle = '#4b3823';
    ctx.font = '7px monospace';
    ctx.fillText('Go /captcha <ma> chat', width / 2, 108);

  }, [sampleDigitText]);

  // Quick Keypad handler
  const handleKeypadPress = (digit: string) => {
    setCaptchaCode((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setCaptchaCode((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setCaptchaCode('');
  };

  const handleSendCaptcha = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = captchaCode.trim();
    if (!code) return;

    // Send formatted captcha command
    onSendCommand(`/captcha ${code}`);
    setCaptchaCode('');
  };

  const handleSendDirectChat = () => {
    const code = captchaCode.trim();
    if (!code) return;
    onSendCommand(code);
    setCaptchaCode('');
  };

  // Solution 2: Auto-Optimize INI settings for VT100 24-bit ANSI
  const handleOptimizeIniForVT100 = () => {
    if (!onSaveIni) return;

    let updated = iniContent;
    if (updated.includes('ConsoleColorMode')) {
      updated = updated.replace(/ConsoleColorMode\s*=\s*".*?"/g, 'ConsoleColorMode = "vt100_24bit"');
      updated = updated.replace(/ConsoleColorMode\s*=\s*'.*?'/g, 'ConsoleColorMode = "vt100_24bit"');
    } else {
      updated += '\n[Console.General]\nConsoleColorMode = "vt100_24bit"\n';
    }

    if (!updated.includes('MinTerminalWidth')) {
      updated += 'MinTerminalWidth = 80\n';
    }
    if (!updated.includes('MinTerminalHeight')) {
      updated += 'MinTerminalHeight = 40\n';
    }

    onSaveIni(updated);
    setOptSuccess(true);
    setTimeout(() => setOptSuccess(false), 3500);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 shadow-2xl">
      {/* Top Title Banner */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Hệ Thống Giải Mã Map Captcha (Bản Đồ Xác Thực)
            </h3>
            <p className="text-xs text-slate-400">
              Đọc bản đồ Map 128x128 pixel trực tiếp trên Web UI hoặc ANSI Console
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2">
          {optSuccess && (
            <span className="text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md animate-fade-in flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Đã bật 24-bit ANSI!
            </span>
          )}

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setViewMode('canvas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'canvas'
                  ? 'bg-amber-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Giải Pháp 1: Web Canvas Image
            </button>
            <button
              onClick={() => setViewMode('ascii')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'ascii'
                  ? 'bg-amber-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Giải Pháp 2: Terminal 24-bit ANSI
            </button>
          </div>
        </div>
      </div>

      {/* Anti-Kick Anti-Spam Control Action Banner */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              Xử Lý Sự Cố "Chưa Kịp Nhìn Đã Bị Kick"
              {silentSuccess && (
                <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                  ✓ Đã Tắt Toàn Bộ Bot Spam! Bot Đang Im Lặng An Toàn.
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-400">
              Tắt toàn bộ AutoRelog, ScriptScheduler, AutoRespond khi mới join để AquaMC không kick bot do nghi ngờ hành vi tự động.
            </p>
          </div>
        </div>

        <button
          onClick={handleTriggerSilentMode}
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          Bật Chế Độ Im Lặng (Anti-Kick)
        </button>
      </div>

      {/* Captcha Active Alert Banner if detected */}
      {detectedPrompt && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-3 text-amber-200 text-xs font-mono">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
            <div>
              <span className="font-bold text-amber-300 block">Phát hiện yêu cầu Captcha trong Server Chat:</span>
              <span className="text-slate-300 italic">{detectedPrompt}</span>
            </div>
          </div>
          <button
            onClick={() => onSendCommand('/slot 1')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold cursor-pointer shrink-0 transition-colors"
          >
            Cầm Map (Slot 1)
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols): Map Image Viewer / ANSI Terminal Preview */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-between space-y-4 relative">
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 font-bold text-slate-200">
                <Map className="w-4 h-4 text-amber-400" />
                {viewMode === 'canvas' ? 'Ảnh Map Captcha 128x128 PNG' : 'Khung Màu 24-bit VT100 ANSI Console'}
              </span>
              {viewMode === 'canvas' && (
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[10px]">
                  <button
                    onClick={() => setActiveImgSource('png')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      activeImgSource === 'png' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400'
                    }`}
                  >
                    PNG Server (/captcha.png)
                  </button>
                  <button
                    onClick={() => setActiveImgSource('canvas')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      activeImgSource === 'canvas' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400'
                    }`}
                  >
                    Client Canvas
                  </button>
                </div>
              )}
            </div>

            {viewMode === 'canvas' && (
              <div className="flex items-center gap-1">
                <span>Phóng to:</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.max(1.5, z - 0.5))}
                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded text-slate-200"
                >
                  -
                </button>
                <span className="text-amber-400 font-bold px-1">{zoomLevel}x</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(4, z + 0.5))}
                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded text-slate-200"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {viewMode === 'canvas' ? (
            /* Solution 1: Canvas / PNG File Map Image Render */
            <div className="flex flex-col items-center justify-center py-4 space-y-3">
              {/* Map Wooden Frame Container */}
              <div
                className="p-3 bg-[#3d2817] border-4 border-[#24170d] rounded-2xl shadow-2xl relative group"
                style={{
                  transform: `scale(${zoomLevel / 2})`,
                  transformOrigin: 'center center',
                }}
              >
                {activeImgSource === 'png' ? (
                  <img
                    src={`/captcha.png?t=${imageTimestamp}`}
                    alt="Map Captcha PNG Nét 100%"
                    className="w-[256px] h-[256px] object-contain image-rendering-pixelated bg-[#e8d8ab] shadow-inner rounded border border-[#5a3d1c]"
                  />
                ) : (
                  <canvas
                    ref={canvasRef}
                    width={128}
                    height={128}
                    className="w-[256px] h-[256px] bg-[#e8d8ab] shadow-inner image-rendering-pixelated rounded"
                  />
                )}

                {/* Map Item Corner Label */}
                <span className="absolute top-1 left-2 text-[9px] font-mono text-amber-200/80 font-bold bg-black/40 px-1 rounded">
                  {activeImgSource === 'png' ? 'PNG 128x128' : 'CANVAS 128x128'}
                </span>
              </div>

              {/* Sample Digit Input & Randomizer for testing */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <span className="text-[11px] font-mono text-slate-400">Thử nghiệm mã Captcha:</span>
                <input
                  type="text"
                  value={sampleDigitText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSampleDigitText(val);
                    handleUpdateServerPngCode(val);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs font-mono text-amber-300 w-28 text-center font-bold"
                  placeholder="Ví dụ: 8492"
                />
                <button
                  onClick={() => {
                    const rnd = Math.floor(1000 + Math.random() * 9000).toString();
                    setSampleDigitText(rnd.split('').join(' '));
                    handleUpdateServerPngCode(rnd);
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 cursor-pointer flex items-center gap-1 text-xs font-mono"
                  title="Tạo mã mẫu ngẫu nhiên & Render lại file PNG"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Render PNG Mới</span>
                </button>
                <button
                  onClick={() => setImageTimestamp(Date.now())}
                  className="p-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded text-amber-300 cursor-pointer flex items-center gap-1 text-xs font-mono"
                >
                  Refresh Ảnh Web
                </button>
              </div>
            </div>
          ) : (
            /* Solution 2: ASCII / 24-Bit ANSI Terminal Preview */
            <div className="w-full bg-[#070c14] border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-3">
              <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" /> Bảng Màu Terminal (ConsoleColorMode = vt100_24bit)
                </span>
                <button
                  onClick={handleOptimizeIniForVT100}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-bold cursor-pointer transition-colors"
                >
                  ⚡ Tối Ưu File .INI Ngay
                </button>
              </div>

              {/* Simulated ANSI Map Box in Console */}
              <div className="bg-[#0f172a] p-3 rounded-lg border border-slate-800 space-y-1 font-mono text-[11px] leading-tight select-text">
                <div className="text-slate-500">[12:00:00] [MCC/Info] Server sent Map Packet data #104</div>
                <div className="text-emerald-400 font-bold">┌───────────────────────────────────┐</div>
                <div className="text-emerald-400 font-bold">│        CAPTCHA MAP PREVIEW        │</div>
                <div className="text-emerald-400 font-bold">├───────────────────────────────────┤</div>
                <div className="text-amber-300 font-bold">│   ██  ██  █ █  ██   │</div>
                <div className="text-amber-300 font-bold">│   █ █ █ █ █ █ █ █   │</div>
                <div className="text-amber-300 font-bold">│   ██  ████ ███  ██  │</div>
                <div className="text-amber-300 font-bold">│   █ █   █   █ █ █   │</div>
                <div className="text-amber-300 font-bold">│   ██    █   █  ██   │</div>
                <div className="text-emerald-400 font-bold">└───────────────────────────────────┘</div>
                <div className="text-cyan-400">[AquaMC] Nhập mã captcha gồm 4 chữ số vào khung chat!</div>
              </div>

              <p className="text-[11px] text-slate-400 italic">
                Khi kích hoạt <code className="text-amber-300 font-bold">ConsoleColorMode = "vt100_24bit"</code>, MCC sẽ render các ô màu của tấm bản đồ trực tiếp trên dòng lệnh console dưới dạng ma trận ký tự màu!
              </p>
            </div>
          )}

          {/* Quick Action Shortcuts */}
          <div className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1 font-semibold">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Thao tác nhanh:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onSendCommand('/slot 1')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
              >
                /slot 1
              </button>
              <button
                onClick={() => onSendCommand('/use')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
              >
                /use (Cầm Map)
              </button>
              <button
                onClick={() => onSendCommand('/map')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
              >
                /map (Mở Map)
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Captcha Input & Numeric Touch Keypad */}
        <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div className="border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-emerald-400" /> Nhập Mã Captcha Giải Mã
            </h4>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Đọc số từ hình bản đồ và gửi lệnh giải cho bot
            </p>
          </div>

          {/* Captcha Input Form */}
          <form onSubmit={handleSendCaptcha} className="space-y-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Mã Captcha Đã Đọc Được:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  placeholder="Nhập mã (vd: 8492)..."
                  className="w-full bg-slate-900 border-2 border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-lg font-bold font-mono text-amber-300 text-center focus:outline-none tracking-widest shadow-inner"
                />
                {captchaCode && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg cursor-pointer"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>

            {/* Numeric Touch Keypad for fast input */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-mono text-slate-500 block text-center">
                Bàn phím số bấm nhanh:
              </span>
              <div className="grid grid-cols-3 gap-2 font-mono font-bold text-sm">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="p-3 bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-200 rounded-lg shadow text-center cursor-pointer transition-all active:scale-95"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-3 bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 rounded-lg text-xs cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="p-3 bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-200 rounded-lg shadow text-center cursor-pointer transition-all active:scale-95"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="p-3 bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 rounded-lg text-xs cursor-pointer"
                >
                  ⌫
                </button>
              </div>
            </div>

            {/* Two Submit Options */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="submit"
                disabled={!captchaCode.trim()}
                className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow flex items-center justify-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                Gửi /captcha {captchaCode || '...'}
              </button>

              <button
                type="button"
                onClick={handleSendDirectChat}
                disabled={!captchaCode.trim()}
                className="px-3 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow flex items-center justify-center gap-1.5"
              >
                Chat Thẳng "{captchaCode || '...'}"
              </button>
            </div>
          </form>

          {/* Solution Guidelines Box */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-400 space-y-1.5">
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Quy trình xử lý Map Captcha:
            </span>
            <ul className="list-disc list-inside space-y-1 text-[10px] text-slate-300">
              <li>Khi vào Server, bot sẽ nhận Map ở Slot 1.</li>
              <li>Nhìn hình ảnh Map render ở khung trái để đọc dãy số.</li>
              <li>Bấm nút số hoặc nhập mã và nhấn "Gửi /captcha".</li>
              <li>Xác thực 1 lần thành công, session sẽ lưu lại treo 24/7.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
