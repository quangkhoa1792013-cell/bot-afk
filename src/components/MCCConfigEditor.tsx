import React, { useState, useEffect, useMemo } from 'react';
import {
  Save,
  Code2,
  Sliders,
  CheckCircle2,
  Search,
  RefreshCw,
  Bot,
  Shield,
  Server,
  Terminal,
  Compass,
  KeyRound,
  Network,
  Tag,
  Plus,
  X,
  Zap,
  HelpCircle,
  Eye,
  Filter,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
  EyeOff,
  BookmarkPlus,
  Trash2
} from 'lucide-react';
import { MCCProcessStatus } from '../types';
import { MC_VERSIONS } from '../lib/mcVersions';
import {
  parseIniToSections,
  serializeSectionsToIni,
  fixAndSanitizeIniContent,
  INISection,
  INISetting,
} from '../lib/iniHelper';
import {
  loadSavedAccounts,
  saveSavedAccount,
  deleteSavedAccount,
  resolveAccountCredentials,
  SavedAccount,
} from '../lib/savedAccounts';

interface CategoryInfo {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
}

interface MCCConfigEditorProps {
  iniContent: string;
  parsedIni: Record<string, any>;
  onSaveIni: (content: string) => void;
  onAutoFixIni?: () => void;
  onUpdateServerAccount: (
    host: string,
    port: number,
    username: string,
    password?: string,
    accountType?: string,
    minecraftVersion?: string
  ) => void;
  mccStatus: MCCProcessStatus;
}

