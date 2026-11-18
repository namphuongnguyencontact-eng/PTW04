'use client';

import React, { useState } from 'react';
import { X, Plus, Sparkles, Link as LinkIcon, MessageSquare, Loader2, DownloadCloud, FileText } from 'lucide-react';

interface AddPostModalProps {
  onClose: () => void;
  onPostAdded: () => void;
}

export function AddPostModal({ onClose, onPostAdded }: AddPostModalProps) {
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [authorUsername, setAuthorUsername] = useState('');
  const [likesCount, setLikesCount] = useState<number>(100);
  const [repliesCount, setRepliesCount] = useState<number>(20);
  const [repostsCount, setRepostsCount] = useState<number>(5);
  const [commentsInput, setCommentsInput] = useState('');
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAutoFetch = async () => {
    if (!url.trim()) {
      setError('Vui lòng nhập URL Threads (threads.com hoặc threads.net) trước khi quét.');
      return;
    }

    setFetchingData(true);
    setError(null);
    setFetchSuccess(null);

    try {
      const res = await fetch('/api/crawler/scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Không thể quét bài viết từ URL này.');
      }

      const d = json.data;
      if (d.content) setContent(d.content);
      if (d.username) setAuthorUsername(d.username);
      if (d.likeCount !== undefined) setLikesCount(d.likeCount);
      if (d.replyCount !== undefined) setRepliesCount(d.replyCount);
      if (d.repostCount !== undefined) setRepostsCount(d.repostCount);

      if (d.comments && d.comments.length > 0) {
        const formatted = d.comments
          .map((c: any) => `@${c.authorUsername}: ${c.content}`)
          .join('\n');
        setCommentsInput(formatted);
      }

      setFetchSuccess(
        `✓ Đã trích xuất thành công bài viết của @${d.username} (${d.likeCount} likes, ${d.replyCount} replies, ${d.comments?.length || 0} bình luận)!`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetchingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !url.trim()) {
      setError('Vui lòng nhập nội dung bài viết hoặc URL Threads.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Parse optional comments
      const parsedComments = commentsInput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          if (line.includes(':')) {
            const [author, text] = line.split(/:(.+)/);
            return {
              authorUsername: author.trim().replace(/^@/, '') || 'user',
              content: text.trim(),
              likesCount: 5,
            };
          }
          return {
            authorUsername: 'threads.commenter',
            content: line,
            likesCount: 2,
          };
        });

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim() || undefined,
          content: content.trim(),
          authorUsername: authorUsername.trim() || undefined,
          likesCount: Number(likesCount) || 0,
          repliesCount: Number(repliesCount) || 0,
          repostsCount: Number(repostsCount) || 0,
          autoAnalyze,
          comments: parsedComments.length > 0 ? parsedComments : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi thêm bài viết');
      }

      onPostAdded();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FEFAF3] rounded-2xl border border-[#84A282]/30 w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-[#84A282]/20 flex items-center justify-between bg-[#F6E2E9]/60">
          <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#84A282]" />
            Thêm bài viết Threads để phân tích
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5E6D62] hover:bg-[#F6E2E9] transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}

          {fetchSuccess && (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {fetchSuccess}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              URL bài viết Threads (Tự động trích xuất bài thật)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#5E6D62]" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.threads.com/@user/post/... hoặc threads.net"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
                />
              </div>
              <button
                type="button"
                onClick={handleAutoFetch}
                disabled={fetchingData || !url.trim()}
                className="px-3 py-2 rounded-xl bg-[#84A282] hover:bg-[#728f70] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {fetchingData ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang quét...
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-3.5 h-3.5" />
                    Quét từ link
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-[#5E6D62] mt-1">
              * Dán link bài viết thật từ Threads và nhấn "Quét từ link" để tự động điền nội dung, chỉ số tương tác và bình luận.
            </p>
            {url.trim() && (
              <div className="mt-2 flex items-center gap-2">
                <a
                  href={`/api/export/docx?url=${encodeURIComponent(url.trim())}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#222B24] hover:bg-[#344437] text-white text-[11px] font-semibold transition-all shadow-xs"
                  download
                  title="Tự động quét và tải ngay file Word (.docx) của bài viết này"
                >
                  <FileText className="w-3.5 h-3.5 text-[#84A282]" />
                  <span>Xuất ngay ra file Word (.docx)</span>
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Username tác giả
              </label>
              <input
                type="text"
                value={authorUsername}
                onChange={(e) => setAuthorUsername(e.target.value)}
                placeholder="threads.user"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Lượt thích (Likes)
              </label>
              <input
                type="number"
                min="0"
                value={likesCount}
                onChange={(e) => setLikesCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Lượt trả lời (Replies)
              </label>
              <input
                type="number"
                min="0"
                value={repliesCount}
                onChange={(e) => setRepliesCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Lượt đăng lại (Reposts)
              </label>
              <input
                type="number"
                min="0"
                value={repostsCount}
                onChange={(e) => setRepostsCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Nội dung bài viết Threads
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nội dung bài viết Threads..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Bình luận thảo luận (Mỗi dòng một bình luận: @user: Nội dung)
            </label>
            <textarea
              rows={3}
              value={commentsInput}
              onChange={(e) => setCommentsInput(e.target.value)}
              placeholder="@user1: Xin link mua với ạ&#10;@user2: Bàn nhỏ dùng loại này tiện không?"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282] font-mono text-[11px]"
            />
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#222B24]">
              <input
                type="checkbox"
                checked={autoAnalyze}
                onChange={(e) => setAutoAnalyze(e.target.checked)}
                className="rounded border-[#84A282] text-[#84A282] focus:ring-[#84A282] w-4 h-4"
              />
              <span className="font-medium flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#84A282]" />
                Tự động chạy AI phân tích chủ đề, nhu cầu & ghép sản phẩm sau khi lưu
              </span>
            </label>
          </div>

          <div className="pt-2 border-t border-[#84A282]/20 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-[#5E6D62] hover:bg-[#F6E2E9] rounded-xl transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold text-white bg-[#84A282] hover:bg-[#728f70] rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Lưu và phân tích'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
