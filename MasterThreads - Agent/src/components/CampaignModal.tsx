'use client';

import React, { useState } from 'react';
import { X, Radio, Play } from 'lucide-react';
import { CategoryDTO } from '@/types';

interface CampaignModalProps {
  categories: CategoryDTO[];
  onClose: () => void;
  onCampaignCreated: () => void;
}

export function CampaignModal({
  categories,
  onClose,
  onCampaignCreated,
}: CampaignModalProps) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [mainKeywords, setMainKeywords] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [targetPostsCount, setTargetPostsCount] = useState<number>(30);
  const [minEngagement, setMinEngagement] = useState<number>(50);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    categories.map((c) => c.id)
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !topic.trim()) {
      setError('Vui lòng nhập tên chiến dịch và chủ đề.');
      return;
    }

    setLoading(true);
    setError(null);

    const parseKeywords = (text: string) =>
      text
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          topic: topic.trim(),
          mainKeywords: parseKeywords(mainKeywords),
          secondaryKeywords: parseKeywords(secondaryKeywords),
          targetPostsCount: Number(targetPostsCount),
          minEngagement: Number(minEngagement),
          targetCategoryIds: selectedCategoryIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi tạo chiến dịch');
      }

      onCampaignCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FEFAF3] rounded-2xl border border-[#84A282]/30 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[#84A282]/20 flex items-center justify-between bg-[#F6E2E9]/60">
          <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#84A282]" />
            Tạo chiến dịch quét Threads mới
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5E6D62] hover:bg-[#F6E2E9] transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Tên chiến dịch *
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Tìm cơ hội affiliate đồ dùng sinh viên phòng trọ"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Chủ đề cần tìm (Topic) *
            </label>
            <input
              required
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Cuộc sống sinh viên, phòng trọ, góc học tập, setup bàn..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Từ khóa chính (phân tách bằng dấu phẩy)
            </label>
            <input
              type="text"
              value={mainKeywords}
              onChange={(e) => setMainKeywords(e.target.value)}
              placeholder="phòng trọ, góc học tập, bàn học nhỏ, đau mỏi cổ..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Từ khóa phụ (phân tách bằng dấu phẩy)
            </label>
            <input
              type="text"
              value={secondaryKeywords}
              onChange={(e) => setSecondaryKeywords(e.target.value)}
              placeholder="sinh viên, đèn học, laptop, giá đỡ..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Số bài viết mục tiêu
              </label>
              <input
                type="number"
                min="5"
                max="100"
                value={targetPostsCount}
                onChange={(e) => setTargetPostsCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Tương tác tối thiểu
              </label>
              <input
                type="number"
                min="0"
                value={minEngagement}
                onChange={(e) => setMinEngagement(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1.5">
              Danh mục sản phẩm cần đối chiếu
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-white border border-[#84A282]/20">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex items-center gap-2 text-xs text-[#222B24] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(cat.id)}
                    onChange={() => handleToggleCategory(cat.id)}
                    className="w-3.5 h-3.5 accent-[#84A282]"
                  />
                  <span>{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#84A282]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-[#84A282]/30 text-[#5E6D62] hover:bg-gray-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{loading ? 'Đang tạo...' : 'Tạo chiến dịch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
