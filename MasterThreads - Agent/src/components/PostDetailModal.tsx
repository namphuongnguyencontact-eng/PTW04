'use client';

import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Flame,
  Target,
  Sparkles,
  MessageSquare,
  Package,
  FileText,
  Bookmark,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Share2,
  ThumbsUp,
  Repeat,
  Quote,
  Eye,
  RefreshCw,
  DownloadCloud,
} from 'lucide-react';
import { ThreadsPostDTO } from '@/types';

interface PostDetailModalProps {
  post: ThreadsPostDTO | null;
  onClose: () => void;
  onPostUpdated: () => void;
}

export function PostDetailModal({ post, onClose, onPostUpdated }: PostDetailModalProps) {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'insights' | 'comments' | 'products' | 'notes'
  >('overview');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [userNotes, setUserNotes] = useState(post?.userNotes || '');
  const [userStatus, setUserStatus] = useState(post?.userStatus || 'NEW');
  const [actualConversionNotes, setActualConversionNotes] = useState(
    post?.actualConversionNotes || ''
  );
  const [isSaved, setIsSaved] = useState(post?.isSaved || false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  if (!post) return null;

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userNotes,
          userStatus,
          actualConversionNotes,
          isSaved,
        }),
      });
      if (res.ok) {
        onPostUpdated();
      }
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleToggleSaved = async () => {
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);
    try {
      await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSaved: nextSaved }),
      });
      onPostUpdated();
    } catch {}
  };

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/analyze`, { method: 'POST' });
      if (res.ok) {
        onPostUpdated();
      }
    } finally {
      setIsReanalyzing(false);
    }
  };

  const analysis = post.analysis;
  const productMatches = post.productMatches || [];
  const comments = post.comments || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FEFAF3] rounded-2xl border border-[#84A282]/30 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#84A282]/20 flex items-center justify-between bg-[#F6E2E9]/60">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#84A282] text-white flex items-center justify-center text-xs font-bold">
              @{post.authorUsername.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[#222B24]">
                  @{post.authorUsername}
                </span>
                <span className="text-[11px] text-[#5E6D62]">
                  {new Date(post.publishedAt).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <a
                href={post.postUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#84A282] hover:underline flex items-center gap-1 font-medium"
              >
                Mở bài viết gốc trên Threads <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`/api/export/docx?postId=${post.id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#222B24] text-white hover:bg-[#344437] transition-all cursor-pointer shadow-xs"
              title="Xuất bài viết và tất cả bình luận ra file Word (.docx)"
              download
            >
              <DownloadCloud className="w-3.5 h-3.5 text-[#84A282]" />
              <span>Xuất Word</span>
            </a>
            <button
              onClick={handleReanalyze}
              disabled={isReanalyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] hover:bg-[#B8CFB3]/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
              <span>{isReanalyzing ? 'Đang phân tích...' : 'Phân tích lại'}</span>
            </button>
            <button
              onClick={handleToggleSaved}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isSaved
                  ? 'bg-[#84A282] text-white border-[#84A282]'
                  : 'bg-white text-[#5E6D62] border-[#84A282]/30 hover:text-[#84A282]'
              }`}
              title={isSaved ? 'Đã lưu bài viết' : 'Lưu bài viết'}
            >
              <Bookmark className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[#5E6D62] hover:bg-[#F6E2E9] hover:text-[#222B24] transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation (5 Tabs as requested) */}
        <div className="flex border-b border-[#84A282]/20 px-5 bg-[#FEFAF3]">
          {[
            { id: 'overview', label: '1. Tổng quan', icon: Sparkles },
            { id: 'insights', label: '2. Phân tích Insight', icon: Lightbulb },
            { id: 'comments', label: '3. Bình luận', icon: MessageSquare },
            { id: 'products', label: '4. Sản phẩm phù hợp', icon: Package },
            { id: 'notes', label: '5. Ghi chú & Trạng thái', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? 'border-[#84A282] text-[#84A282] bg-[#B8CFB3]/10'
                    : 'border-transparent text-[#5E6D62] hover:text-[#222B24]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: TỔNG QUAN */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Metrics Header */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                  <div className="flex items-center justify-between text-[#5E6D62] text-xs">
                    <span>Viral Score</span>
                    <Flame className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="text-2xl font-black text-[#222B24] mt-1">
                    {post.viralScore}
                    <span className="text-xs font-normal text-[#5E6D62]">/100</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-block mt-1">
                    {post.viralClassification === 'VIRAL_SUPERIOR'
                      ? 'Viral nổi bật'
                      : post.viralClassification === 'HIGH_ENGAGEMENT'
                      ? 'Tương tác cao'
                      : post.viralClassification === 'GROWING'
                      ? 'Đang tăng trưởng'
                      : 'Tiềm năng'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                  <div className="flex items-center justify-between text-[#5E6D62] text-xs">
                    <span>Opportunity Score</span>
                    <Target className="w-4 h-4 text-[#84A282]" />
                  </div>
                  <div className="text-2xl font-black text-[#84A282] mt-1">
                    {post.maxOpportunityScore}
                    <span className="text-xs font-normal text-[#5E6D62]">/100</span>
                  </div>
                  <span className="text-[11px] font-semibold text-[#84A282] bg-[#B8CFB3]/20 px-2 py-0.5 rounded-md inline-block mt-1">
                    {productMatches.length} sản phẩm phù hợp
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                  <div className="flex items-center justify-between text-[#5E6D62] text-xs">
                    <span>Tổng tương tác</span>
                    <ThumbsUp className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-black text-[#222B24] mt-1">
                    {post.engagementCount.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#5E6D62] mt-1">
                    <span>❤️ {post.likesCount}</span>
                    <span>💬 {post.repliesCount}</span>
                    <span>🔄 {post.repostsCount}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                  <div className="flex items-center justify-between text-[#5E6D62] text-xs">
                    <span>Phù hợp Affiliate</span>
                    <Sparkles className="w-4 h-4 text-[#84A282]" />
                  </div>
                  <div className="text-sm font-bold text-[#222B24] mt-2">
                    {analysis?.affiliateSuitability === 'HIGH'
                      ? 'Rất tiềm năng'
                      : analysis?.affiliateSuitability === 'MEDIUM'
                      ? 'Trung bình'
                      : 'Ít tiềm năng'}
                  </div>
                  <span className="text-[11px] text-[#5E6D62]">
                    Ý định: {analysis?.postIntent || 'Chia sẻ'}
                  </span>
                </div>
              </div>

              {/* Original Post Content */}
              <div className="p-4 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider mb-2">
                  Nội dung bài viết Threads
                </h4>
                <p className="text-sm text-[#222B24] leading-relaxed whitespace-pre-line">
                  {post.content}
                </p>
                {post.viralExplanation && (
                  <p className="text-xs text-[#5E6D62] italic mt-3 pt-2.5 border-t border-[#84A282]/10">
                    💡 {post.viralExplanation}
                  </p>
                )}
              </div>

              {/* AI Summary & Topics */}
              {analysis && (
                <div className="p-4 rounded-xl bg-[#F6E2E9]/40 border border-[#84A282]/20">
                  <h4 className="text-xs font-bold text-[#222B24] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#84A282]" />
                    Tóm tắt & Chủ đề chính
                  </h4>
                  <p className="text-xs text-[#222B24] mb-3">{analysis.postSummary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.mainTopics?.map((topic, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#84A282] text-white"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Recommended Products Preview */}
              <div>
                <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider mb-3">
                  Sản phẩm đối chiếu hàng đầu
                </h4>
                {productMatches.length === 0 ? (
                  <p className="text-xs text-[#5E6D62] italic">
                    Chưa tìm thấy sản phẩm phù hợp trực tiếp trong danh mục của bạn.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {productMatches.slice(0, 2).map((m, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-white border border-[#84A282]/30 shadow-xs flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-[#222B24]">
                              {m.product?.name || 'Sản phẩm'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#B8CFB3] text-[#222B24]">
                              {m.opportunityScore}/100
                            </span>
                          </div>
                          <p className="text-xs text-[#5E6D62] mt-1 line-clamp-2">
                            {m.reason}
                          </p>
                        </div>
                        <div className="mt-3 pt-2 border-t border-[#84A282]/10 flex items-center justify-between text-xs">
                          <span className="text-[#84A282] font-semibold">
                            {m.matchType === 'DIRECT_FIT'
                              ? 'Phù hợp trực tiếp'
                              : 'Theo ngữ cảnh'}
                          </span>
                          {m.product?.affiliateUrl && (
                            <a
                              href={m.product.affiliateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#84A282] hover:underline flex items-center gap-1 font-semibold"
                            >
                              Link Affiliate <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PHÂN TÍCH INSIGHT */}
          {activeTab === 'insights' && (
            <div className="space-y-6">
              {/* Pain Points */}
              <div>
                <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Vấn đề được đề cập (Pain Points)
                </h4>
                {analysis?.painPoints && analysis.painPoints.length > 0 ? (
                  <div className="space-y-2.5">
                    {analysis.painPoints.map((point, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-[#222B24]">
                          <span>{point.description}</span>
                          <span className="text-[#84A282] font-medium">
                            Độ tin cậy: {Math.round(point.confidence * 100)}%
                          </span>
                        </div>
                        <p className="text-xs text-[#5E6D62] mt-1.5 bg-[#FEFAF3] p-2 rounded-lg border border-[#84A282]/10 italic">
                          "{point.evidence}"
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#5E6D62]">Không có vấn đề nổi bật.</p>
                )}
              </div>

              {/* Audience Needs */}
              <div>
                <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-[#84A282]" />
                  Nhu cầu người đọc (Audience Needs)
                </h4>
                {analysis?.audienceNeeds && analysis.audienceNeeds.length > 0 ? (
                  <div className="space-y-2.5">
                    {analysis.audienceNeeds.map((need, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-[#222B24]">
                          <span>{need.description}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#B8CFB3]/30 text-[#222B24]">
                            Nguồn: {need.evidence_source === 'post' ? 'Bài viết' : 'Bình luận'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#5E6D62]">Chưa ghi nhận nhu cầu cụ thể.</p>
                )}
              </div>

              {/* Emotion & Promotion Risk */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                  <span className="text-xs font-bold text-[#5E6D62] uppercase">
                    Cảm xúc chủ đạo
                  </span>
                  <p className="text-sm font-semibold text-[#222B24] mt-1 capitalize">
                    {analysis?.dominantEmotion || 'Trung lập'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                  <span className="text-xs font-bold text-[#5E6D62] uppercase">
                    Rủi ro quảng cáo gượng ép
                  </span>
                  <p className="text-xs text-[#222B24] mt-1">
                    {analysis?.forcedPromotionRisk || 'Cần dẫn dắt khéo léo theo trải nghiệm.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PHÂN TÍCH BÌNH LUẬN */}
          {activeTab === 'comments' && (
            <div className="space-y-6">
              {/* Comment analysis banner */}
              <div className="p-4 rounded-xl bg-[#F6E2E9]/50 border border-[#84A282]/20 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[#222B24]">
                    Trạng thái dữ liệu bình luận công khai
                  </h4>
                  <p className="text-xs text-[#5E6D62] mt-0.5">
                    {analysis?.commentInsightsAvailable
                      ? `Đã phân tích ${analysis.commentAnalyzedCount} bình luận công khai có thể truy cập hợp pháp.`
                      : 'Không có dữ liệu bình luận công khai để phân tích. Điểm số được tính toán trên bài viết mà không bịa số liệu.'}
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-[#84A282]/30 text-[#222B24]">
                  {comments.length} bình luận
                </span>
              </div>

              {/* Questions in comments */}
              {analysis?.commentQuestions && analysis.commentQuestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider mb-2">
                    Các câu hỏi / Nhu cầu tìm kiếm giải pháp từ người đọc
                  </h4>
                  <div className="space-y-2">
                    {analysis.commentQuestions.map((q, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-white border border-[#84A282]/20 text-xs text-[#222B24]"
                      >
                        ❓ {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Objections */}
              {analysis?.commentObjections && analysis.commentObjections.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider mb-2">
                    Ý kiến phản đối hoặc nghi ngờ
                  </h4>
                  <div className="space-y-2">
                    {analysis.commentObjections.map((obj, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-white border border-rose-200 text-xs text-rose-800"
                      >
                        ⚠️ {obj}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actual Comments List */}
              <div>
                <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider mb-3">
                  Danh sách bình luận đã ghi nhận
                </h4>
                {comments.length === 0 ? (
                  <p className="text-xs text-[#5E6D62] italic">
                    Chưa có bình luận nào được lưu cho bài viết này.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {comments.map((c, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs"
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-[#222B24]">
                            @{c.authorUsername}
                          </span>
                          <span className="text-[#5E6D62]">❤️ {c.likesCount}</span>
                        </div>
                        <p className="text-xs text-[#222B24]">{c.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: SẢN PHẨM PHÙ HỢP */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#5E6D62]">
                  Tìm thấy {productMatches.length} sản phẩm phù hợp từ kho sản phẩm của bạn.
                </span>
                <span className="text-xs text-[#84A282] font-semibold">
                  Sắp xếp theo Opportunity Score
                </span>
              </div>

              {productMatches.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-xl border border-[#84A282]/20">
                  <Package className="w-8 h-8 text-[#5E6D62] mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-[#222B24]">
                    Chưa tìm thấy sản phẩm phù hợp
                  </p>
                  <p className="text-xs text-[#5E6D62] mt-1">
                    Hãy thêm sản phẩm mới trong mục "Sản phẩm của tôi" với các từ khóa và vấn đề giải quyết tương ứng.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {productMatches.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-white border border-[#84A282]/30 shadow-xs space-y-3"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#84A282]/15 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-[#222B24]">
                              {m.product?.name}
                            </h4>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#B8CFB3]/40 text-[#222B24]">
                              {m.product?.category?.name}
                            </span>
                          </div>
                          <span className="text-xs text-[#5E6D62]">
                            Sàn: {m.product?.platform} • Độ tin cậy AI: {Math.round(m.confidence * 100)}%
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-[11px] font-semibold text-[#5E6D62] block">
                              Opportunity
                            </span>
                            <span className="text-lg font-black text-[#84A282]">
                              {m.opportunityScore}/100
                            </span>
                          </div>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                              m.priority === 'HIGH'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.priority === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            Ưu tiên: {m.priority === 'HIGH' ? 'Cao' : m.priority === 'MEDIUM' ? 'TB' : 'Thấp'}
                          </span>
                        </div>
                      </div>

                      {/* Criteria Score Breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 rounded-lg bg-[#FEFAF3] border border-[#84A282]/15">
                          <span className="text-[11px] text-[#5E6D62] block">Liên quan (35%)</span>
                          <span className="font-bold text-[#222B24]">{m.relevanceScore}/100</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#FEFAF3] border border-[#84A282]/15">
                          <span className="text-[11px] text-[#5E6D62] block">Giải quyết vấn đề (25%)</span>
                          <span className="font-bold text-[#222B24]">{m.problemFitScore}/100</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#FEFAF3] border border-[#84A282]/15">
                          <span className="text-[11px] text-[#5E6D62] block">Ngữ cảnh tự nhiên (20%)</span>
                          <span className="font-bold text-[#222B24]">{m.contextFitScore}/100</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#FEFAF3] border border-[#84A282]/15">
                          <span className="text-[11px] text-[#5E6D62] block">Bình luận (10%)</span>
                          <span className="font-bold text-[#222B24]">
                            {m.commentEvidenceScore !== null ? `${m.commentEvidenceScore}/100` : 'Không có dữ liệu'}
                          </span>
                        </div>
                      </div>

                      {/* Reason & Affiliate Angle */}
                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/60 text-[#222B24]">
                          <strong className="text-emerald-900 block mb-0.5">Lý do phù hợp:</strong>
                          {m.reason}
                        </div>
                        <div className="p-2.5 rounded-lg bg-[#B8CFB3]/20 border border-[#84A282]/20 text-[#222B24]">
                          <strong className="text-[#84A282] block mb-0.5">Góc tiếp cận affiliate tự nhiên:</strong>
                          {m.affiliateAngle}
                        </div>
                      </div>

                      {/* Evidence & Action */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#84A282]/10 text-xs">
                        <span className="text-[#5E6D62]">
                          Phân loại: <strong>{m.matchType}</strong>
                        </span>
                        {m.product?.affiliateUrl && (
                          <a
                            href={m.product.affiliateUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-[#84A282] text-white font-semibold hover:bg-[#6d8b6b] transition-all flex items-center gap-1.5"
                          >
                            Lấy Link Affiliate <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: GHI CHÚ & TRẠNG THÁI */}
          {activeTab === 'notes' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1.5">
                    Trạng thái nghiên cứu
                  </label>
                  <select
                    value={userStatus}
                    onChange={(e) => setUserStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                  >
                    <option value="NEW">Mới phát hiện (New)</option>
                    <option value="RESEARCHED">Đã nghiên cứu (Researched)</option>
                    <option value="EXPLOITED">Đã khai thác affiliate (Exploited)</option>
                    <option value="DISMISSED">Bỏ qua / Loại trừ (Dismissed)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleToggleSaved}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isSaved
                        ? 'bg-[#84A282] text-white border-[#84A282]'
                        : 'bg-white text-[#5E6D62] border-[#84A282]/30 hover:border-[#84A282]'
                    }`}
                  >
                    <Bookmark className="w-4 h-4 fill-current" />
                    <span>{isSaved ? 'Đã lưu vào danh sách tiềm năng' : 'Lưu bài viết này'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1.5">
                  Ghi chú cá nhân & Ý tưởng kịch bản
                </label>
                <textarea
                  rows={4}
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Ghi chú góc tiếp cận, comment mẫu, lịch đăng lại..."
                  className="w-full p-3 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1.5">
                  Kết quả thực tế / Ghi nhận chuyển đổi (Conversion Notes)
                </label>
                <textarea
                  rows={3}
                  value={actualConversionNotes}
                  onChange={(e) => setActualConversionNotes(e.target.value)}
                  placeholder="Ví dụ: Đã trả lời bình luận lúc 15h, có 42 clicks, 3 đơn hàng..."
                  className="w-full p-3 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingNotes ? 'Đang lưu...' : 'Lưu thông tin ghi chú'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
