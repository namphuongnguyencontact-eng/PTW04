'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Database,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  HelpCircle,
  Compass,
  FileText,
} from 'lucide-react';

interface TopNavProps {
  title?: string;
  subtitle?: string;
  onOpenAddPost?: () => void;
  onOpenCrawler?: () => void;
  onDataMutated?: () => void;
}

export function TopNav({
  title = 'Tổng quan hệ thống',
  subtitle = 'Phân tích lan truyền Threads và đối chiếu cơ hội affiliate',
  onOpenAddPost,
  onOpenCrawler,
  onDataMutated,
}: TopNavProps) {
  const [threadsStatus, setThreadsStatus] = useState<any>(null);
  const [aiStatus, setAiStatus] = useState<string>('local');
  const [isSeeding, setIsSeeding] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setThreadsStatus(data.data.threadsConnection);
        setAiStatus(data.data.aiConfig.provider);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSeedDemo = async () => {
    if (!confirm('Bạn có muốn nạp bộ dữ liệu mẫu (sản phẩm, bài viết và phân tích thực tế) để thử nghiệm?')) return;
    setIsSeeding(true);
    setMessage(null);
    try {
      const res = await fetch('/api/demo/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        if (onDataMutated) onDataMutated();
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMessage({ text: data.error, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleResetDemo = async () => {
    if (!confirm('Bạn có chắc muốn dọn dẹp toàn bộ dữ liệu mẫu?')) return;
    setIsSeeding(true);
    setMessage(null);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        if (onDataMutated) onDataMutated();
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMessage({ text: data.error, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <header className="bg-[#FEFAF3] border-b border-[#84A282]/15 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
      <div>
        <h2 className="text-xl font-bold text-[#222B24] tracking-tight">{title}</h2>
        <p className="text-xs text-[#5E6D62] mt-0.5">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Status Pills */}
        <div className="flex items-center gap-2 bg-[#F6E2E9]/70 px-3 py-1.5 rounded-xl border border-[#84A282]/20 text-xs">
          <span className="font-semibold text-[#222B24]">Threads:</span>
          {threadsStatus?.isValid ? (
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> API Kết nối
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#84A282] font-medium" title={threadsStatus?.message}>
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Thủ công / Demo
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 bg-[#B8CFB3]/30 px-3 py-1.5 rounded-xl border border-[#84A282]/20 text-xs text-[#222B24]">
          <span className="font-semibold">AI:</span>
          <span className="font-medium text-[#84A282] uppercase tracking-wide">
            {aiStatus === 'local' ? 'Local Heuristic' : aiStatus}
          </span>
        </div>

        {/* Demo Data Controls */}
        <div className="flex items-center gap-1 border-l border-[#84A282]/20 pl-2.5">
          <button
            onClick={handleSeedDemo}
            disabled={isSeeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#FEFAF3] border border-[#84A282]/40 text-[#222B24] hover:bg-[#B8CFB3]/30 transition-all cursor-pointer disabled:opacity-50"
            title="Nạp dữ liệu sản phẩm, bài viết Threads mẫu có sẵn phân tích AI"
          >
            <Database className="w-3.5 h-3.5 text-[#84A282]" />
            <span>{isSeeding ? 'Đang nạp...' : 'Tải mẫu'}</span>
          </button>

          <button
            onClick={handleResetDemo}
            disabled={isSeeding}
            className="p-1.5 text-xs rounded-xl text-[#5E6D62] hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-50"
            title="Xóa dữ liệu mẫu"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Auto Crawler CTA */}
        {onOpenCrawler && (
          <button
            onClick={onOpenCrawler}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-[#222B24] text-[#FEFAF3] hover:bg-[#344136] transition-all shadow-xs cursor-pointer ml-1"
          >
            <Compass className="w-3.5 h-3.5 text-[#84A282]" />
            <span>Quét Threads tự động</span>
          </button>
        )}

        {/* Export Word CTA */}
        <Link
          href="/export-word"
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-white border border-[#84A282]/40 text-[#222B24] hover:bg-[#F6F8F6] transition-all shadow-xs cursor-pointer ml-1"
          title="Gắn link bài viết Threads để quét và xuất file Word / Docs"
        >
          <FileText className="w-3.5 h-3.5 text-[#84A282]" />
          <span>Quét & Xuất Word</span>
        </Link>

        {/* Quick Add Post CTA */}
        {onOpenAddPost && (
          <button
            onClick={onOpenAddPost}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-[#84A282] text-[#FEFAF3] hover:bg-[#6d8b6b] transition-all shadow-xs cursor-pointer ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm bài viết</span>
          </button>
        )}
      </div>

      {message && (
        <div
          className={`absolute bottom-[-40px] right-6 text-xs px-3 py-1.5 rounded-lg border shadow-sm z-50 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </header>
  );
}