export const MCCConfigEditor: React.FC<MCCConfigEditorProps> = ({
  iniContent,
  onSaveIni,
  onAutoFixIni,
  onUpdateServerAccount,
  mccStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'raw'>('visual');
  const [rawText, setRawText] = useState(iniContent);
  const [sections, setSections] = useState<INISection[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Parse raw INI when iniContent updates from WebSocket
  useEffect(() => {
    setRawText(iniContent);
    const parsed = parseIniToSections(iniContent);
    setSections(parsed);
  }, [iniContent]);

  // Quick Account Form State
  const [quickHost, setQuickHost] = useState(mccStatus.serverHost || 'aquamc.vn');
  const [quickPort, setQuickPort] = useState(mccStatus.serverPort || 25565);
  const [quickUser, setQuickUser] = useState(mccStatus.username || 'geasf');
  const [quickPass, setQuickPass] = useState('');
  const [quickType, setQuickType] = useState('offline');
  const [quickVersion, setQuickVersion] = useState(mccStatus.minecraftVersion || 'auto');
  const [showQuickPass, setShowQuickPass] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => loadSavedAccounts());

  useEffect(() => {
    if (mccStatus.serverHost) setQuickHost(mccStatus.serverHost);
    if (mccStatus.serverPort) setQuickPort(mccStatus.serverPort);
    if (mccStatus.username) setQuickUser(mccStatus.username);
    if (mccStatus.minecraftVersion) setQuickVersion(mccStatus.minecraftVersion);
  }, [mccStatus]);

  // Handle setting value updates in structured state
  const handleSettingChange = (sectionId: string, settingKey: string, newValue: any) => {
    setSections((prevSections) =>
      prevSections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          settings: sec.settings.map((st) => {
            if (st.key !== settingKey) return st;
            return { ...st, value: newValue };
          }),
        };
      })
    );
  };

  // Add array item tag
  const handleAddArrayItem = (sectionId: string, settingKey: string, itemText: string) => {
    if (!itemText.trim()) return;
    setSections((prevSections) =>
      prevSections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          settings: sec.settings.map((st) => {
            if (st.key !== settingKey) return st;
            const currentArr = Array.isArray(st.value) ? st.value : [];
            return { ...st, value: [...currentArr, itemText.trim()] };
          }),
        };
      })
    );
  };

  // Remove array item tag
  const handleRemoveArrayItem = (sectionId: string, settingKey: string, index: number) => {
    setSections((prevSections) =>
      prevSections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          settings: sec.settings.map((st) => {
            if (st.key !== settingKey) return st;
            const currentArr = Array.isArray(st.value) ? st.value : [];
            return { ...st, value: currentArr.filter((_, idx) => idx !== index) };
          }),
        };
      })
    );
  };

  // Toggle collapse section
  const toggleCollapse = (secId: string) => {
    setCollapsedSections((prev) => ({ ...prev, [secId]: !prev[secId] }));
  };

  // Save visual form settings to INI file
  const handleSaveVisual = () => {
    const serializedIni = serializeSectionsToIni(sections);
    onSaveIni(serializedIni);
    setRawText(serializedIni);
    setSaveMessage('Đã lưu toàn bộ cấu hình Visual thành công vào MinecraftClient.ini!');
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  // Save raw INI editor text
  const handleSaveRaw = () => {
    onSaveIni(rawText);
    const parsed = parseIniToSections(rawText);
    setSections(parsed);
    setSaveMessage('Đã cập nhật file MinecraftClient.ini từ Raw Editor!');
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  // Auto-Fix INI syntax errors
  const handleAutoFix = () => {
    const repair = fixAndSanitizeIniContent(rawText);
    setRawText(repair.repairedIni);
    const parsed = parseIniToSections(repair.repairedIni);
    setSections(parsed);
    onSaveIni(repair.repairedIni);
    if (onAutoFixIni) onAutoFixIni();

    if (repair.fixCount > 0) {
      setSaveMessage(`✅ [Đã Sửa Lỗi] Đã tự động sửa ${repair.fixCount} lỗi cú pháp INI (Ngoặc kép chuỗi file/IP/Server, đóng ngoặc section header)!`);
    } else {
      setSaveMessage('✅ Cú pháp MinecraftClient.ini đã chuẩn 100%, không phát hiện lỗi!');
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4500);
  };

  // Handle Quick Connection Save
  const handleApplyQuickAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = Number(quickPort);
    const validPort = !isNaN(portNum) && portNum >= 0 && portNum <= 65535 ? portNum : 25565;
    if (validPort !== quickPort) setQuickPort(validPort);
    const creds = resolveAccountCredentials(quickType, quickPass);
    onUpdateServerAccount(quickHost, validPort, quickUser, creds.password, creds.accountType, quickVersion);
    setSaveMessage(`Đã cập nhật kết nối server: ${quickHost}:${validPort} (${quickUser}) [${quickType === 'offline' ? 'Offline' : quickType}] [MC ${quickVersion}]`);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  const handleSaveQuickToVault = () => {
    if (!quickUser.trim()) return;
    const creds = resolveAccountCredentials(quickType, quickPass);
    setSavedAccounts(
      saveSavedAccount({
        username: quickUser.trim(),
        password: creds.password,
        accountType: quickType as SavedAccount['accountType'],
      })
    );
    setSaveMessage(`Đã lưu acc "${quickUser}" vào bộ nhớ - lần sau chỉ cần chọn để điền nhanh.`);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  const applySavedQuickAccount = (acc: SavedAccount) => {
    setQuickUser(acc.username);
    setQuickPass(acc.accountType === 'offline' ? '-' : acc.password);
    setQuickType(acc.accountType);
    setSaveMessage(`Đã điền nhanh acc "${acc.username}" từ bộ nhớ.`);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Categories list with counts
  const categories = useMemo<Record<string, CategoryInfo>>(() => {
    const map: Record<string, CategoryInfo> = {
      all: { label: 'Tất Cả Setting', icon: Layers, count: 0 },
      main: { label: '🌐 Main & Connection', icon: Server, count: 0 },
      chatbot: { label: '🤖 Auto ChatBots', icon: Bot, count: 0 },
      console: { label: '🖥️ Console & Minimap', icon: Terminal, count: 0 },
      signature: { label: '🔑 Signature & Auth', icon: KeyRound, count: 0 },
      logging: { label: '📜 Logging & Debug', icon: Filter, count: 0 },
      proxy: { label: '🔌 Proxy & Network', icon: Network, count: 0 },
      mcsettings: { label: '🎮 MC Settings', icon: Shield, count: 0 },
    };

    let totalSettings = 0;
    sections.forEach((sec) => {
      totalSettings += sec.settings.length;
      if (map[sec.category]) {
        map[sec.category].count += sec.settings.length;
      }
    });
    map.all.count = totalSettings;

    return map;
  }, [sections]);

  // Filtered sections according to search query, selected category & section
  const filteredSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sections
      .map((sec) => {
        // Category filter
        if (selectedCategory !== 'all' && sec.category !== selectedCategory) {
          return null;
        }

        // Section filter
        if (selectedSectionId !== 'all' && sec.id !== selectedSectionId) {
          return null;
        }

        // Search query filter
        if (!query) return sec;

        const secNameMatch = sec.name.toLowerCase().includes(query);
        const matchingSettings = sec.settings.filter((st) => {
          const keyMatch = st.key.toLowerCase().includes(query);
          const valMatch = String(st.value).toLowerCase().includes(query);
          const commentMatch = st.comment ? st.comment.toLowerCase().includes(query) : false;
          return keyMatch || valMatch || commentMatch;
        });

        if (secNameMatch) return sec; // Keep full section if section name matches
        if (matchingSettings.length > 0) {
          return { ...sec, settings: matchingSettings };
        }

        return null;
      })
      .filter((sec): sec is INISection => sec !== null);
  }, [sections, selectedCategory, selectedSectionId, searchQuery]);

  // Total matching settings
  const totalMatchingSettings = useMemo(() => {
    return filteredSections.reduce((acc, sec) => acc + sec.settings.length, 0);
  }, [filteredSections]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Editor Main Header Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Bảng Quản Lý Toàn Bộ Cấu Hình MinecraftClient.ini
            </h2>
            <p className="text-xs text-slate-400">
              Chỉnh sửa trực tiếp từng thông số, bật/tắt Bot, cấu hình kết nối &amp; tự động hóa
            </p>
          </div>
        </div>

        {/* Top Controls: Mode Switch & Global Save */}
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {saveMessage}
            </span>
          )}

          <div className="seg">
            <button
              onClick={() => setActiveTab('visual')}
              className={`seg-item ${activeTab === 'visual' ? 'seg-item-active' : ''}`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Visual
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`seg-item ${activeTab === 'raw' ? 'seg-item-active' : ''}`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Raw INI
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoFix}
              className="btn btn-amber"
              title="Tự động kiểm tra và sửa lỗi ngoặc kép, đóng ngoặc section header trong MinecraftClient.ini"
            >
              <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
              Sửa Lỗi Tự Động
            </button>

            {activeTab === 'visual' ? (
              <button onClick={handleSaveVisual} className="btn btn-primary">
                <Save className="w-4 h-4" />
                Lưu Cấu Hình INI
              </button>
            ) : (
              <button onClick={handleSaveRaw} className="btn btn-primary">
                <Save className="w-4 h-4" />
                Lưu Raw Text
              </button>
            )}
          </div>
        </div>

        {/* Quick Fix Guidelines Banner */}
        <div className="bg-slate-900/90 border-t border-slate-800 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold text-amber-300">Cẩm Nang Sửa Lỗi MinecraftClient.ini Quanh Dòng 14:</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <span>1️⃣ Chuỗi/IP có dấu chấm: <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">Matches_File = "matches.ini"</code></span>
            <span>2️⃣ Header Mục: <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">[ChatBot.AutoRespond]</code></span>
            <span>3️⃣ Server Object: <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">Server = &#123; Host = "127.0.0.1", Port = 25565 &#125;</code></span>
          </div>
        </div>
      </div>

      {/* Visual Settings Editor Body */}
      {activeTab === 'visual' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Quick Connection Bar */}
          <form
            onSubmit={handleApplyQuickAccount}
            className="bg-slate-950/90 border-b border-slate-800 px-5 py-3 grid grid-cols-1 md:grid-cols-8 gap-3 items-end"
          >
            {savedAccounts.length > 0 && (
              <div className="md:col-span-8 -mb-1">
                <label className="block text-[11px] font-mono text-amber-400/90 mb-1 flex items-center gap-1">
                  <BookmarkPlus className="w-3 h-3 text-amber-400" /> Acc Đã Lưu - chọn để điền nhanh (không cần nhập lại):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {savedAccounts.map((acc) => (
                    <span
                      key={acc.id}
                      onClick={() => applySavedQuickAccount(acc)}
                      title={`${acc.username} (${acc.accountType === 'offline' ? 'Offline' : acc.accountType})`}
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-500 text-[11px] text-slate-200 font-mono cursor-pointer transition-all"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.accountType === 'offline' ? 'bg-emerald-400' : 'bg-indigo-400'}`} />
                      {acc.username}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSavedAccounts(deleteSavedAccount(acc.id));
                        }}
                        className="text-slate-500 hover:text-rose-400 transition-colors"
                        title="Xóa acc đã lưu"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-[11px] font-mono text-slate-400 mb-1 flex items-center gap-1">
                <Server className="w-3 h-3 text-emerald-400" /> Host IP / Tên Miền Server
              </label>
              <input
                type="text"
                value={quickHost}
                onChange={(e) => setQuickHost(e.target.value)}
                placeholder="aquamc.vn"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1 flex items-center justify-between">
                <span>Port</span>
                <span className="text-[9px] text-slate-500 font-normal">Mặc định: 25565 | Phạm vi: 0 - 65535</span>
              </label>
              <input
                type="number"
                min={0}
                max={65535}
                value={quickPort}
                onChange={(e) => setQuickPort(Number(e.target.value))}
                placeholder="25565"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Tên Acc / Username</label>
              <input
                type="text"
                value={quickUser}
                onChange={(e) => setQuickUser(e.target.value)}
                placeholder="geasf"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Mật Khẩu</label>
              <div className="relative">
                <input
                  type={showQuickPass ? 'text' : 'password'}
                  disabled={quickType === 'offline'}
                  value={quickPass}
                  onChange={(e) => setQuickPass(e.target.value)}
                  placeholder={quickType === 'offline' ? 'Offline - tự dùng "-"' : 'Mật khẩu acc'}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
                {quickType !== 'offline' && (
                  <button
                    type="button"
                    onClick={() => setShowQuickPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors"
                    title={showQuickPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showQuickPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Loại Account</label>
              <select
                value={quickType}
                onChange={(e) => {
                  const t = e.target.value;
                  setQuickType(t);
                  setQuickPass(t === 'offline' ? '-' : quickPass === '-' ? '' : quickPass);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="offline">Offline Mode (tự động "-")</option>
                <option value="mojang">Mojang / Premium (có pass)</option>
                <option value="microsoft">Microsoft OAuth</option>
                <option value="yggdrasil">Yggdrasil Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Phiên Bản MC (Tùy chọn nếu auto lỗi)</label>
              <select
                value={quickVersion}
                onChange={(e) => setQuickVersion(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="auto">auto (Mặc định tự phát hiện)</option>
                <option value="1.21.11">1.21.11 (khuyến nghị cho aquamc)</option>
                <option disabled>──────────</option>
                {MC_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">&nbsp;</label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow"
                >
                  Cập Nhật
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickToVault}
                  title="Lưu acc này vào bộ nhớ để lần sau điền nhanh"
                  className="py-1.5 px-2.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </form>

          {/* Search Bar & Category Filter Pills */}
          <div className="bg-slate-950/70 border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex items-center flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm cài đặt (vd: AntiAFK, AutoEat, Host, Language, BotOwners)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
              {(Object.entries(categories) as [string, CategoryInfo][]).map(([catKey, catInfo]) => {
                const IconComp = catInfo.icon;
                const isSelected = selectedCategory === catKey;
                return (
                  <button
                    key={catKey}
                    onClick={() => {
                      setSelectedCategory(catKey);
                      setSelectedSectionId('all');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-bold shadow'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    <span>{catInfo.label.split(' ')[0]}</span>
                    <span className="text-[10px] opacity-80 bg-slate-950/50 px-1.5 py-0.5 rounded-full">
                      {catInfo.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Selector Dropdown & Counter */}
          <div className="bg-slate-950/40 border-b border-slate-800 px-5 py-2 flex items-center justify-between text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-2">
              <span>Lọc theo Section cụ thể:</span>
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="bg-slate-900 text-emerald-400 border border-slate-800 rounded-md px-2 py-1 text-xs focus:outline-none"
              >
                <option value="all">-- Hiển thị tất cả Sections ({sections.length}) --</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    [{sec.name}] ({sec.settings.length} cài đặt)
                  </option>
                ))}
              </select>
            </div>

            <div className="text-slate-400">
              Hiển thị: <strong className="text-emerald-400">{filteredSections.length}</strong> sections /{' '}
              <strong className="text-emerald-400">{totalMatchingSettings}</strong> thông số cài đặt
            </div>
          </div>

          {/* Render All Sections & Form Inputs */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {filteredSections.length === 0 ? (
              <div className="py-16 text-center text-slate-500 space-y-2">
                <Search className="w-8 h-8 mx-auto stroke-1 text-slate-600" />
                <p className="text-sm font-mono">Không tìm thấy cài đặt nào phù hợp với từ khóa "{searchQuery}".</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedSectionId('all');
                  }}
                  className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg cursor-pointer font-mono"
                >
                  Xóa bộ lọc tìm kiếm
                </button>
              </div>
            ) : (
              filteredSections.map((sec) => {
                const isCollapsed = collapsedSections[sec.id] ?? false;

                return (
                  <div
                    key={sec.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl transition-all"
                  >
                    {/* Section Header */}
                    <div
                      onClick={() => toggleCollapse(sec.id)}
                      className="bg-slate-900/90 border-b border-slate-800/80 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <button className="text-slate-400 hover:text-slate-200">
                          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <h3 className="text-sm font-bold font-mono text-emerald-400 flex items-center gap-2">
                          [{sec.name}]
                        </h3>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {sec.categoryLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                        <span>{sec.settings.length} thông số</span>
                      </div>
                    </div>

                    {/* Section Description if available */}
                    {sec.description && !isCollapsed && (
                      <div className="bg-slate-900/40 px-4 py-2 text-xs text-slate-400 border-b border-slate-800/50 italic font-sans flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>{sec.description}</span>
                      </div>
                    )}

                    {/* Settings Grid */}
                    {!isCollapsed && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sec.settings.map((setting) => (
                          <RenderSettingControl
                            key={`${sec.id}-${setting.key}`}
                            sectionId={sec.id}
                            setting={setting}
                            onChange={(val) => handleSettingChange(sec.id, setting.key, val)}
                            onAddArrayItem={(text) => handleAddArrayItem(sec.id, setting.key, text)}
                            onRemoveArrayItem={(idx) => handleRemoveArrayItem(sec.id, setting.key, idx)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Raw INI Code Editor */
        <div className="flex-1 flex flex-col p-5 space-y-3 bg-[#080d18]">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-400" />
              Chỉnh sửa file thô: <strong className="text-emerald-300">/MinecraftClient.ini</strong>
            </span>
            <span>{rawText.split('\n').length} dòng</span>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full flex-1 min-h-[500px] bg-[#0b1120] text-emerald-300 font-mono text-xs p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500 leading-relaxed resize-y select-text shadow-inner"
            placeholder="Viết hoặc dán toàn bộ cấu hình MinecraftClient.ini vào đây..."
          />

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500 font-mono">
              Bấm "Lưu Raw Text" để áp dụng trực tiếp file INI vào hệ thống.
            </span>
            <button
              onClick={handleSaveRaw}
              className="btn btn-primary !px-6 !py-2.5"
            >
              <Save className="w-4 h-4" />
              Lưu Raw Text INI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Component to render individual setting input controls matching their types
interface RenderSettingControlProps {
  sectionId: string;
  setting: INISetting;
  onChange: (val: any) => void;
  onAddArrayItem: (item: string) => void;
  onRemoveArrayItem: (idx: number) => void;
}

const RenderSettingControl: React.FC<RenderSettingControlProps> = ({
  setting,
  onChange,
  onAddArrayItem,
  onRemoveArrayItem,
}) => {
  const [newTagInput, setNewTagInput] = useState('');

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTagInput.trim()) {
      onAddArrayItem(newTagInput.trim());
      setNewTagInput('');
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 hover:border-slate-700/80 p-3 rounded-xl flex flex-col justify-between space-y-2 transition-all">
      {/* Label and Key */}
      <div className="flex items-start justify-between gap-2">
        <label className="text-xs font-mono font-bold text-slate-200 break-all select-none flex items-center gap-1.5">
          {setting.key}
          {setting.type === 'boolean' && (
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
              Bool
            </span>
          )}
        </label>
      </div>

      {/* Input Control according to setting type */}
      <div className="pt-1">
        {/* BOOLEAN TOGGLE */}
        {setting.type === 'boolean' && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">
              Trạng thái: <strong className={setting.value ? 'text-emerald-400' : 'text-slate-500'}>{setting.value ? 'TRUE (Bật)' : 'FALSE (Tắt)'}</strong>
            </span>
            <button
              type="button"
              onClick={() => onChange(!setting.value)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                setting.value ? 'bg-emerald-600' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  setting.value ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}

        {/* ENUM SELECT */}
        {setting.type === 'enum' && setting.options && (
          <select
            value={String(setting.value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {setting.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {/* NUMBER INPUT */}
        {setting.type === 'number' && (
          <input
            type="number"
            value={setting.value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
          />
        )}

        {/* STRING INPUT */}
        {setting.type === 'string' && (
          <input
            type="text"
            value={String(setting.value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        )}

        {/* ARRAY LIST TAG EDITOR */}
        {setting.type === 'array' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-slate-950 rounded-lg border border-slate-800">
              {Array.isArray(setting.value) && setting.value.length > 0 ? (
                setting.value.map((item: string, idx: number) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 text-emerald-300 px-2 py-0.5 rounded text-[11px] font-mono"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => onRemoveArrayItem(idx)}
                      className="hover:text-rose-400 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[10px] font-mono text-slate-500 p-1">(Danh sách trống)</span>
              )}
            </div>

            <form onSubmit={handleAddTag} className="flex items-center gap-1">
              <input
                type="text"
                placeholder="+ Thêm phần tử..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono rounded cursor-pointer"
              >
                Thêm
              </button>
            </form>
          </div>
        )}

        {/* OBJECT INLINE FORMAT */}
        {setting.type === 'object' && (
          <input
            type="text"
            value={String(setting.value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
          />
        )}
      </div>

      {/* Tooltip Comment if present */}
      {setting.comment && (
        <p className="text-[10px] text-slate-400 font-sans italic leading-tight pt-1 border-t border-slate-800/60 line-clamp-2" title={setting.comment}>
          {setting.comment}
        </p>
      )}
    </div>
  );
};
