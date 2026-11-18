'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import { CategoryModal } from '@/components/CategoryModal';
import {
  FolderTree,
  Plus,
  Package,
  Edit2,
  Trash2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { CategoryDTO } from '@/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<CategoryDTO | null | undefined>(
    undefined
  );

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa danh mục "${name}"? Các sản phẩm thuộc danh mục này cũng sẽ bị ảnh hưởng.`)) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCategories((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {}
  };

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Danh mục sản phẩm"
          subtitle="Tổ chức các nhóm sản phẩm affiliate theo ngành hàng hoặc tình huống sử dụng"
          onDataMutated={fetchCategories}
        />

        <main className="p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#222B24]">
                Tất cả danh mục ({categories.length})
              </h2>
              <p className="text-xs text-[#5E6D62]">
                Phân loại danh mục giúp AI định vị ngữ cảnh bài viết chính xác hơn
              </p>
            </div>

            <button
              onClick={() => setEditingCategory(null)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm danh mục mới</span>
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-[#5E6D62]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#84A282]" />
              Đang tải danh mục...
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 rounded-2xl bg-white border border-[#84A282]/20 text-center space-y-3">
              <FolderTree className="w-10 h-10 text-[#5E6D62] mx-auto opacity-40" />
              <h3 className="font-bold text-sm text-[#222B24]">
                Chưa có danh mục nào
              </h3>
              <p className="text-xs text-[#5E6D62] max-w-sm mx-auto">
                Tạo các danh mục như Đồ công nghệ, Đồ dùng học tập, Đồ dùng phòng trọ để bắt đầu.
              </p>
              <button
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer inline-flex items-center gap-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm danh mục đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-5 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col justify-between hover:shadow-md transition-all space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3.5 h-3.5 rounded-full"
                          style={{ backgroundColor: cat.color || '#84A282' }}
                        />
                        <h4 className="font-bold text-sm text-[#222B24]">
                          {cat.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingCategory(cat)}
                          className="p-1.5 rounded-lg text-[#5E6D62] hover:text-[#84A282] hover:bg-[#F6E2E9] transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat.id, cat.name)}
                          className="p-1.5 rounded-lg text-[#5E6D62] hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#5E6D62] line-clamp-2">
                      {cat.description || 'Chưa có mô tả chi tiết cho danh mục này.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#84A282]/15 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#84A282] flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" />
                      {cat._count?.products || 0} sản phẩm
                    </span>

                    <Link
                      href={`/products?categoryId=${cat.id}`}
                      className="text-xs font-semibold text-[#5E6D62] hover:text-[#222B24] flex items-center gap-1"
                    >
                      Xem sản phẩm <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {editingCategory !== undefined && (
        <CategoryModal
          category={editingCategory}
          onClose={() => setEditingCategory(undefined)}
          onSaved={fetchCategories}
        />
      )}
    </div>
  );
}
