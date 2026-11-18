"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Tag,
  ArrowRight,
  Sparkles,
  Search,
  ShoppingBag,
  Smartphone,
  Shirt,
  Laptop,
  Footprints,
  Heart,
  Palette,
  Cpu,
  Coffee,
  Bike,
  BookOpen,
  Music,
  CheckCircle2,
  X,
  Layers,
} from "lucide-react";

export interface SerializedCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  image?: string;
  order?: number;
  subcategories?: string[];
  isActive?: boolean;
  productCount?: number;
}

interface CategoriesClientViewProps {
  categories: SerializedCategory[];
}

// Map category slug / icon name to Lucide icons
function getCategoryIcon(slug: string, iconName?: string) {
  const s = slug.toLowerCase();
  if (s.includes("dien-thoai") || s.includes("phone")) return Smartphone;
  if (s.includes("nam") || s.includes("nu") || s.includes("thoi-trang") || s.includes("fashion")) return Shirt;
  if (s.includes("my-pham") || s.includes("cham-soc") || s.includes("beauty")) return Sparkles;
  if (s.includes("giay") || s.includes("shoes")) return Footprints;
  if (s.includes("tui") || s.includes("bag")) return ShoppingBag;
  if (s.includes("laptop") || s.includes("may-tinh")) return Laptop;
  if (s.includes("kpop") || s.includes("idol")) return Music;
  if (s.includes("decor") || s.includes("noi-that")) return Palette;
  if (s.includes("cong-nghe") || s.includes("phu-kien")) return Cpu;
  if (s.includes("doi-song") || s.includes("life")) return Coffee;
  if (s.includes("xe") || s.includes("moto")) return Bike;
  if (s.includes("van-phong") || s.includes("sach")) return BookOpen;
  return Tag;
}

function CategoryCard({ cat }: { cat: SerializedCategory }) {
  const [imageError, setImageError] = useState(false);
  const IconComponent = getCategoryIcon(cat.slug, cat.icon);

  return (
    <div className="group bg-white rounded-3xl border border-slate-100 hover:border-pink-200 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between relative overflow-hidden">
      {/* Decorative top accent glow on hover */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-pink-500/0 to-transparent group-hover:via-pink-500 transition-all duration-500" />

      <div>
        {/* Header with Icon/Image and Count Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-50 to-purple-50 overflow-hidden flex items-center justify-center border border-slate-100/80 shadow-inner shrink-0 group-hover:scale-105 transition-transform duration-300">
            {cat.image && !imageError ? (
              <img
                src={cat.image}
                alt={cat.name}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <IconComponent className="w-7 h-7 text-pink-600 transition-transform group-hover:scale-110 duration-300" />
            )}
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-slate-50 text-slate-700 rounded-full border border-slate-100 group-hover:bg-pink-50 group-hover:text-pink-600 group-hover:border-pink-100 transition-colors">
            {cat.productCount || 0} sản phẩm
          </span>
        </div>

        {/* Category Title */}
        <Link href={`/category/${cat.slug}`} className="block group/link">
          <h2 className="text-lg font-bold text-slate-900 group-hover/link:text-pink-600 transition-colors flex items-center gap-1.5">
            {cat.name}
          </h2>
        </Link>

        {/* Description */}
        <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
          {cat.description || `Khám phá các sản phẩm hot trend thuộc nhóm ${cat.name} tại SHOPDEE.`}
        </p>

        {/* Subcategories tags */}
        {cat.subcategories && cat.subcategories.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-50 flex flex-wrap gap-1.5">
            {cat.subcategories.slice(0, 4).map((sub) => (
              <Link
                key={sub}
                href={`/products?search=${encodeURIComponent(sub)}`}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-pink-50 hover:text-pink-600 text-slate-600 font-medium transition"
              >
                {sub}
              </Link>
            ))}
            {cat.subcategories.length > 4 && (
              <Link
                href={`/category/${cat.slug}`}
                className="text-[11px] px-2 py-1 rounded-lg bg-slate-50 text-slate-400 font-medium hover:text-slate-600"
              >
                +{cat.subcategories.length - 4} khác
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
        <Link
          href={`/category/${cat.slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-pink-600 hover:text-pink-700 transition group-hover:translate-x-1"
        >
          Khám phá bộ sưu tập <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        <span className="text-[10px] text-slate-400 font-mono">
          /{cat.slug}
        </span>
      </div>
    </div>
  );
}

export default function CategoriesClientView({ categories }: CategoriesClientViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter((cat) => {
      const matchName = cat.name.toLowerCase().includes(q);
      const matchSlug = cat.slug.toLowerCase().includes(q);
      const matchDesc = cat.description ? cat.description.toLowerCase().includes(q) : false;
      const matchSub = cat.subcategories?.some((sub) => sub.toLowerCase().includes(q));
      return matchName || matchSlug || matchDesc || matchSub;
    });
  }, [categories, searchQuery]);

  const totalProducts = useMemo(() => {
    return categories.reduce((acc, cat) => acc + (cat.productCount || 0), 0);
  }, [categories]);

  return (
    <div className="space-y-8">
      {/* Search and Summary Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative w-full md:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm nhanh danh mục (ví dụ: Điện thoại, Giày, Mỹ phẩm...)"
            className="w-full pl-11 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-200/80 focus:bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-100 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 transition outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Quick Highlights */}
        <div className="flex items-center gap-3 sm:gap-6 text-xs text-slate-600 w-full md:w-auto justify-between md:justify-end overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <Layers className="w-4 h-4 text-pink-600" />
            <span className="font-semibold text-slate-900">{categories.length}</span> danh mục
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ShoppingBag className="w-4 h-4 text-purple-600" />
            <span className="font-semibold text-slate-900">{totalProducts.toLocaleString("vi-VN")}</span> sản phẩm
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>100% Chính Hãng</span>
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      {filteredCategories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories.map((cat) => (
            <CategoryCard key={cat._id} cat={cat} />
          ))}
        </div>
      ) : (
        /* Empty Search Result */
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-pink-50 flex items-center justify-center text-pink-500">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Không tìm thấy danh mục nào phù hợp với &quot;{searchQuery}&quot;
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Thử tìm kiếm với từ khóa khác như &quot;thời trang&quot;, &quot;laptop&quot;, &quot;mỹ phẩm&quot; hoặc xóa bộ lọc để xem toàn bộ danh mục.
          </p>
          <button
            onClick={() => setSearchQuery("")}
            className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold transition shadow-md shadow-pink-600/20"
          >
            Xem tất cả danh mục
          </button>
        </div>
      )}
    </div>
  );
}
