'use client';

import React, { useState } from 'react';
import { X, FolderTree, Save } from 'lucide-react';
import { CategoryDTO } from '@/types';

interface CategoryModalProps {
  category?: CategoryDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CategoryModal({
  category,
  onClose,
  onSaved,
}: CategoryModalProps) {
  const isEdit = Boolean(category?.id);
  const [name, setName] = useState(category?.name || '');
  const [description, setDescription] = useState(category?.description || '');
  const [color, setColor] = useState(category?.color || '#84A282');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên danh mục.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = isEdit ? `/api/categories/${category!.id}` : '/api/categories';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi lưu danh mục');
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FEFAF3] rounded-2xl border border-[#84A282]/30 w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-[#84A282]/20 flex items-center justify-between bg-[#F6E2E9]/60">
          <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-[#84A282]" />
            {isEdit ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
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

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Tên danh mục *
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Đồ dùng phòng trọ & gia dụng"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Mô tả danh mục
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả nhóm sản phẩm hoặc ngữ cảnh khai thác..."
              className="w-full p-2.5 text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5E6D62] uppercase mb-1">
              Màu đại diện
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-8 rounded-lg border border-[#84A282]/30 cursor-pointer"
              />
              <span className="text-xs font-mono text-[#5E6D62]">{color}</span>
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
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Đang lưu...' : 'Lưu danh mục'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
