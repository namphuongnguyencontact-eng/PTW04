'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import { CampaignModal } from '@/components/CampaignModal';
import { CrawlerModal } from '@/components/CrawlerModal';
import {
  Radio,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Flame,
} from 'lucide-react';
import Link from 'next/link';
import { ScanCampaignDTO, CategoryDTO } from '@/types';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<ScanCampaignDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCrawler, setShowCrawler] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campRes, catRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/categories'),
      ]);
      const [campJson, catJson] = await Promise.all([
        campRes.json(),
        catRes.json(),
      ]);
      if (campJson.success) setCampaigns(campJson.data);
      if (catJson.success) setCategories(catJson.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStartCampaign = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/campaigns/${id}/start`, { method: 'POST' });
      const json = await res.json();
      await fetchData();
      if (!json.success && json.status === 'NOT_CONFIGURED') {
        alert(json.message);
      }
    } catch (err: any) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setRunningId(null);
    }
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa chiến dịch "${name}"?`)) return;
    try {
      await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Hoàn thành
          </span>
        );
      case 'RUNNING':
      case 'ANALYZING':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" /> Đang chạy
          </span>
        );
      case 'NOT_CONFIGURED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Chưa cấu hình nguồn API
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
            Thất bại
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Chờ xử lý
          </span>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Chiến dịch quét Threads"
          subtitle="Tổ chức các chiến dịch thu thập nội dung theo chủ đề và từ khóa sản phẩm"
          onOpenCrawler={() => setShowCrawler(true)}
          onDataMutated={fetchData}
        />

        <main className="p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#222B24]">
                Danh sách chiến dịch quét ({campaigns.length})
              </h2>
              <p className="text-xs text-[#5E6D62]">
                Mỗi chiến dịch sẽ lọc bài viết theo từ khóa và chuyển thẳng sang phân tích AI
              </p>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo chiến dịch mới</span>
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-[#5E6D62]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#84A282]" />
              Đang tải danh sách chiến dịch...
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-12 rounded-2xl bg-white border border-[#84A282]/20 text-center space-y-3">
              <Radio className="w-10 h-10 text-[#5E6D62] mx-auto opacity-40" />
              <h3 className="font-bold text-sm text-[#222B24]">
                Chưa có chiến dịch quét nào
              </h3>
              <p className="text-xs text-[#5E6D62] max-w-sm mx-auto">
                Tạo chiến dịch quét với các chủ đề như sinh viên phòng trọ, setup bàn học, decor góc làm việc...
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer inline-flex items-center gap-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Tạo chiến dịch đầu tiên
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="p-5 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs space-y-4 hover:shadow-md transition-all"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#84A282]/15 pb-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h4 className="font-bold text-sm text-[#222B24]">
                          {camp.name}
                        </h4>
                        {getStatusBadge(camp.status)}
                      </div>
                      <p className="text-xs text-[#5E6D62] mt-0.5">
                        Chủ đề: <strong className="text-[#222B24]">{camp.topic}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartCampaign(camp.id)}
                        disabled={runningId === camp.id}
                        className="px-3.5 py-1.5 rounded-xl bg-[#84A282] text-white text-xs font-bold hover:bg-[#6d8b6b] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          {runningId === camp.id ? 'Đang chạy...' : 'Chạy chiến dịch'}
                        </span>
                      </button>

                      <Link
                        href={`/opportunities?campaignId=${camp.id}`}
                        className="px-3.5 py-1.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] text-xs font-semibold hover:bg-gray-50 flex items-center gap-1"
                      >
                        <span>Xem kết quả</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>

                      <button
                        onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                        className="p-1.5 rounded-xl text-[#5E6D62] hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress & Counters */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/15">
                      <span className="text-[#5E6D62] block">Thu thập được</span>
                      <span className="font-bold text-sm text-[#222B24]">
                        {camp.collectedCount} / {camp.targetPostsCount} bài
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/15">
                      <span className="text-[#5E6D62] block">Hợp lệ & Tiềm năng</span>
                      <span className="font-bold text-sm text-[#222B24]">
                        {camp.validCount} bài
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/15">
                      <span className="text-[#5E6D62] block">Đã phân tích AI</span>
                      <span className="font-bold text-sm text-emerald-700">
                        {camp.analyzedCount} bài
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/15">
                      <span className="text-[#5E6D62] block">Tương tác tối thiểu</span>
                      <span className="font-bold text-sm text-[#84A282]">
                        ≥ {camp.minEngagement} tương tác
                      </span>
                    </div>
                  </div>

                  {/* Keywords Preview */}
                  {camp.mainKeywords && camp.mainKeywords.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[#5E6D62] font-semibold">Từ khóa:</span>
                      {camp.mainKeywords.map((kw, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-[#F6E2E9] text-[#222B24] text-[11px] font-medium"
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {camp.errorMessage && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{camp.errorMessage}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {showCreateModal && (
        <CampaignModal
          categories={categories}
          onClose={() => setShowCreateModal(false)}
          onCampaignCreated={fetchData}
        />
      )}

      {showCrawler && (
        <CrawlerModal
          onClose={() => setShowCrawler(false)}
          onCrawlComplete={fetchData}
        />
      )}
    </div>
  );
}
