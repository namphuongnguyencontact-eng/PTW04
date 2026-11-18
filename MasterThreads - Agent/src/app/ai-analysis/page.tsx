'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import {
  BrainCircuit,
  Sparkles,
  Play,
  Lightbulb,
  AlertTriangle,
  Target,
  Package,
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { CategoryDTO, ProductDTO } from '@/types';

export default function AIAnalysisPage() {
  const [content, setContent] = useState(
    'Bàn làm việc trong phòng trọ nhỏ chỉ tầm 60cm mà để cái laptop với đống dây sạc là hết chỗ, học bài cúi xuống nhìn màn hình được 1 tiếng là cổ vai gáy mỏi rã rời. Có tips nào setup bàn nhỏ gọn gàng và đỡ mỏi cổ không mọi người?'
  );
  const [commentsInput, setCommentsInput] = useState(
    '@lananh: Bạn mua cái giá đỡ laptop nâng cao lên ngang tầm mắt với bàn phím rời là hết mỏi ngay!\n@duytech: Mình dùng kệ 2 tầng để bàn học, xếp hết sách vở lên trên bàn rộng hẳn.'
  );
  const [authorUsername, setAuthorUsername] = useState('threads.creator');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [productsCount, setProductsCount] = useState(0);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProductsCount(d.data.length);
      })
      .catch(() => {});
  }, []);

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Vui lòng nhập nội dung bài viết.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);

    const parsedComments = commentsInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (l.includes(':')) {
          const [author, text] = l.split(/:(.+)/);
          return {
            authorUsername: author.trim().replace(/^@/, ''),
            content: text.trim(),
          };
        }
        return { authorUsername: 'user', content: l };
      });

    try {
      // Create or ingest post and analyze
      const ingestRes = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          authorUsername,
          autoAnalyze: true,
          comments: parsedComments,
          likesCount: 520,
          repliesCount: 68,
          repostsCount: 15,
        }),
      });

      const json = await ingestRes.json();
      if (!ingestRes.ok || !json.success) {
        throw new Error(json.error || 'Lỗi khi chạy phân tích AI');
      }

      setResult(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Phân tích AI trực tiếp (AI Playground)"
          subtitle="Trải nghiệm luồng phân tích ngôn ngữ tự nhiên và đối chiếu sản phẩm affiliate thời gian thực"
        />

        <main className="p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Input Form Column (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#84A282]/15 pb-3">
                  <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-[#84A282]" />
                    Dữ liệu đầu vào phân tích
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#B8CFB3]/30 font-semibold text-[#222B24]">
                    Kho: {productsCount} sản phẩm
                  </span>
                </div>

                <form onSubmit={handleRunAnalysis} className="space-y-4">
                  {error && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                      Username tác giả Threads
                    </label>
                    <input
                      type="text"
                      value={authorUsername}
                      onChange={(e) => setAuthorUsername(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                      Nội dung bài viết Threads *
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Dán nội dung bài viết cần phân tích..."
                      className="w-full p-3 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                      Nội dung bình luận công khai (mỗi dòng 1 comment)
                    </label>
                    <textarea
                      rows={3}
                      value={commentsInput}
                      onChange={(e) => setCommentsInput(e.target.value)}
                      placeholder="@user1: Cho mình xin link với..."
                      className="w-full p-2.5 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                    />
                    <p className="text-[11px] text-[#5E6D62] mt-1">
                      Hệ thống tuân thủ nguyên tắc: chỉ phân tích bình luận có thật, không tự bịa bình luận.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={analyzing}
                    className="w-full py-2.5 rounded-xl bg-[#84A282] text-white text-xs font-bold hover:bg-[#6d8b6b] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {analyzing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>AI đang phân tích & đối chiếu...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Chạy phân tích AI ngay</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Results Column (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              {!result && !analyzing && (
                <div className="p-12 text-center bg-white rounded-2xl border border-[#84A282]/20 space-y-3">
                  <BrainCircuit className="w-12 h-12 text-[#84A282] mx-auto opacity-40" />
                  <h3 className="font-bold text-sm text-[#222B24]">
                    Chưa có kết quả phân tích
                  </h3>
                  <p className="text-xs text-[#5E6D62] max-w-sm mx-auto">
                    Nhập nội dung bài viết Threads bên trái và nhấn "Chạy phân tích AI ngay" để xem insight ngữ nghĩa và kết quả đối chiếu sản phẩm.
                  </p>
                </div>
              )}

              {analyzing && (
                <div className="p-12 text-center bg-white rounded-2xl border border-[#84A282]/20 space-y-3">
                  <Sparkles className="w-10 h-10 text-[#84A282] animate-bounce mx-auto" />
                  <h3 className="font-bold text-sm text-[#222B24]">
                    AI đang xử lý pipeline 6 bước...
                  </h3>
                  <div className="text-xs text-[#5E6D62] max-w-xs mx-auto space-y-1">
                    <p>• Trích xuất chủ đề & cảm xúc chủ đạo</p>
                    <p>• Bóc tách Pain Points & nhu cầu</p>
                    <p>• Quét bình luận & ý kiến phản đối</p>
                    <p>• Đối chiếu toàn bộ kho sản phẩm affiliate</p>
                    <p>• Tính toán Opportunity Score độc lập</p>
                  </div>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {/* Scores Bar */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                      <span className="text-[11px] font-bold text-[#5E6D62] uppercase">
                        Opportunity Score
                      </span>
                      <div className="text-2xl font-black text-[#84A282] mt-1">
                        {result.maxOpportunityScore}/100
                      </div>
                      <span className="text-[11px] text-[#5E6D62]">
                        {result.productMatches?.length || 0} sản phẩm phù hợp
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                      <span className="text-[11px] font-bold text-[#5E6D62] uppercase">
                        Viral Score
                      </span>
                      <div className="text-2xl font-black text-orange-600 mt-1">
                        {result.viralScore}/100
                      </div>
                      <span className="text-[11px] text-[#5E6D62]">
                        {result.viralClassification}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white border border-[#84A282]/20 shadow-xs">
                      <span className="text-[11px] font-bold text-[#5E6D62] uppercase">
                        Ý định bài viết
                      </span>
                      <div className="text-sm font-bold text-[#222B24] mt-2 capitalize">
                        {result.analysis?.postIntent}
                      </div>
                      <span className="text-[11px] text-emerald-700 font-medium">
                        Cảm xúc: {result.analysis?.dominantEmotion}
                      </span>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="p-4 rounded-xl bg-white border border-[#84A282]/20 space-y-2">
                    <span className="text-xs font-bold text-[#5E6D62] uppercase">
                      Tóm tắt nội dung AI
                    </span>
                    <p className="text-xs text-[#222B24] leading-relaxed">
                      {result.analysis?.postSummary}
                    </p>
                  </div>

                  {/* Matched Products */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-[#5E6D62] uppercase tracking-wider">
                      Kết quả đối chiếu sản phẩm phù hợp
                    </h4>

                    {(!result.productMatches || result.productMatches.length === 0) ? (
                      <div className="p-4 rounded-xl bg-white border border-[#84A282]/20 text-xs text-[#5E6D62] italic">
                        Chưa tìm thấy sản phẩm phù hợp trực tiếp trong kho sản phẩm của bạn. Hãy bổ sung sản phẩm thuộc các ngành liên quan.
                      </div>
                    ) : (
                      result.productMatches.map((m: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-white border border-[#84A282]/30 shadow-xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-[#222B24]">
                              {m.product?.name}
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-[#B8CFB3] text-[#222B24]">
                              Điểm: {m.opportunityScore}/100
                            </span>
                          </div>

                          <div className="text-xs space-y-1 text-[#222B24]">
                            <p>
                              <strong>Lý do phù hợp:</strong> {m.reason}
                            </p>
                            <p className="text-[#84A282] italic">
                              💡 <strong>Góc tiếp cận:</strong> {m.affiliateAngle}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-[#84A282]/10 flex items-center justify-between text-xs">
                            <span className="text-[#5E6D62]">
                              Loại: <strong>{m.matchType}</strong> • Ưu tiên: {m.priority}
                            </span>
                            {m.product?.affiliateUrl && (
                              <a
                                href={m.product.affiliateUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#84A282] font-semibold hover:underline flex items-center gap-1"
                              >
                                Link Affiliate <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
