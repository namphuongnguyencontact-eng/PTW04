'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Compass,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  Terminal,
  Filter,
  Tag,
  FolderTree,
  Flame,
  ThumbsUp,
  MessageSquare,
  Calendar,
  MapPin,
  Sliders,
  Layers,
  ChevronDown,
  Globe,
  User,
  LogIn,
  LogOut,
  KeyRound,
} from 'lucide-react';

interface MatchedPostItem {
  id?: string;
  threadsPostId: string;
  postUrl: string;
  authorUsername: string;
  content: string;
  likesCount: number;
  repliesCount: number;
  publishedAt: string | Date;
  matchedCategory?: {
    category: string;
    score: number;
    reason: string;
  };
}

interface CrawlerModalProps {
  onClose: () => void;
  onCrawlComplete: () => void;
}

export function CrawlerModal({ onClose, onCrawlComplete }: CrawlerModalProps) {
  // 1. Categories Input (Multiple product categories)
  const [categoriesInput, setCategoriesInput] = useState<string>(
    'Decor phòng ngủ & Bàn học\nPhụ kiện công nghệ & Công thái học\nĐồ gia dụng thông minh\nThời trang & Balo đi học\nMỹ phẩm & Chăm sóc da'
  );
  const [dbCategories, setDbCategories] = useState<Array<{ id: string; name: string }>>([]);

  // 2. Continuous / Limit settings
  const [isContinuous, setIsContinuous] = useState(true);
  const [limit, setLimit] = useState(20);

  // 3. Conditional filters
  const [minLikes, setMinLikes] = useState<number>(0);
  const [minReplies, setMinReplies] = useState<number>(0);
  const [minViews, setMinViews] = useState<number>(0);
  const [onlyYear2026, setOnlyYear2026] = useState(true);
  const [vietnamOnly, setVietnamOnly] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  // 4. UI view & execution state
  const [activeTab, setActiveTab] = useState<'config' | 'results' | 'terminal'>('config');
  const [showFilters, setShowFilters] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [matchedPosts, setMatchedPosts] = useState<MatchedPostItem[]>([]);
  const [logs, setLogs] = useState<
    Array<{ timestamp: string; level: 'info' | 'success' | 'warn' | 'error'; message: string; url?: string }>
  >([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load existing categories from DB
  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) {
          setDbCategories(d.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Handle load categories from DB
  const handleLoadDbCategories = () => {
    if (dbCategories.length === 0) return;
    const names = dbCategories.map((c) => c.name).join('\n');
    setCategoriesInput((prev) => (prev ? `${prev}\n${names}` : names));
  };

  // Add quick preset category
  const handleAddPreset = (name: string) => {
    if (categoriesInput.includes(name)) return;
    setCategoriesInput((prev) => (prev.trim() ? `${prev.trim()}\n${name}` : name));
  };

  // Parse categories into clean array
  const parsedCategories = categoriesInput
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // START CONTINUOUS CRAWL
  const handleStartCrawl = async () => {
    setIsRunning(true);
    setMatchedPosts([]);
    setActiveTab('terminal'); // Switch directly to see live browser launch and real-time logs
    const newJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setCurrentJobId(newJobId);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLogs([
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `Khởi chạy bộ máy quét Threads liên tục (Chỉ nhận bài viết năm 2026 tại Việt Nam)...`,
      },
    ]);

    try {
      const response = await fetch('/api/crawler/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          mode: 'feed', // Always crawls real feeds & explore from Threads
          continuous: isContinuous,
          limit: isContinuous ? 0 : Number(limit) || 20,
          jobId: newJobId,
          targetCategories: parsedCategories,
          minLikes: Number(minLikes) || 0,
          minReplies: Number(minReplies) || 0,
          minViews: Number(minViews) || 0,
          onlyYear2026,
          vietnamOnly,
          autoAnalyze,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Lỗi phản hồi từ máy chủ khi khởi chạy quét.');
      }

      if (!response.body) {
        throw new Error('Không nhận được luồng dữ liệu stream từ máy chủ.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evtStr of events) {
          if (!evtStr.trim()) continue;
          const lines = evtStr.split('\n');
          let eventType = '';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.replace('event: ', '').trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.replace('data: ', '').trim();
            }
          }

          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              if (eventType === 'progress') {
                if (parsed.log) {
                  setLogs((prev) => [...prev, parsed.log]);
                }
                if (parsed.post) {
                  const newPostItem: MatchedPostItem = {
                    id: parsed.post.id,
                    threadsPostId: parsed.post.threadsPostId,
                    postUrl: parsed.post.postUrl,
                    authorUsername: parsed.post.authorUsername,
                    content: parsed.post.content,
                    likesCount: parsed.post.likesCount,
                    repliesCount: parsed.post.repliesCount,
                    publishedAt: parsed.post.publishedAt,
                    matchedCategory: parsed.matchedCategory,
                  };
                  setMatchedPosts((prev) => [newPostItem, ...prev]);
                }
              } else if (eventType === 'complete') {
                setIsRunning(false);
                setLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'success',
                    message: `Hoàn tất tiến trình quét Threads. Đã lưu trữ ${parsed.totalSaved} bài viết thực tế.`,
                  },
                ]);
              } else if (eventType === 'error') {
                setLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'error',
                    message: `Lỗi: ${parsed.error}`,
                  },
                ]);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            level: 'error',
            message: `Lỗi kết nối: ${err.message}`,
          },
        ]);
      }
    } finally {
      setIsRunning(false);
      onCrawlComplete();
    }
  };

  // STOP CRAWLING BUTTON
  const handleStopCrawl = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    try {
      await fetch('/api/crawler/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJobId }),
      });
    } catch {}

    setIsRunning(false);
    setLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'warn',
        message: '🛑 Đã dừng quét thành công theo lệnh của người dùng.',
      },
    ]);
    onCrawlComplete();
  };

  const [account, setAccount] = useState<{
    isLoggedIn: boolean;
    username?: string;
    savedAt?: string;
  }>({ isLoggedIn: false });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    fetch('/api/crawler/account')
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.account) {
          setAccount(data.account);
        }
      })
      .catch(() => {});
  }, []);

  const handleStartLogin = async () => {
    setIsLoggingIn(true);
    setActiveTab('terminal');
    setLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: '🚀 Đang mở cửa sổ Google Chrome để bạn đăng nhập Threads...',
      },
    ]);

    try {
      const res = await fetch('/api/crawler/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open_login' }),
      });

      if (!res.body) {
        setIsLoggingIn(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evtStr of events) {
          if (!evtStr.trim()) continue;
          const lines = evtStr.split('\n');
          let eventType = '';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.replace('event: ', '').trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.replace('data: ', '').trim();
            }
          }

          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              if (eventType === 'status') {
                setLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'info',
                    message: parsed.message,
                  },
                ]);
              } else if (eventType === 'login_success') {
                setAccount(parsed.account);
                setIsLoggingIn(false);
                setLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'success',
                    message: parsed.message,
                  },
                ]);
              } else if (eventType === 'error') {
                setIsLoggingIn(false);
                setLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'error',
                    message: `Lỗi: ${parsed.error}`,
                  },
                ]);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setIsLoggingIn(false);
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          level: 'error',
          message: `Lỗi đăng nhập: ${err.message}`,
        },
      ]);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Bạn có chắc muốn hủy lưu tài khoản Threads này?')) return;
    try {
      await fetch('/api/crawler/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      setAccount({ isLoggedIn: false });
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          level: 'warn',
          message: '🛑 Đã xóa thông tin tài khoản đã lưu.',
        },
      ]);
    } catch {}
  };


  // Group matched posts by category
  const categoryStats: Record<string, number> = {};
  for (const p of matchedPosts) {
    const cat = p.matchedCategory?.category || 'Chưa phân loại';
    categoryStats[cat] = (categoryStats[cat] || 0) + 1;
  }

  const samplePresets = [
    'Decor phòng ngủ & Bàn học',
    'Phụ kiện công nghệ & Công thái học',
    'Đồ gia dụng thông minh',
    'Thời trang & Phụ kiện',
    'Mỹ phẩm & Chăm sóc da',
    'Thực phẩm & Đồ ăn vặt',
    'Mẹ và Bé',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6">
      <div className="bg-[#FEFAF3] rounded-2xl border border-[#84A282]/30 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#84A282]/20 flex items-center justify-between bg-[#F6E2E9]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#84A282] text-white flex items-center justify-center shadow-xs">
              <Compass className={`w-5 h-5 ${isRunning ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm md:text-base text-[#222B24]">
                  Hệ thống quét tự động Threads
                </h3>
                {isRunning ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Đang quét liên tục... ({matchedPosts.length} bài)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200/70 text-[#5E6D62]">
                    Chờ lệnh
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#5E6D62]">
                Tự động quét bài viết thật từ https://www.threads.com/ — Năm 2026 tại Việt Nam — Tự động phân loại theo danh mục
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                type="button"
                onClick={handleStopCrawl}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer animate-bounce"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Dừng quét
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[#5E6D62] hover:bg-[#F6E2E9] transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-[#84A282]/20 flex items-center gap-2 bg-[#FEFAF3]">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-3 border-b-2 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'config'
                ? 'border-[#84A282] text-[#84A282]'
                : 'border-transparent text-[#5E6D62] hover:text-[#222B24]'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            Cấu hình danh mục & Điều kiện
          </button>

          <button
            onClick={() => setActiveTab('results')}
            className={`py-3 px-3 border-b-2 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'results'
                ? 'border-[#84A282] text-[#84A282]'
                : 'border-transparent text-[#5E6D62] hover:text-[#222B24]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Bài viết phù hợp đã quét ({matchedPosts.length})
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`py-3 px-3 border-b-2 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'terminal'
                ? 'border-[#84A282] text-[#84A282]'
                : 'border-transparent text-[#5E6D62] hover:text-[#222B24]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-[#84A282]" />
            Nhật ký Live Stream ({logs.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: CONFIGURATION */}
          {activeTab === 'config' && (
            <div className="space-y-4">
              {/* STEP 1: LOGIN & PERSIST ACCOUNT */}
              <div className="p-4 rounded-2xl bg-white border border-[#84A282]/30 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#84A282]/15 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#84A282] text-white text-[11px] font-black flex items-center justify-center">
                      1
                    </span>
                    <h4 className="text-xs font-bold text-[#222B24] uppercase">
                      Bước 1: Đăng nhập tài khoản Threads (Lưu tự động cho các lần sau)
                    </h4>
                  </div>
                  {account.isLoggedIn && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Đã lưu tài khoản: @{account.username}
                    </span>
                  )}
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[#FEFAF3] p-3.5 rounded-xl border border-[#84A282]/20">
                  <div className="space-y-0.5">
                    {account.isLoggedIn ? (
                      <>
                        <p className="text-xs font-bold text-[#222B24] flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[#84A282]" />
                          Tài khoản: <span className="text-[#84A282]">@{account.username}</span>
                        </p>
                        <p className="text-[11px] text-[#5E6D62]">
                          Phiên đăng nhập đã được lưu trong máy. Hệ thống sẽ tự động quét newfeed cá nhân của tài khoản này.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          Chưa kết nối tài khoản Threads cá nhân
                        </p>
                        <p className="text-[11px] text-[#5E6D62]">
                          Bấm nút bên dưới để mở cửa sổ Chrome đăng nhập. Bạn chỉ cần đăng nhập 1 lần duy nhất, hệ thống sẽ lưu tự động.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isLoggingIn ? (
                      <button
                        disabled
                        className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 animate-pulse shadow-sm"
                      >
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Đang chờ đăng nhập trên Chrome...
                      </button>
                    ) : account.isLoggedIn ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleStartLogin}
                          className="px-3 py-1.5 rounded-xl border border-[#84A282]/40 text-[#222B24] hover:bg-[#84A282]/10 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <KeyRound className="w-3 h-3 text-[#84A282]" />
                          Đăng nhập lại / Đổi nick
                        </button>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="px-2.5 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                          title="Xóa tài khoản đã lưu"
                        >
                          <LogOut className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartLogin}
                        className="px-4 py-2 rounded-xl bg-[#84A282] hover:bg-[#728f70] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Mở Chrome Đăng nhập Threads
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* STEP 2 BANNER */}
              <div className="flex items-center gap-2 pt-1">
                <span className="w-5 h-5 rounded-full bg-[#84A282] text-white text-[11px] font-black flex items-center justify-center">
                  2
                </span>
                <h4 className="text-xs font-bold text-[#222B24] uppercase">
                  Bước 2: Cấu hình danh mục & Quét tự động cuộn từng bài trên Newfeed
                </h4>
              </div>

              {/* Product Categories Input Area */}
              <div className="p-4 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#222B24] uppercase flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#84A282]" />
                    Tên CÁC danh mục sản phẩm bạn muốn đối chiếu ({parsedCategories.length} danh mục)
                  </label>
                  {dbCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={handleLoadDbCategories}
                      className="text-[11px] font-semibold text-[#84A282] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Layers className="w-3 h-3" />
                      Lấy từ kho danh mục ({dbCategories.length})
                    </button>
                  )}
                </div>

                <textarea
                  rows={4}
                  value={categoriesInput}
                  onChange={(e) => setCategoriesInput(e.target.value)}
                  disabled={isRunning}
                  placeholder="Nhập tên các danh mục sản phẩm (mỗi dòng hoặc dấu phẩy một danh mục)...&#10;Ví dụ:&#10;Decor phòng ngủ & Bàn học&#10;Phụ kiện công nghệ & Công thái học&#10;Đồ gia dụng thông minh&#10;Thời trang nữ"
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282] font-mono leading-relaxed"
                />

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-[#5E6D62] font-medium">Gợi ý danh mục nhanh:</span>
                  {samplePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={isRunning}
                      onClick={() => handleAddPreset(preset)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] hover:bg-[#84A282]/10 transition-colors cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>

                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Cơ chế phân tích phù hợp thông minh:</strong> Bài viết trên Threads <u>không cần</u> chứa từ khóa của danh mục. Hệ thống AI & NLP tự động phân tích tình huống, vấn đề, không gian và nỗi đau của người đăng để suy luận xem bài viết phù hợp với danh mục sản phẩm nào nhất.
                  </div>
                </div>
              </div>

              {/* Crawl Mode: Continuous vs Limited */}
              <div className="p-4 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#222B24] uppercase flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[#84A282]" />
                    Chế độ quét
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setIsContinuous(true)}
                      className={`px-3 py-1 rounded-xl font-bold cursor-pointer transition-all ${
                        isContinuous
                          ? 'bg-[#84A282] text-white shadow-xs'
                          : 'bg-gray-100 text-[#5E6D62] hover:bg-gray-200'
                      }`}
                    >
                      Quét liên tục không giới hạn (Khuyên dùng)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsContinuous(false)}
                      className={`px-3 py-1 rounded-xl font-bold cursor-pointer transition-all ${
                        !isContinuous
                          ? 'bg-[#84A282] text-white shadow-xs'
                          : 'bg-gray-100 text-[#5E6D62] hover:bg-gray-200'
                      }`}
                    >
                      Giới hạn {limit} bài
                    </button>
                  </div>
                </div>

                {!isContinuous && (
                  <div>
                    <label className="block text-[11px] text-[#5E6D62] mb-1">
                      Số lượng bài viết mục tiêu: <strong>{limit} bài</strong>
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="5"
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      disabled={isRunning}
                      className="w-full accent-[#84A282] cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Conditional Filters Collapsible */}
              <div className="p-4 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs space-y-3">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="w-full flex items-center justify-between text-xs font-bold text-[#222B24] uppercase cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-[#84A282]" />
                    Bộ lọc điều kiện tương tác, năm 2026 & khu vực
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>

                {showFilters && (
                  <div className="pt-2 border-t border-[#84A282]/15 space-y-3">
                    {/* Year & Region checks */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/20 text-xs text-[#222B24] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={onlyYear2026}
                          onChange={(e) => setOnlyYear2026(e.target.checked)}
                          disabled={isRunning}
                          className="rounded border-[#84A282] text-[#84A282] focus:ring-[#84A282] w-4 h-4"
                        />
                        <span className="font-semibold flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#84A282]" />
                          Chỉ lấy bài viết mới năm 2026
                        </span>
                      </label>

                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/20 text-xs text-[#222B24] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={vietnamOnly}
                          onChange={(e) => setVietnamOnly(e.target.checked)}
                          disabled={isRunning}
                          className="rounded border-[#84A282] text-[#84A282] focus:ring-[#84A282] w-4 h-4"
                        />
                        <span className="font-semibold flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-600" />
                          Chỉ lấy tại Việt Nam (Tiếng Việt)
                        </span>
                      </label>
                    </div>

                    {/* Numeric thresholds */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[#5E6D62] uppercase mb-1">
                          Lượt tim tối thiểu (Likes)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={minLikes}
                          onChange={(e) => setMinLikes(Number(e.target.value))}
                          disabled={isRunning}
                          placeholder="0"
                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5E6D62] uppercase mb-1">
                          Lượt phản hồi (Replies)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={minReplies}
                          onChange={(e) => setMinReplies(Number(e.target.value))}
                          disabled={isRunning}
                          placeholder="0"
                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5E6D62] uppercase mb-1">
                          Lượt xem (Views)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={minViews}
                          onChange={(e) => setMinViews(Number(e.target.value))}
                          disabled={isRunning}
                          placeholder="0"
                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LIVE MATCHED RESULTS */}
          {activeTab === 'results' && (
            <div className="space-y-4">
              {/* Category stats chips */}
              {Object.keys(categoryStats).length > 0 && (
                <div className="p-3 rounded-xl bg-white border border-[#84A282]/20 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-[#5E6D62] uppercase">
                    Thống kê danh mục phù hợp:
                  </span>
                  {Object.entries(categoryStats).map(([cat, count]) => (
                    <span
                      key={cat}
                      className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#84A282]/15 text-[#222B24] border border-[#84A282]/30 flex items-center gap-1.5"
                    >
                      <Tag className="w-3 h-3 text-[#84A282]" />
                      {cat}: <span className="text-[#84A282] font-black">{count}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Matched Posts List */}
              {matchedPosts.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-[#84A282]/20 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-[#84A282]/15 text-[#84A282] mx-auto flex items-center justify-center">
                    <Compass className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-[#222B24]">
                    Chưa có bài viết nào trong danh sách
                  </h4>
                  <p className="text-xs text-[#5E6D62] max-w-md mx-auto">
                    Nhấn "Bắt đầu quét liên tục" để crawler tự động tìm kiếm các bài viết mới từ Threads và phân loại danh mục ngay lập tức.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {matchedPosts.map((post, idx) => (
                    <div
                      key={post.threadsPostId || idx}
                      className="p-4 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs space-y-2.5 hover:border-[#84A282] transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-[#84A282]">#{idx + 1}</span>
                          <span className="text-xs font-bold text-[#222B24]">@{post.authorUsername}</span>
                          <span className="text-[11px] text-[#5E6D62] flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(post.publishedAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            <ThumbsUp className="w-3 h-3" /> {post.likesCount}
                          </span>
                          <span className="text-[11px] font-semibold text-sky-600 flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                            <MessageSquare className="w-3 h-3" /> {post.repliesCount}
                          </span>
                          <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-[#84A282] hover:text-[#6d8b6b] flex items-center gap-1 underline ml-1"
                          >
                            Bài gốc <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      {/* Post content preview */}
                      <p className="text-xs text-[#222B24] leading-relaxed line-clamp-3">
                        {post.content}
                      </p>

                      {/* Matched Category Badge & Reason */}
                      {post.matchedCategory && (
                        <div className="p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#5E6D62] text-[11px] uppercase">
                              Phù hợp danh mục:
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-[#84A282] text-white font-bold text-xs shadow-xs">
                              {post.matchedCategory.category}
                            </span>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              {post.matchedCategory.score}% khớp
                            </span>
                          </div>
                          <span className="text-[11px] text-[#5E6D62] italic">
                            💡 {post.matchedCategory.reason}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TERMINAL LIVE LOGS */}
          {activeTab === 'terminal' && (
            <div className="p-3 rounded-xl bg-[#1e2420] text-emerald-300 font-mono text-[11px] h-96 overflow-y-auto space-y-1.5 shadow-inner">
              {logs.length === 0 ? (
                <div className="text-zinc-500 italic py-16 text-center">
                  Nhật ký trực tiếp sẽ hiển thị tại đây khi tiến trình bắt đầu...
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-zinc-500 shrink-0">[{log.timestamp}]</span>
                    <span
                      className={`break-all ${
                        log.level === 'error'
                          ? 'text-rose-400 font-bold'
                          : log.level === 'warn'
                          ? 'text-amber-300'
                          : log.level === 'success'
                          ? 'text-emerald-400 font-semibold'
                          : 'text-zinc-300'
                      }`}
                    >
                      {log.message}
                      {log.url && (
                        <a
                          href={log.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1.5 inline-flex items-center gap-0.5 text-sky-400 hover:underline"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Xem bài thật
                        </a>
                      )}
                    </span>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#84A282]/20 flex items-center justify-between bg-white/80">
          <div className="text-[11px] text-[#5E6D62]">
            {isRunning ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Hệ thống đang cuộn trang và quét bài viết thật từ Threads... Bấm "Dừng quét" bất kỳ lúc nào để dừng.
              </span>
            ) : (
              <span>
                * Mỗi bài viết được kiểm tra nghiêm ngặt: <strong>Năm 2026</strong>, <strong>Việt Nam</strong> và đối chiếu mức độ phù hợp danh mục.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={handleStopCrawl}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Dừng quét ngay
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-[#5E6D62] hover:bg-[#F6E2E9] rounded-xl transition-all cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleStartCrawl}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#84A282] hover:bg-[#728f70] rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {isContinuous ? '🚀 Bắt đầu quét Newfeed cá nhân (Tự động cuộn)' : `Quét ${limit} bài viết Newfeed`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
