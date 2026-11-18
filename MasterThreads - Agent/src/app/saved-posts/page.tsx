'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import { PostDetailModal } from '@/components/PostDetailModal';
import {
  Bookmark,
  ExternalLink,
  Flame,
  Target,
  Sparkles,
  Edit3,
  Trash2,
  Package,
  RefreshCw,
} from 'lucide-react';
import { ThreadsPostDTO } from '@/types';

export default function SavedPostsPage() {
  const [posts, setPosts] = useState<ThreadsPostDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ThreadsPostDTO | null>(null);

  const fetchSavedPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/posts?isSaved=true');
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedPosts();
  }, []);

  const handleUnsave = async (id: string) => {
    try {
      await fetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSaved: false }),
      });
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  };

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Bài viết đã lưu"
          subtitle="Danh sách các bài viết tiềm năng bạn đã bookmark để theo dõi và triển khai kịch bản affiliate"
          onDataMutated={fetchSavedPosts}
        />

        <main className="p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#222B24]">
                Bài viết đã bookmark ({posts.length})
              </h2>
              <p className="text-xs text-[#5E6D62]">
                Lưu trữ ghi chú cá nhân và theo dõi đơn hàng thực tế phát sinh
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-[#5E6D62]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#84A282]" />
              Đang tải danh sách bài viết đã lưu...
            </div>
          ) : posts.length === 0 ? (
            <div className="p-12 rounded-2xl bg-white border border-[#84A282]/20 text-center space-y-3">
              <Bookmark className="w-10 h-10 text-[#5E6D62] mx-auto opacity-40" />
              <h3 className="font-bold text-sm text-[#222B24]">
                Chưa có bài viết nào được lưu
              </h3>
              <p className="text-xs text-[#5E6D62] max-w-sm mx-auto">
                Khi duyệt danh sách "Bài viết tiềm năng", hãy nhấn vào biểu tượng Bookmark để lưu bài viết vào đây.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => {
                const topMatch = post.productMatches?.[0];
                return (
                  <div
                    key={post.id}
                    className="p-5 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs space-y-3 hover:shadow-md transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#84A282]/15 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#222B24]">
                          @{post.authorUsername}
                        </span>
                        <span className="text-xs text-[#5E6D62]">
                          • {new Date(post.publishedAt).toLocaleDateString('vi-VN')}
                        </span>
                        <a
                          href={post.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#84A282] hover:underline flex items-center gap-1 font-medium ml-2"
                        >
                          Mở Threads <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#B8CFB3] text-[#222B24]">
                          Opp: {post.maxOpportunityScore}/100
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-800">
                          Viral: {post.viralScore}/100
                        </span>

                        <button
                          onClick={() => handleUnsave(post.id)}
                          className="p-1.5 rounded-lg text-[#5E6D62] hover:text-rose-600 transition-all cursor-pointer"
                          title="Bỏ lưu"
                        >
                          <Bookmark className="w-4 h-4 fill-current text-[#84A282]" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#222B24] leading-relaxed whitespace-pre-line">
                      {post.content}
                    </p>

                    {topMatch && (
                      <div className="p-3 rounded-xl bg-[#FEFAF3] border border-[#84A282]/20 text-xs text-[#222B24] flex items-center justify-between">
                        <div>
                          <strong>Sản phẩm gợi ý:</strong> {topMatch.product?.name} ({topMatch.product?.category?.name})
                          <p className="text-[#84A282] text-[11px] mt-0.5">
                            Góc khai thác: {topMatch.affiliateAngle}
                          </p>
                        </div>
                      </div>
                    )}

                    {post.userNotes && (
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-950">
                        <strong>Ghi chú cá nhân:</strong> {post.userNotes}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => setSelectedPost(post)}
                        className="px-4 py-1.5 rounded-xl bg-[#84A282] text-white text-xs font-bold hover:bg-[#6d8b6b] transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Xem chi tiết & Cập nhật ghi chú</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onPostUpdated={fetchSavedPosts}
        />
      )}
    </div>
  );
}
