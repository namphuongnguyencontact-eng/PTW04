'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import { PostDetailModal } from '@/components/PostDetailModal';
import { AddPostModal } from '@/components/AddPostModal';
import { CrawlerModal } from '@/components/CrawlerModal';
import {
  Flame,
  Target,
  Sparkles,
  Search,
  Filter,
  ExternalLink,
  Bookmark,
  ThumbsUp,
  MessageSquare,
  Repeat,
  Package,
  Layers,
  CheckCircle,
  EyeOff,
  RefreshCw,
  Plus,
  Tag,
} from 'lucide-react';
import { ThreadsPostDTO, CategoryDTO, ProductDTO } from '@/types';

export default function OpportunitiesPage() {
  const [posts, setPosts] = useState<ThreadsPostDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [minViralScore, setMinViralScore] = useState<number>(0);
  const [minOpportunityScore, setMinOpportunityScore] = useState<number>(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [sort, setSort] = useState('opportunity_desc');
  const [filterSavedOnly, setFilterSavedOnly] = useState(false);

  // Modals
  const [selectedPost, setSelectedPost] = useState<ThreadsPostDTO | null>(null);
  const [showAddPost, setShowAddPost] = useState(false);
  const [showCrawler, setShowCrawler] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (minViralScore > 0) params.set('minViralScore', String(minViralScore));
      if (minOpportunityScore > 0)
        params.set('minOpportunityScore', String(minOpportunityScore));
      if (selectedCategoryId) params.set('categoryId', selectedCategoryId);
      if (selectedProductId) params.set('productId', selectedProductId);
      if (filterSavedOnly) params.set('isSaved', 'true');
      if (sort) params.set('sort', sort);

      const [postsRes, catRes, prodRes] = await Promise.all([
        fetch(`/api/posts?${params.toString()}`),
        fetch('/api/categories'),
        fetch('/api/products'),
      ]);

      const [postsJson, catJson, prodJson] = await Promise.all([
        postsRes.json(),
        catRes.json(),
        prodRes.json(),
      ]);

      if (postsJson.success) setPosts(postsJson.data);
      if (catJson.success) setCategories(catJson.data);
      if (prodJson.success) setProducts(prodJson.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [
    minViralScore,
    minOpportunityScore,
    selectedCategoryId,
    selectedProductId,
    sort,
    filterSavedOnly,
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleToggleSaved = async (post: ThreadsPostDTO) => {
    try {
      const nextSaved = !post.isSaved;
      await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSaved: nextSaved }),
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, isSaved: nextSaved } : p))
      );
    } catch {}
  };

  const handleDismiss = async (post: ThreadsPostDTO) => {
    if (!confirm('Bạn có muốn ẩn bài viết này khỏi danh sách tiềm năng?')) return;
    try {
      await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDismissed: true }),
      });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch {}
  };

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Bài viết tiềm năng"
          subtitle="Khám phá các bài viết Threads viral và cơ hội affiliate đối chiếu tự nhiên"
          onOpenAddPost={() => setShowAddPost(true)}
          onOpenCrawler={() => setShowCrawler(true)}
          onDataMutated={fetchData}
        />

        <main className="p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Filter Bar */}
          <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-3">
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col md:flex-row gap-3 items-stretch md:items-center"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-[#5E6D62]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm nội dung bài viết, username tác giả..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Category Filter */}
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                >
                  <option value="">Tất cả danh mục</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Product Filter */}
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                >
                  <option value="">Tất cả sản phẩm</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {/* Sort Filter */}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] font-semibold focus:outline-none"
                >
                  <option value="opportunity_desc">Cơ hội cao nhất</option>
                  <option value="viral_desc">Viral Score cao nhất</option>
                  <option value="engagement_desc">Tương tác nhiều nhất</option>
                  <option value="newest">Bài viết mới nhất</option>
                </select>

                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer"
                >
                  Tìm kiếm
                </button>
              </div>
            </form>

            {/* Range filters & toggle */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#84A282]/15 text-xs text-[#5E6D62]">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#222B24]">
                    Min Opportunity Score: {minOpportunityScore}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={minOpportunityScore}
                    onChange={(e) => setMinOpportunityScore(Number(e.target.value))}
                    className="w-24 accent-[#84A282]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#222B24]">
                    Min Viral Score: {minViralScore}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={minViralScore}
                    onChange={(e) => setMinViralScore(Number(e.target.value))}
                    className="w-24 accent-[#84A282]"
                  />
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-[#222B24] font-medium">
                  <input
                    type="checkbox"
                    checked={filterSavedOnly}
                    onChange={(e) => setFilterSavedOnly(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#84A282]"
                  />
                  <span>Chỉ bài đã lưu</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#222B24]">
                  Tìm thấy: {posts.length} bài viết
                </span>
                <button
                  onClick={fetchData}
                  className="p-1 rounded-lg text-[#5E6D62] hover:bg-[#F6E2E9] transition-all"
                  title="Tải lại"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Posts List */}
          {loading ? (
            <div className="p-12 text-center text-xs text-[#5E6D62]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#84A282]" />
              Đang tải danh sách bài viết tiềm năng...
            </div>
          ) : posts.length === 0 ? (
            <div className="p-12 rounded-2xl bg-white border border-[#84A282]/20 text-center space-y-3">
              <Package className="w-10 h-10 text-[#5E6D62] mx-auto opacity-40" />
              <h3 className="font-bold text-sm text-[#222B24]">
                Không tìm thấy bài viết nào phù hợp với bộ lọc
              </h3>
              <p className="text-xs text-[#5E6D62] max-w-sm mx-auto">
                Hãy thử giảm ngưỡng điểm hoặc nạp thêm bài viết mới từ Threads.
              </p>
              <button
                onClick={() => setShowAddPost(true)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer inline-flex items-center gap-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm bài viết mới
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => {
                const topMatch = post.productMatches?.[0];
                return (
                  <div
                    key={post.id}
                    className="p-5 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs hover:shadow-md transition-all space-y-4"
                  >
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#84A282]/15 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full bg-[#84A282] text-white flex items-center justify-center text-xs font-bold">
                          @{post.authorUsername.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#222B24]">
                              @{post.authorUsername}
                            </span>
                            <span className="text-[11px] text-[#5E6D62]">
                              •{' '}
                              {new Date(post.publishedAt).toLocaleDateString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-[#84A282] hover:underline flex items-center gap-1 font-medium"
                          >
                            Xem bài gốc Threads <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      {/* Score Badges */}
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#5E6D62]">
                            Viral Score:
                          </span>
                          <span className="font-black text-sm text-orange-600 flex items-center gap-0.5">
                            <Flame className="w-3.5 h-3.5 fill-current" />
                            {post.viralScore}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 font-bold">
                            {post.viralClassification === 'VIRAL_SUPERIOR'
                              ? 'Viral'
                              : post.viralClassification === 'HIGH_ENGAGEMENT'
                              ? 'Cao'
                              : 'Tăng trưởng'}
                          </span>
                        </div>

                        <div className="px-3 py-1.5 rounded-xl bg-[#B8CFB3]/25 border border-[#84A282]/40 flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#5E6D62]">
                            Opportunity:
                          </span>
                          <span className="font-black text-sm text-[#84A282] flex items-center gap-0.5">
                            <Target className="w-3.5 h-3.5" />
                            {post.maxOpportunityScore}
                          </span>
                        </div>

                        <button
                          onClick={() => handleToggleSaved(post)}
                          className={`p-2 rounded-xl border transition-all cursor-pointer ${
                            post.isSaved
                              ? 'bg-[#84A282] text-white border-[#84A282]'
                              : 'bg-white text-[#5E6D62] border-[#84A282]/30 hover:text-[#84A282]'
                          }`}
                          title={post.isSaved ? 'Đã lưu' : 'Lưu bài viết'}
                        >
                          <Bookmark className="w-4 h-4 fill-current" />
                        </button>

                        <button
                          onClick={() => handleDismiss(post)}
                          className="p-2 rounded-xl text-[#5E6D62] hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                          title="Ẩn bài viết"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Post Excerpt & Metrics */}
                    <div className="space-y-2">
                      <p className="text-xs text-[#222B24] leading-relaxed whitespace-pre-line">
                        {post.content}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-[#5E6D62] pt-1">
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="w-3.5 h-3.5 text-blue-500" />
                          {post.likesCount.toLocaleString()} thích
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          {post.repliesCount} trả lời
                        </span>
                        <span className="flex items-center gap-1">
                          <Repeat className="w-3.5 h-3.5 text-purple-600" />
                          {post.repostsCount} đăng lại
                        </span>
                        {post.campaign && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#F6E2E9] text-[#222B24]">
                            Chiến dịch: {post.campaign.name}
                          </span>
                        )}
                      </div>

                      {/* Matched Product Category from Crawler */}
                      {post.userNotes && post.userNotes.includes('Phù hợp danh mục') && (
                        <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5 shadow-2xs">
                          <Tag className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="whitespace-pre-line leading-relaxed font-medium">
                            {post.userNotes}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Matched Products and AI Insight */}
                    {topMatch ? (
                      <div className="p-3.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/20 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#222B24]">
                              🎯 Gợi ý sản phẩm: {topMatch.product?.name}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#84A282] text-white font-medium">
                              {topMatch.product?.category?.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-[#84A282]">
                              Điểm phù hợp: {topMatch.opportunityScore}/100
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">
                              {topMatch.matchType === 'DIRECT_FIT'
                                ? 'Phù hợp trực tiếp'
                                : 'Theo ngữ cảnh'}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs space-y-1 text-[#222B24]">
                          <p>
                            <strong>Insight & Lý do:</strong> {topMatch.reason}
                          </p>
                          <p className="text-[#84A282] italic">
                            💡 <strong>Góc tiếp cận:</strong> {topMatch.affiliateAngle}
                          </p>
                        </div>

                        {post.productMatches && post.productMatches.length > 1 && (
                          <div className="pt-2 border-t border-[#84A282]/10 flex items-center gap-2 text-[11px] text-[#5E6D62]">
                            <span>Sản phẩm phù hợp khác:</span>
                            {post.productMatches.slice(1, 4).map((m, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-white border border-[#84A282]/20 font-medium text-[#222B24]"
                              >
                                {m.product?.name} ({m.opportunityScore})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-[#FEFAF3] border border-[#84A282]/20 text-xs text-[#5E6D62] italic">
                        Chưa tìm thấy sản phẩm đối chiếu trực tiếp. Nhấn "Xem phân tích chi tiết" để xem toàn bộ insight ngữ nghĩa.
                      </div>
                    )}

                    {/* Footer CTA */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-[#5E6D62]">
                        Nguồn: {post.source === 'DEMO_SEED' ? 'Dữ liệu mẫu' : 'Threads'}
                      </span>

                      <div className="flex items-center gap-2">
                        {topMatch?.product?.affiliateUrl && (
                          <a
                            href={topMatch.product.affiliateUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-1.5 rounded-xl bg-[#FEFAF3] border border-[#84A282]/40 text-[#84A282] text-xs font-bold hover:bg-[#84A282]/10 transition-all flex items-center gap-1"
                          >
                            Link Affiliate <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        <button
                          onClick={() => setSelectedPost(post)}
                          className="px-4 py-1.5 rounded-xl bg-[#84A282] text-white text-xs font-bold hover:bg-[#6d8b6b] transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Xem phân tích chi tiết (5 Tabs)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onPostUpdated={fetchData}
        />
      )}

      {/* Add Post Modal */}
      {showAddPost && (
        <AddPostModal
          onClose={() => setShowAddPost(false)}
          onPostAdded={fetchData}
        />
      )}

      {/* Auto Crawler Modal */}
      {showCrawler && (
        <CrawlerModal
          onClose={() => setShowCrawler(false)}
          onCrawlComplete={fetchData}
        />
      )}
    </div>
  );
}
