'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import {
  FileText,
  DownloadCloud,
  Sparkles,
  Link as LinkIcon,
  MessageSquare,
  Heart,
  Share2,
  Eye,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Save,
  Clock,
  User,
  ArrowRight,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { PostDetailsForExport, DetailedComment } from '@/lib/docx/threads-docx-generator';

export default function ExportWordPage() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'deep' | 'fast'>('deep');
  const [maxComments, setMaxComments] = useState<number>(0); // 0 = all
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [postData, setPostData] = useState<PostDetailsForExport | null>(null);

  // Comments search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'likes' | 'subReplies'>('default');

  // Saving post state
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  // Downloading docx state
  const [isDownloading, setIsDownloading] = useState(false);

  const handleScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      setError('Vui lòng nhập link bài viết Threads (threads.net hoặc threads.com)');
      return;
    }

    setLoading(true);
    setError(null);
    setPostData(null);
    setSavedSuccessMsg(null);
    setProgressMsg('Đang phân tích liên kết bài viết...');

    try {
      if (mode === 'deep') {
        setProgressMsg('Đang khởi động crawler và kết nối bài viết trên Threads...');
      } else {
        setProgressMsg('Đang quét nhanh nội dung bài viết và các bình luận hàng đầu...');
      }

      const res = await fetch('/api/crawler/scrape-post-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          mode,
          maxComments,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Không thể quét bài viết từ URL này.');
      }

      setPostData(json.data);
      setProgressMsg('');
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi quét bài viết');
      setProgressMsg('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!postData) return;
    setIsDownloading(true);

    try {
      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postData }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Lỗi khi tạo file Word');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const cleanAuthor = (postData.username || 'threads').replace(/[^a-zA-Z0-9_-]/g, '');
      a.download = `threads_${cleanAuthor}_${postData.code || Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Không thể tải file Word');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!postData) return;
    setIsSavingToDb(true);
    setSavedSuccessMsg(null);

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: postData.url,
          content: postData.content,
          authorUsername: postData.username,
          likesCount: postData.likeCount,
          repliesCount: postData.replyCount,
          repostsCount: postData.repostCount,
          autoAnalyze: true,
          comments: (postData.comments || []).map((c) => ({
            authorUsername: c.authorUsername,
            content: c.content,
            likesCount: c.likesCount || 0,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi lưu bài viết vào hệ thống');
      }

      setSavedSuccessMsg('✓ Đã lưu bài viết và các bình luận vào hệ thống thành công!');
    } catch (err: any) {
      alert(err.message || 'Không thể lưu bài viết');
    } finally {
      setIsSavingToDb(false);
    }
  };

  // Filter and sort comments
  const filteredComments = (postData?.comments || []).filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.authorUsername.toLowerCase().includes(term) ||
      c.content.toLowerCase().includes(term)
    );
  });

  const sortedComments = [...filteredComments].sort((a, b) => {
    if (sortBy === 'likes') {
      return (b.likesCount || 0) - (a.likesCount || 0);
    }
    if (sortBy === 'subReplies') {
      return (b.isSubReply ? 1 : 0) - (a.isSubReply ? 1 : 0);
    }
    return 0;
  });

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Quét & Xuất Word Bài Viết Threads"
          subtitle="Trích xuất toàn diện thông tin bài viết và tất cả bình luận thành file Microsoft Word (.docx) chuẩn"
        />

        <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
          {/* Header Banner Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#222B24] via-[#2F3B32] to-[#435547] text-[#FEFAF3] p-6 md:p-8 shadow-lg">
            <div className="relative z-10 max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#84A282]/30 border border-[#84A282]/50 text-xs font-semibold text-[#EBF3EA]">
                <FileText className="w-3.5 h-3.5 text-[#B8CFB3]" />
                Tính năng Xuất Báo Cáo Tài Liệu Word (.docx)
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Quét Dữ Liệu & Xuất File Word / Docs Tự Động
              </h1>
              <p className="text-sm md:text-base text-gray-300 leading-relaxed">
                Chỉ cần dán link bất kỳ từ Threads, hệ thống sẽ tự động quét toàn bộ thông tin bài viết,
                thu thập đầy đủ danh sách bình luận (comments & replies) và tạo file Microsoft Word (.docx)
                được căn chỉnh đẹp mắt, trình bày rõ ràng.
              </p>
            </div>
            <div className="absolute -right-8 -bottom-8 w-64 h-64 bg-[#84A282]/15 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Input & Configuration Card */}
          <div className="bg-white rounded-2xl border border-[#84A282]/30 p-6 shadow-sm space-y-5">
            <form onSubmit={handleScan} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#222B24] mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-[#84A282]" />
                    Đường dẫn bài viết Threads (URL)
                  </span>
                  <span className="text-xs font-normal text-[#5E6D62]">
                    Hỗ trợ định dạng threads.net hoặc threads.com
                  </span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.threads.net/@user/post/DeB8NnHGKZc hoặc https://www.threads.com/@user/post/..."
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-[#84A282] focus:ring-2 focus:ring-[#84A282]/30 text-sm outline-none transition-all pr-10"
                    />
                    {url && (
                      <button
                        type="button"
                        onClick={() => setUrl('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 bg-[#84A282] hover:bg-[#6e8a6c] text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang quét...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Bắt đầu quét</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Mode & Limits Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#222B24] uppercase tracking-wider block">
                    Chế độ quét
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                        mode === 'deep'
                          ? 'border-[#84A282] bg-[#F6F8F6] ring-1 ring-[#84A282]'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#222B24]">Quét sâu toàn bộ</span>
                        <input
                          type="radio"
                          name="mode"
                          value="deep"
                          checked={mode === 'deep'}
                          onChange={() => setMode('deep')}
                          className="text-[#84A282] focus:ring-[#84A282]"
                        />
                      </div>
                      <span className="text-[11px] text-[#5E6D62] leading-tight">
                        Tự động cuộn trang và tải toàn bộ bình luận & phản hồi con
                      </span>
                    </label>

                    <label
                      className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                        mode === 'fast'
                          ? 'border-[#84A282] bg-[#F6F8F6] ring-1 ring-[#84A282]'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#222B24]">Quét nhanh tức thì</span>
                        <input
                          type="radio"
                          name="mode"
                          value="fast"
                          checked={mode === 'fast'}
                          onChange={() => setMode('fast')}
                          className="text-[#84A282] focus:ring-[#84A282]"
                        />
                      </div>
                      <span className="text-[11px] text-[#5E6D62] leading-tight">
                        Quét nhanh thông tin bài viết & các bình luận hiển thị đầu tiên
                      </span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#222B24] uppercase tracking-wider block">
                    Giới hạn số bình luận tối đa
                  </span>
                  <select
                    value={maxComments}
                    onChange={(e) => setMaxComments(Number(e.target.value))}
                    disabled={mode === 'fast'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-medium focus:border-[#84A282] focus:ring-1 focus:ring-[#84A282] outline-none bg-white cursor-pointer disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value={0}>Tất cả bình luận (Không giới hạn - Khuyên dùng)</option>
                    <option value={30}>Tối đa 30 bình luận</option>
                    <option value={50}>Tối đa 50 bình luận</option>
                    <option value={100}>Tối đa 100 bình luận</option>
                    <option value={200}>Tối đa 200 bình luận</option>
                  </select>
                  <p className="text-[11px] text-gray-500">
                    {mode === 'deep'
                      ? 'Thuật toán sẽ tự động dừng khi quét hết bình luận hoặc đạt mức tối đa.'
                      : 'Chế độ quét nhanh trích xuất các bình luận được nạp sẵn.'}
                  </p>
                </div>
              </div>
            </form>

            {/* Error Display */}
            {error && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <h4 className="font-bold">Lỗi quét bài viết</h4>
                  <p className="text-xs mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {loading && (
              <div className="p-6 rounded-2xl bg-[#F6F8F6] border border-[#84A282]/30 flex flex-col items-center justify-center text-center space-y-3">
                <div className="relative">
                  <Loader2 className="w-9 h-9 text-[#84A282] animate-spin" />
                  <Sparkles className="w-4 h-4 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#222B24]">Hệ thống đang tiến hành quét...</h4>
                  <p className="text-xs text-[#5E6D62] mt-1">{progressMsg}</p>
                </div>
                <div className="w-64 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-[#84A282] animate-pulse w-3/4 rounded-full" />
                </div>
              </div>
            )}
          </div>

          {/* Results & Preview Section */}
          {postData && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Main Actions Bar */}
              <div className="bg-white rounded-2xl border border-[#84A282]/40 p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-base text-[#222B24] flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-emerald-600" />
                    Đã trích xuất thành công ({postData.comments.length} bình luận)
                  </h3>
                  <p className="text-xs text-[#5E6D62] mt-0.5">
                    Bài viết của @{postData.username} • Mã bài viết: {postData.code}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={handleSaveToDatabase}
                    disabled={isSavingToDb}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-xs font-semibold text-[#222B24] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingToDb ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5 text-[#84A282]" />
                    )}
                    <span>Lưu vào hệ thống</span>
                  </button>

                  <button
                    onClick={handleDownloadDocx}
                    disabled={isDownloading}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#222B24] to-[#344437] hover:from-[#344437] hover:to-[#455848] text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <DownloadCloud className="w-4 h-4 text-[#84A282]" />
                    )}
                    <span>Tải File Word (.docx)</span>
                  </button>
                </div>
              </div>

              {/* Informative coverage badge */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-[13px]">
                    Đã quét 100% toàn bộ {postData.comments.length} bình luận & phản hồi con công khai có thể tiếp cận trên Threads.
                  </p>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    * Lưu ý kỹ thuật: Chỉ số tổng hiển thị ở đầu bài của Threads ({postData.replyCount} lượt phản hồi) thường tính gộp cả các lượt trích dẫn bài (Quote posts), bình luận đã bị xóa và các bình luận bị thuật toán tự động của Meta phân loại là spam/ẩn khỏi luồng thảo luận công khai.
                  </p>
                </div>
              </div>

              {savedSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{savedSuccessMsg}</span>
                </div>
              )}

              {/* Post Details Card */}
              <div className="bg-white rounded-2xl border border-[#84A282]/30 p-6 shadow-sm space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#84A282]/20 flex items-center justify-center overflow-hidden border border-[#84A282]/30">
                      {postData.avatar ? (
                        <img
                          src={postData.avatar}
                          alt={postData.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-6 h-6 text-[#84A282]" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-base text-[#222B24]">
                          @{postData.username}
                        </h2>
                        {postData.fullName && postData.fullName !== postData.username && (
                          <span className="text-xs text-[#5E6D62]">({postData.fullName})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#5E6D62] mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(postData.publishedAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={postData.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl text-[#5E6D62] hover:text-[#84A282] hover:bg-[#F6F8F6] border border-transparent hover:border-[#84A282]/20 transition-all text-xs flex items-center gap-1"
                    title="Mở bài viết gốc trên Threads"
                  >
                    <span>Xem link gốc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Post Content */}
                <div className="p-4 rounded-xl bg-[#F9FAF9] border-l-4 border-[#84A282] text-sm text-[#1F2937] leading-relaxed whitespace-pre-line font-normal">
                  {postData.content || '(Bài viết không có nội dung chữ)'}
                </div>

                {/* Metrics Pill Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                      <Heart className="w-4 h-4 fill-rose-600" />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block">Lượt tim</span>
                      <span className="font-bold text-sm text-gray-900">
                        {postData.likeCount.toLocaleString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block">Bình luận</span>
                      <span className="font-bold text-sm text-gray-900">
                        {postData.replyCount.toLocaleString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <Share2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block">Đăng lại</span>
                      <span className="font-bold text-sm text-gray-900">
                        {postData.repostCount.toLocaleString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                      <Eye className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block">Lượt xem</span>
                      <span className="font-bold text-sm text-gray-900">
                        {postData.viewsCount ? postData.viewsCount.toLocaleString('vi-VN') : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Comments Explorer Card */}
              <div className="bg-white rounded-2xl border border-[#84A282]/30 p-6 shadow-sm space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="font-bold text-base text-[#222B24] flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#84A282]" />
                      Danh Sách Bình Luận Đã Quét ({sortedComments.length}/{postData.comments.length})
                    </h3>
                    <p className="text-xs text-[#5E6D62] mt-0.5">
                      Tất cả các bình luận này sẽ được xuất chi tiết vào file Word
                    </p>
                  </div>

                  {/* Search and Sort controls */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Tìm người hoặc nội dung..."
                        className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:border-[#84A282] outline-none w-48 sm:w-56"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200 text-xs">
                      <Filter className="w-3.5 h-3.5 text-gray-500 ml-1.5" />
                      <select
                        value={sortBy}
                        onChange={(e: any) => setSortBy(e.target.value)}
                        className="bg-transparent text-xs text-gray-700 outline-none pr-2 cursor-pointer font-medium"
                      >
                        <option value="default">Thứ tự mặc định</option>
                        <option value="likes">Nhiều lượt thích nhất</option>
                        <option value="subReplies">Ưu tiên phản hồi con</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Comments List */}
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {sortedComments.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-xs">
                      Không tìm thấy bình luận nào phù hợp với bộ lọc tìm kiếm.
                    </div>
                  ) : (
                    sortedComments.map((c, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-xl border transition-all ${
                          c.isSubReply
                            ? 'bg-[#F9FAF9] border-l-4 border-l-[#84A282] border-gray-200 ml-4'
                            : 'bg-white border-gray-200 hover:border-[#84A282]/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-gray-400">#{index + 1}</span>
                            <span className="font-bold text-xs text-[#0284C7]">@{c.authorUsername}</span>
                            {c.isSubReply && (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                ↳ Phản hồi
                              </span>
                            )}
                            {c.time && (
                              <span className="text-[11px] text-gray-400">
                                • {new Date(c.time).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {c.commentUrl && (
                              <a
                                href={c.commentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-[11px] text-[#5E6D62] hover:text-[#0284C7] hover:underline bg-gray-50 hover:bg-sky-50 px-2 py-0.5 rounded-md border border-gray-200 transition-all"
                                title="Xem trực tiếp bình luận này trên Threads"
                              >
                                <span>Nguồn link</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <div className="flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                              <Heart className="w-3 h-3 fill-rose-600" />
                              <span>{c.likesCount || 0}</span>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-[#222B24] leading-relaxed whitespace-pre-line pl-6">
                          {c.content}
                        </p>

                        {c.commentUrl && (
                          <div className="mt-2 pl-6">
                            <a
                              href={c.commentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-[#0284C7] hover:underline inline-flex items-center gap-1 max-w-full truncate"
                              title="Đường dẫn trực tiếp của bình luận"
                            >
                              <LinkIcon className="w-3 h-3 shrink-0" />
                              <span className="truncate">{c.commentUrl}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
