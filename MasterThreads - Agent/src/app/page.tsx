'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import { PostDetailModal } from '@/components/PostDetailModal';
import { AddPostModal } from '@/components/AddPostModal';
import { CrawlerModal } from '@/components/CrawlerModal';
import {
  FileText,
  Sparkles,
  Target,
  Flame,
  Radio,
  Package,
  TrendingUp,
  ArrowRight,
  ExternalLink,
  Bookmark,
  Database,
  BarChart3,
  Layers,
  HelpCircle,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [showAddPost, setShowAddPost] = useState(false);
  const [showCrawler, setShowCrawler] = useState(false);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/overview');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const kpis = data?.kpis || {
    totalPosts: 0,
    totalAnalyzed: 0,
    postsWithMatch: 0,
    highOpportunityPosts: 0,
    completedCampaigns: 0,
    activeProducts: 0,
  };

  const charts = data?.charts || {
    viralDistribution: [],
    opportunityDistribution: [],
    categoryPerformance: [],
    topTopics: [],
  };

  const recentOpportunities = data?.recentOpportunities || [];
  const isEmpty = kpis.totalPosts === 0 && kpis.activeProducts === 0;

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Tổng quan hệ thống"
          subtitle="Giám sát chuyển đổi Threads & đối chiếu cơ hội affiliate tự nhiên"
          onOpenAddPost={() => setShowAddPost(true)}
          onOpenCrawler={() => setShowCrawler(true)}
          onDataMutated={fetchOverview}
        />

        <main className="p-6 md:p-8 space-y-8 flex-1 max-w-7xl w-full mx-auto">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-[#5E6D62] uppercase tracking-wider">
                Bài viết đã quét
              </span>
              <div className="text-2xl font-black text-[#222B24] my-1">
                {kpis.totalPosts}
              </div>
              <span className="text-[11px] text-[#5E6D62] flex items-center gap-1">
                <FileText className="w-3 h-3 text-[#84A282]" /> Tổng thu thập
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-[#5E6D62] uppercase tracking-wider">
                Đã phân tích AI
              </span>
              <div className="text-2xl font-black text-[#222B24] my-1">
                {kpis.totalAnalyzed}
              </div>
              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {kpis.totalPosts > 0
                  ? `${Math.round((kpis.totalAnalyzed / kpis.totalPosts) * 100)}% hoàn thành`
                  : '0%'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-[#5E6D62] uppercase tracking-wider">
                Có sản phẩm khớp
              </span>
              <div className="text-2xl font-black text-[#84A282] my-1">
                {kpis.postsWithMatch}
              </div>
              <span className="text-[11px] text-[#5E6D62] flex items-center gap-1">
                <Target className="w-3 h-3 text-[#84A282]" /> Cơ hội tiềm năng
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-[#5E6D62] uppercase tracking-wider">
                Cơ hội cao (≥75)
              </span>
              <div className="text-2xl font-black text-emerald-700 my-1">
                {kpis.highOpportunityPosts}
              </div>
              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-500" /> Ưu tiên khai thác
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-[#5E6D62] uppercase tracking-wider">
                Chiến dịch quét
              </span>
              <div className="text-2xl font-black text-[#222B24] my-1">
                {kpis.completedCampaigns}
              </div>
              <span className="text-[11px] text-[#5E6D62] flex items-center gap-1">
                <Radio className="w-3 h-3 text-[#84A282]" /> Đã hoàn thành
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-[#5E6D62] uppercase tracking-wider">
                Sản phẩm hoạt động
              </span>
              <div className="text-2xl font-black text-[#222B24] my-1">
                {kpis.activeProducts}
              </div>
              <span className="text-[11px] text-[#5E6D62] flex items-center gap-1">
                <Package className="w-3 h-3 text-[#84A282]" /> Sẵn sàng matching
              </span>
            </div>
          </div>

          {/* Empty State Banner if no data */}
          {isEmpty && (
            <div className="p-8 rounded-2xl bg-white border-2 border-dashed border-[#84A282]/40 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#F6E2E9] text-[#84A282] flex items-center justify-center mx-auto shadow-xs">
                <Database className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="font-bold text-base text-[#222B24]">
                  Chưa có dữ liệu bài viết hoặc sản phẩm
                </h3>
                <p className="text-xs text-[#5E6D62] mt-1">
                  Hệ thống không hiển thị số liệu giả. Bạn có thể nạp ngay bộ dữ liệu mẫu (Sample Dataset) với các bài viết Threads thực tế và kịch bản affiliate sinh viên, hoặc tự thêm sản phẩm của riêng bạn.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={async () => {
                    const res = await fetch('/api/demo/seed', { method: 'POST' });
                    if (res.ok) window.location.reload();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#84A282] text-white text-xs font-bold hover:bg-[#6d8b6b] transition-all shadow-sm cursor-pointer flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  <span>Tải ngay bộ dữ liệu mẫu</span>
                </button>
                <Link
                  href="/products"
                  className="px-4 py-2.5 rounded-xl bg-white border border-[#84A282]/40 text-[#222B24] text-xs font-semibold hover:bg-gray-50 transition-all"
                >
                  Thêm sản phẩm mới
                </Link>
              </div>
            </div>
          )}

          {/* Charts Row */}
          {!isEmpty && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Viral Score vs Opportunity Score Distribution */}
              <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-[#84A282]" />
                      Phân bố điểm Opportunity vs Viral
                    </h3>
                    <p className="text-xs text-[#5E6D62] mt-0.5">
                      Đối chiếu mức độ lan truyền và tính khả thi affiliate
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="text-xs font-semibold text-[#5E6D62] uppercase">
                    Phân bố Opportunity Score (Khả năng chuyển đổi)
                  </div>
                  {charts.opportunityDistribution?.map((bin: any, i: number) => {
                    const maxVal = Math.max(
                      1,
                      ...charts.opportunityDistribution.map((b: any) => b.count)
                    );
                    const pct = Math.round((bin.count / maxVal) * 100);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#222B24] font-medium">
                            {bin.range} ({bin.label})
                          </span>
                          <span className="font-bold text-[#84A282]">
                            {bin.count} bài
                          </span>
                        </div>
                        <div className="w-full bg-[#FEFAF3] rounded-full h-2.5 border border-[#84A282]/15 overflow-hidden">
                          <div
                            className="bg-[#84A282] h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Performance & Emerging Topics */}
              <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-5">
                <div>
                  <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#84A282]" />
                    Hiệu suất theo Danh mục sản phẩm
                  </h3>
                  <p className="text-xs text-[#5E6D62] mt-0.5">
                    Số bài viết phù hợp được phát hiện cho từng danh mục
                  </p>
                </div>

                <div className="space-y-3">
                  {charts.categoryPerformance?.length === 0 ? (
                    <p className="text-xs text-[#5E6D62] italic">
                      Chưa có dữ liệu danh mục.
                    </p>
                  ) : (
                    charts.categoryPerformance?.map((cat: any, i: number) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-[#FEFAF3] border border-[#84A282]/15 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-xs font-bold text-[#222B24]">
                            {cat.name}
                          </span>
                          <span className="text-[11px] text-[#5E6D62]">
                            ({cat.productCount} sản phẩm)
                          </span>
                        </div>
                        <span className="text-xs font-black text-[#84A282] bg-white px-2.5 py-1 rounded-lg border border-[#84A282]/20">
                          {cat.matchCount} bài phù hợp
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Topics Cloud */}
                <div className="pt-2 border-t border-[#84A282]/15">
                  <span className="text-xs font-bold text-[#5E6D62] uppercase block mb-2">
                    Chủ đề thảo luận nổi bật từ Threads
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {charts.topTopics?.map((t: any, idx: number) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg text-xs bg-[#F6E2E9] text-[#222B24] font-medium border border-[#84A282]/20"
                      >
                        #{t.topic} ({t.count})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section: Cơ hội Affiliate Mới Nhất */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-[#222B24] flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  Cơ hội affiliate mới nhất
                </h3>
                <p className="text-xs text-[#5E6D62]">
                  Các bài viết vừa được AI phân tích có điểm cơ hội cao
                </p>
              </div>

              <Link
                href="/opportunities"
                className="text-xs font-bold text-[#84A282] hover:underline flex items-center gap-1"
              >
                Xem toàn bộ bài viết <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentOpportunities.length === 0 ? (
              <div className="p-6 text-center bg-white rounded-2xl border border-[#84A282]/20 text-xs text-[#5E6D62]">
                Chưa có cơ hội affiliate nào. Hãy thêm bài viết Threads hoặc nạp dữ liệu mẫu để bắt đầu.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentOpportunities.map((post: any) => (
                  <div
                    key={post.id}
                    className="p-4 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs flex flex-col justify-between hover:shadow-md transition-all space-y-3"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-[#222B24]">
                          @{post.authorUsername}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#B8CFB3] text-[#222B24]">
                            Opp: {post.opportunityScore}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800">
                            Viral: {post.viralScore}
                          </span>
                        </div>
                      </div>

                      {/* Content Snippet */}
                      <p className="text-xs text-[#222B24] line-clamp-3 leading-relaxed mb-3">
                        {post.content}
                      </p>

                      {/* Matched Product Category from Crawler */}
                      {post.userNotes && post.userNotes.includes('Phù hợp danh mục') && (
                        <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 font-medium mb-2.5 line-clamp-2">
                          {post.userNotes}
                        </div>
                      )}

                      {/* Matched Product Box */}
                      {post.topMatch && (
                        <div className="p-2.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/20 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#222B24] line-clamp-1">
                              {post.topMatch.productName}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#84A282] text-white font-medium">
                              {post.topMatch.categoryName}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#5E6D62] line-clamp-2 italic">
                            💡 {post.topMatch.affiliateAngle}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-2 border-t border-[#84A282]/15 flex items-center justify-between text-xs">
                      <a
                        href={post.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#5E6D62] hover:text-[#222B24] flex items-center gap-1 text-[11px]"
                      >
                        Bài gốc <ExternalLink className="w-3 h-3" />
                      </a>

                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/posts/${post.id}`);
                          const json = await res.json();
                          if (json.success) setSelectedPost(json.data);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#84A282] text-white font-bold hover:bg-[#6d8b6b] transition-all cursor-pointer text-xs"
                      >
                        Chi tiết phân tích
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onPostUpdated={fetchOverview}
        />
      )}

      {/* Add Post Modal */}
      {showAddPost && (
        <AddPostModal
          onClose={() => setShowAddPost(false)}
          onPostAdded={fetchOverview}
        />
      )}

      {/* Auto Crawler Modal */}
      {showCrawler && (
        <CrawlerModal
          onClose={() => setShowCrawler(false)}
          onCrawlComplete={fetchOverview}
        />
      )}
    </div>
  );
}
