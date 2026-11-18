'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import {
  Settings,
  BrainCircuit,
  Key,
  Sliders,
  Radio,
  CheckCircle2,
  AlertCircle,
  Database,
  Trash2,
  Save,
  RefreshCw,
  ShieldCheck,
  Info,
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'ai' | 'threads' | 'demo'>('ai');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  // AI settings
  const [aiProvider, setAiProvider] = useState('local');
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [aiModelName, setAiModelName] = useState('gemini-1.5-flash');
  const [maxBatchPosts, setMaxBatchPosts] = useState(20);
  const [maxComments, setMaxComments] = useState(15);
  const [analyzeComments, setAnalyzeComments] = useState(true);

  // Weights
  const [relevanceWeight, setRelevanceWeight] = useState(35);
  const [problemFitWeight, setProblemFitWeight] = useState(25);
  const [contextFitWeight, setContextFitWeight] = useState(20);
  const [commentWeight, setCommentWeight] = useState(10);
  const [confidenceWeight, setConfidenceWeight] = useState(10);

  // Threads API settings
  const [threadsToken, setThreadsToken] = useState('');
  const [threadsAppId, setThreadsAppId] = useState('');
  const [threadsUserId, setThreadsUserId] = useState('');
  const [threadsConnection, setThreadsConnection] = useState<any>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.success) {
        const { aiConfig, threadsConnection: tc } = json.data;
        setAiProvider(aiConfig.provider);
        setGeminiKey(aiConfig.geminiKeyMasked || '');
        setOpenaiKey(aiConfig.openaiKeyMasked || '');
        setAnthropicKey(aiConfig.anthropicKeyMasked || '');
        setAiModelName(aiConfig.modelName);
        setMaxBatchPosts(aiConfig.maxBatchPosts);
        setMaxComments(aiConfig.maxCommentsPerPost);
        setAnalyzeComments(aiConfig.analyzeCommentsEnabled);

        if (aiConfig.weights) {
          setRelevanceWeight(Math.round(aiConfig.weights.relevanceWeight * 100));
          setProblemFitWeight(Math.round(aiConfig.weights.problemFitWeight * 100));
          setContextFitWeight(Math.round(aiConfig.weights.contextFitWeight * 100));
          setCommentWeight(Math.round(aiConfig.weights.commentWeight * 100));
          setConfidenceWeight(Math.round(aiConfig.weights.confidenceWeight * 100));
        }

        setThreadsConnection(tc);
        setThreadsAppId(tc.appId || '');
        setThreadsUserId(tc.userId || '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const weights = {
      relevanceWeight: relevanceWeight / 100,
      problemFitWeight: problemFitWeight / 100,
      contextFitWeight: contextFitWeight / 100,
      commentWeight: commentWeight / 100,
      confidenceWeight: confidenceWeight / 100,
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_provider: aiProvider,
          gemini_api_key: geminiKey,
          openai_api_key: openaiKey,
          anthropic_api_key: anthropicKey,
          ai_model_name: aiModelName,
          ai_max_batch_posts: maxBatchPosts,
          ai_max_comments: maxComments,
          ai_analyze_comments: analyzeComments,
          weights,
          threads_access_token: threadsToken,
          threads_app_id: threadsAppId,
          threads_user_id: threadsUserId,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Lỗi lưu cài đặt');

      setMessage({ text: 'Cài đặt đã được lưu an toàn trên máy chủ.', type: 'success' });
      await fetchSettings();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Cài đặt và kết nối dữ liệu"
          subtitle="Cấu hình nhà cung cấp AI, trọng số đánh giá, kết nối Meta Threads API và dữ liệu mẫu"
          onDataMutated={fetchSettings}
        />

        <main className="p-6 md:p-8 space-y-6 flex-1 max-w-5xl w-full mx-auto">
          {message && (
            <div
              className={`p-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Settings Tabs */}
          <div className="flex border-b border-[#84A282]/20 gap-4">
            <button
              onClick={() => setActiveTab('ai')}
              className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'ai'
                  ? 'border-[#84A282] text-[#84A282]'
                  : 'border-transparent text-[#5E6D62] hover:text-[#222B24]'
              }`}
            >
              <BrainCircuit className="w-4 h-4" />
              <span>1. Cấu hình AI & Trọng số</span>
            </button>

            <button
              onClick={() => setActiveTab('threads')}
              className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'threads'
                  ? 'border-[#84A282] text-[#84A282]'
                  : 'border-transparent text-[#5E6D62] hover:text-[#222B24]'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>2. Kết nối Meta Threads API</span>
            </button>

            <button
              onClick={() => setActiveTab('demo')}
              className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'demo'
                  ? 'border-[#84A282] text-[#84A282]'
                  : 'border-transparent text-[#5E6D62] hover:text-[#222B24]'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>3. Quản lý dữ liệu mẫu</span>
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-[#5E6D62]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#84A282]" />
              Đang tải cài đặt hệ thống...
            </div>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* TAB 1: CẤU HÌNH AI */}
              {activeTab === 'ai' && (
                <div className="space-y-6">
                  {/* Provider selection */}
                  <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-4">
                    <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4 text-[#84A282]" />
                      Nhà cung cấp mô hình AI
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        {
                          id: 'local',
                          name: 'Local Heuristic Engine',
                          desc: 'Thuật toán NLP ngữ nghĩa nội bộ tiếng Việt. Hoạt động tức thì không cần API key ngoài.',
                        },
                        {
                          id: 'gemini',
                          name: 'Google Gemini',
                          desc: 'Sử dụng Gemini 1.5 Flash / Pro với khả năng phân tích tiếng Việt sâu sắc.',
                        },
                        {
                          id: 'openai',
                          name: 'OpenAI GPT-4o',
                          desc: 'Sử dụng mô hình GPT-4o-mini hoặc GPT-4o qua OpenAI API.',
                        },
                      ].map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setAiProvider(p.id)}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                            aiProvider === p.id
                              ? 'border-[#84A282] bg-[#B8CFB3]/15'
                              : 'border-[#84A282]/20 bg-[#FEFAF3] hover:border-[#84A282]/40'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs text-[#222B24]">
                              {p.name}
                            </span>
                            <input
                              type="radio"
                              name="aiProvider"
                              checked={aiProvider === p.id}
                              onChange={() => setAiProvider(p.id)}
                              className="accent-[#84A282]"
                            />
                          </div>
                          <p className="text-[11px] text-[#5E6D62] leading-relaxed">
                            {p.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* API Keys */}
                  <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-[#84A282]/15 pb-2">
                      <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
                        <Key className="w-4 h-4 text-[#84A282]" />
                        Khóa API (API Keys) - Lưu trữ bảo mật phía Server
                      </h3>
                      <span className="text-[11px] text-[#5E6D62] flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Server-side encrypted
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                          Google Gemini API Key
                        </label>
                        <input
                          type="password"
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                          OpenAI API Key
                        </label>
                        <input
                          type="password"
                          value={openaiKey}
                          onChange={(e) => setOpenaiKey(e.target.value)}
                          placeholder="sk-..."
                          className="w-full px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Weights Configuration */}
                  <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-[#84A282]/15 pb-2">
                      <div>
                        <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-[#84A282]" />
                          Cấu hình trọng số Opportunity Score (Tổng: {relevanceWeight + problemFitWeight + contextFitWeight + commentWeight + confidenceWeight}%)
                        </h3>
                        <p className="text-xs text-[#5E6D62] mt-0.5">
                          Tự động chuẩn hóa nếu thiếu bình luận thực tế (không bịa số liệu)
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="flex justify-between font-semibold text-[#222B24] mb-1">
                          <span>1. Mức độ liên quan trực tiếp (Relevance):</span>
                          <span className="text-[#84A282]">{relevanceWeight}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="60"
                          value={relevanceWeight}
                          onChange={(e) => setRelevanceWeight(Number(e.target.value))}
                          className="w-full accent-[#84A282]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-semibold text-[#222B24] mb-1">
                          <span>2. Giải quyết vấn đề (Problem Fit):</span>
                          <span className="text-[#84A282]">{problemFitWeight}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="50"
                          value={problemFitWeight}
                          onChange={(e) => setProblemFitWeight(Number(e.target.value))}
                          className="w-full accent-[#84A282]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-semibold text-[#222B24] mb-1">
                          <span>3. Ngữ cảnh tự nhiên (Context Fit):</span>
                          <span className="text-[#84A282]">{contextFitWeight}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="40"
                          value={contextFitWeight}
                          onChange={(e) => setContextFitWeight(Number(e.target.value))}
                          className="w-full accent-[#84A282]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-semibold text-[#222B24] mb-1">
                          <span>4. Bằng chứng từ bình luận (Comment Evidence):</span>
                          <span className="text-[#84A282]">{commentWeight}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="30"
                          value={commentWeight}
                          onChange={(e) => setCommentWeight(Number(e.target.value))}
                          className="w-full accent-[#84A282]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-semibold text-[#222B24] mb-1">
                          <span>5. Độ tin cậy dữ liệu (Confidence):</span>
                          <span className="text-[#84A282]">{confidenceWeight}%</span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="20"
                          value={confidenceWeight}
                          onChange={(e) => setConfidenceWeight(Number(e.target.value))}
                          className="w-full accent-[#84A282]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: KẾT NỐI META THREADS API */}
              {activeTab === 'threads' && (
                <div className="space-y-6">
                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                      threadsConnection?.isValid
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {threadsConnection?.isValid ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs space-y-1">
                      <strong className="text-sm block">
                        {threadsConnection?.isValid
                          ? 'Đã kết nối chính thức với Meta Threads API'
                          : 'Chưa cấu hình Meta Threads API'}
                      </strong>
                      <p>{threadsConnection?.message}</p>
                      <p className="text-[11px] opacity-80">
                        {threadsConnection?.isValid
                          ? `Giới hạn tốc độ: ${threadsConnection?.rateLimitStatus?.estimatedLimit}`
                          : 'Hệ thống hỗ trợ nhập bài viết bằng URL, CSV hoặc thử nghiệm với Bộ dữ liệu mẫu có sẵn.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-4">
                    <h3 className="font-bold text-sm text-[#222B24]">
                      Thông tin kết nối Meta Developer
                    </h3>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                          Threads User Access Token
                        </label>
                        <input
                          type="password"
                          value={threadsToken}
                          onChange={(e) => setThreadsToken(e.target.value)}
                          placeholder="THQ..."
                          className="w-full px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                            Threads App ID
                          </label>
                          <input
                            type="text"
                            value={threadsAppId}
                            onChange={(e) => setThreadsAppId(e.target.value)}
                            placeholder="123456789012345"
                            className="w-full px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                            Threads User ID
                          </label>
                          <input
                            type="text"
                            value={threadsUserId}
                            onChange={(e) => setThreadsUserId(e.target.value)}
                            placeholder="me hoặc ID tài khoản Threads"
                            className="w-full px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-[#FEFAF3] rounded-xl border border-[#84A282]/15 text-xs text-[#5E6D62] space-y-1">
                      <strong className="text-[#222B24] block">Nguyên tắc tuân thủ pháp lý Meta:</strong>
                      <p>• Chỉ gọi các endpoint Graph API được cấp phép (threads_basic, threads_read_replies).</p>
                      <p>• Tuyệt đối không vượt CAPTCHA, không dùng tài khoản giả, không đánh cắp session.</p>
                      <p>• Dữ liệu bài viết bên ngoài được coi là không đáng tin cậy (ngăn chặn prompt injection).</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: DỮ LIỆU MẪU */}
              {activeTab === 'demo' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs space-y-4">
                    <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#84A282]" />
                      Quản lý dữ liệu mẫu (Sample Dataset)
                    </h3>
                    <p className="text-xs text-[#5E6D62]">
                      Phục vụ kiểm thử toàn bộ luồng nghiệp vụ: sản phẩm affiliate thực tế tại Việt Nam, bài viết Threads sinh viên & văn phòng, kịch bản đối chiếu AI 5 tab hoàn chỉnh.
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch('/api/demo/seed', { method: 'POST' });
                          const json = await res.json();
                          alert(json.message);
                          fetchSettings();
                        }}
                        className="px-4 py-2 rounded-xl bg-[#84A282] text-white text-xs font-bold hover:bg-[#6d8b6b] transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Database className="w-4 h-4" />
                        <span>Nạp dữ liệu mẫu</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm('Bạn có chắc muốn xóa sạch toàn bộ dữ liệu mẫu?')) return;
                          const res = await fetch('/api/demo/reset', { method: 'POST' });
                          const json = await res.json();
                          alert(json.message);
                          fetchSettings();
                        }}
                        className="px-4 py-2 rounded-xl bg-white border border-rose-300 text-rose-700 text-xs font-bold hover:bg-rose-50 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Xóa toàn bộ dữ liệu mẫu</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-[#84A282]/20">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-[#84A282] text-white text-xs font-bold hover:bg-[#6d8b6b] transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Đang lưu...' : 'Lưu toàn bộ cài đặt'}</span>
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
