'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import { ProductModal } from '@/components/ProductModal';
import { ImportModal } from '@/components/ImportModal';
import {
  Package,
  Plus,
  Upload,
  Download,
  Search,
  Edit2,
  Trash2,
  ExternalLink,
  Tag,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { ProductDTO, CategoryDTO } from '@/types';

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals
  const [editingProduct, setEditingProduct] = useState<ProductDTO | null | undefined>(
    undefined
  );
  const [showImportModal, setShowImportModal] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (selectedCategoryId) params.set('categoryId', selectedCategoryId);
      if (selectedPlatform) params.set('platform', selectedPlatform);
      if (selectedStatus) params.set('status', selectedStatus);

      const [prodRes, catRes] = await Promise.all([
        fetch(`/api/products?${params.toString()}`),
        fetch('/api/categories'),
      ]);

      const [prodJson, catJson] = await Promise.all([
        prodRes.json(),
        catRes.json(),
      ]);

      if (prodJson.success) setProducts(prodJson.data);
      if (catJson.success) setCategories(catJson.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategoryId, selectedPlatform, selectedStatus]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${name}"?`)) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {}
  };

  const handleExport = () => {
    window.open('/api/products/export', '_blank');
  };

  return (
    <div className="flex min-h-screen bg-[#FEFAF3]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title="Quản lý sản phẩm affiliate"
          subtitle="Quản lý danh sách sản phẩm, từ khóa liên quan và các vấn đề giải quyết để đối chiếu AI"
          onDataMutated={fetchData}
        />

        <main className="p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#222B24]">
                Kho sản phẩm của tôi ({products.length})
              </h2>
              <p className="text-xs text-[#5E6D62]">
                Các sản phẩm được AI dùng để quét và đối chiếu mức độ phù hợp với bài viết Threads
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] hover:bg-[#FEFAF3] cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-[#84A282]" />
                <span>Xuất file CSV</span>
              </button>

              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] hover:bg-[#FEFAF3] cursor-pointer shadow-xs"
              >
                <Upload className="w-3.5 h-3.5 text-[#84A282]" />
                <span>Nhập từ CSV / JSON</span>
              </button>

              <button
                onClick={() => setEditingProduct(null)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm sản phẩm mới</span>
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-white border border-[#84A282]/20 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#5E6D62]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                placeholder="Tìm theo tên sản phẩm, thương hiệu, mô tả..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
              >
                <option value="">Tất cả sàn</option>
                <option value="Shopee">Shopee</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Lazada">Lazada</option>
                <option value="Tiki">Tiki</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#222B24] focus:outline-none"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Tạm dừng</option>
              </select>

              <button
                onClick={fetchData}
                className="p-2 rounded-xl bg-[#FEFAF3] border border-[#84A282]/30 text-[#5E6D62] hover:text-[#222B24]"
                title="Làm mới"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Product Grid / Table */}
          {loading ? (
            <div className="p-12 text-center text-xs text-[#5E6D62]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#84A282]" />
              Đang tải danh sách sản phẩm...
            </div>
          ) : products.length === 0 ? (
            <div className="p-12 rounded-2xl bg-white border border-[#84A282]/20 text-center space-y-3">
              <Package className="w-10 h-10 text-[#5E6D62] mx-auto opacity-40" />
              <h3 className="font-bold text-sm text-[#222B24]">
                Chưa có sản phẩm nào
              </h3>
              <p className="text-xs text-[#5E6D62] max-w-sm mx-auto">
                Hãy thêm sản phẩm affiliate của bạn hoặc nạp bộ dữ liệu mẫu để bắt đầu đối chiếu AI.
              </p>
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer inline-flex items-center gap-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm sản phẩm đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="p-4 rounded-2xl bg-white border border-[#84A282]/25 shadow-xs flex flex-col justify-between hover:shadow-md transition-all space-y-3"
                >
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#B8CFB3]/30 text-[#222B24]">
                          {product.category?.name || 'Chung'}
                        </span>
                        <h4 className="font-bold text-sm text-[#222B24] mt-1 line-clamp-1">
                          {product.name}
                        </h4>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          product.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {product.status === 'ACTIVE' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Hoạt động
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> Tạm dừng
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-xs text-[#5E6D62] line-clamp-2">
                      {product.description}
                    </p>

                    {/* Meta info */}
                    <div className="text-xs space-y-1 pt-1 text-[#222B24]">
                      <div className="flex items-center justify-between text-[#5E6D62]">
                        <span>Sàn: {product.platform}</span>
                        {product.brand && <span>Hãng: {product.brand}</span>}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#5E6D62]">Giá tham khảo:</span>
                        <span className="font-bold text-[#84A282]">
                          {product.price ? `${product.price.toLocaleString()} đ` : 'Chưa cập nhật'}
                        </span>
                      </div>
                    </div>

                    {/* Keywords preview */}
                    {product.keywords && product.keywords.length > 0 && (
                      <div className="pt-2 border-t border-[#84A282]/10 flex flex-wrap gap-1">
                        {product.keywords.slice(0, 4).map((kw, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#FEFAF3] border border-[#84A282]/20 text-[#5E6D62]"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-3 border-t border-[#84A282]/15 flex items-center justify-between text-xs">
                    {product.affiliateUrl ? (
                      <a
                        href={product.affiliateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#84A282] hover:underline flex items-center gap-1 font-semibold text-xs"
                      >
                        Link Affiliate <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-[#5E6D62] italic">
                        Chưa có link
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="p-1.5 rounded-lg text-[#5E6D62] hover:text-[#84A282] hover:bg-[#F6E2E9] transition-all cursor-pointer"
                        title="Chỉnh sửa"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(product.id, product.name)}
                        className="p-1.5 rounded-lg text-[#5E6D62] hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Product Add/Edit Modal */}
      {editingProduct !== undefined && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(undefined)}
          onSaved={fetchData}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={fetchData}
        />
      )}
    </div>
  );
}
