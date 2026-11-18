'use client';

import React, { useState } from 'react';
import { X, Package, Save } from 'lucide-react';
import { ProductDTO, CategoryDTO } from '@/types';

interface ProductModalProps {
  product?: ProductDTO | null;
  categories: CategoryDTO[];
  onClose: () => void;
  onSaved: () => void;
}

export function ProductModal({
  product,
  categories,
  onClose,
  onSaved,
}: ProductModalProps) {
  const isEdit = Boolean(product?.id);

  const [name, setName] = useState(product?.name || '');
  const [categoryId, setCategoryId] = useState(
    product?.categoryId || categories[0]?.id || ''
  );
  const [brand, setBrand] = useState(product?.brand || '');
  const [description, setDescription] = useState(product?.description || '');
  const [problemsSolved, setProblemsSolved] = useState(
    Array.isArray(product?.problemsSolved)
      ? product!.problemsSolved.join('\n')
      : ''
  );
  const [targetAudience, setTargetAudience] = useState(
    Array.isArray(product?.targetAudience)
      ? product!.targetAudience.join('\n')
      : ''
  );
  const [typicalSituations, setTypicalSituations] = useState(
    Array.isArray(product?.typicalSituations)
      ? product!.typicalSituations.join('\n')
      : ''
  );
  const [keywords, setKeywords] = useState(
    Array.isArray(product?.keywords) ? product!.keywords.join(', ') : ''
  );
  const [synonyms, setSynonyms] = useState(
    Array.isArray(product?.synonyms) ? product!.synonyms.join(', ') : ''
  );
  const [negativeKeywords, setNegativeKeywords] = useState(
    Array.isArray(product?.negativeKeywords)
      ? product!.negativeKeywords.join(', ')
      : ''
  );
  const [price, setPrice] = useState(product?.price ? String(product.price) : '');
  const [affiliateUrl, setAffiliateUrl] = useState(product?.affiliateUrl || '');
  const [originalUrl, setOriginalUrl] = useState(product?.originalUrl || '');
  const [platform, setPlatform] = useState(product?.platform || 'Shopee');
  const [notes, setNotes] = useState(product?.notes || '');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(
    product?.status || 'ACTIVE'
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) {
      setError('Vui lòng nhập tên sản phẩm và chọn danh mục.');
      return;
    }

    setLoading(true);
    setError(null);

    const parseLines = (text: string) =>
      text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    const parseCommas = (text: string) =>
      text
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);

    const payload = {
      name: name.trim(),
      categoryId,
      brand: brand.trim() || null,
      description: description.trim(),
      problemsSolved: parseLines(problemsSolved),
      targetAudience: parseLines(targetAudience),
      typicalSituations: parseLines(typicalSituations),
      keywords: parseCommas(keywords),
      synonyms: parseCommas(synonyms),
      negativeKeywords: parseCommas(negativeKeywords),
      price: price ? Number(price) : null,
      affiliateUrl: affiliateUrl.trim() || null,
      originalUrl: originalUrl.trim() || null,
      platform,
      notes: notes.trim() || null,
      status,
    };

    try {
      const url = isEdit ? `/api/products/${product!.id}` : '/api/products';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi lưu sản phẩm');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FEFAF3] rounded-2xl border border-[#84A282]/30 w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-4 border-b border-[#84A282]/20 flex items-center justify-between bg-[#F6E2E9]/60">
          <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
            <Package className="w-4 h-4 text-[#84A282]" />
            {isEdit ? 'Chỉnh sửa sản phẩm affiliate' : 'Thêm sản phẩm affiliate mới'}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Tên sản phẩm *
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Đèn bàn học tích điện Baseus"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Danh mục sản phẩm *
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Thương hiệu (Brand)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Baseus, Lock&Lock..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Sàn bán hàng
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              >
                <option value="Shopee">Shopee</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Lazada">Lazada</option>
                <option value="Tiki">Tiki</option>
                <option value="Khác">Khác</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Giá tham khảo (VNĐ)
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="250000"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Mô tả sản phẩm *
            </label>
            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả công năng chính của sản phẩm..."
              className="w-full p-2.5 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Các vấn đề giải quyết (mỗi dòng 1 vấn đề)
              </label>
              <textarea
                rows={3}
                value={problemsSolved}
                onChange={(e) => setProblemsSolved(e.target.value)}
                placeholder="Thiếu ánh sáng khi học buổi tối&#10;Bàn học quá nhỏ không có ổ cắm cố định"
                className="w-full p-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Khách hàng mục tiêu (mỗi dòng 1 đối tượng)
              </label>
              <textarea
                rows={3}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Học sinh, sinh viên&#10;Dân văn phòng ngồi máy lạnh&#10;Người ở phòng trọ nhỏ"
                className="w-full p-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Từ khóa liên quan (phân tách bằng dấu phẩy)
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="đèn học, bàn học, góc học tập, phòng trọ, pin sạc..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Từ khóa đồng nghĩa (phân tách bằng phẩy)
              </label>
              <input
                type="text"
                value={synonyms}
                onChange={(e) => setSynonyms(e.target.value)}
                placeholder="đèn led để bàn, đèn đọc sách..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Từ khóa loại trừ (phân tách bằng phẩy)
              </label>
              <input
                type="text"
                value={negativeKeywords}
                onChange={(e) => setNegativeKeywords(e.target.value)}
                placeholder="đèn chùm, đèn đường, đèn xe..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Link Affiliate
              </label>
              <input
                type="url"
                value={affiliateUrl}
                onChange={(e) => setAffiliateUrl(e.target.value)}
                placeholder="https://shope.ee/..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Link sản phẩm gốc (Tùy chọn)
              </label>
              <input
                type="url"
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                placeholder="https://shopee.vn/..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              >
                <option value="ACTIVE">Đang hoạt động (Khả dụng đối chiếu AI)</option>
                <option value="INACTIVE">Tạm dừng (Không đối chiếu)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
                Ghi chú cá nhân
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Hoa hồng 10%, shop uy tín..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#84A282]/15">
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
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Đang lưu...' : 'Lưu sản phẩm'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
