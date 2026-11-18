import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connectDB } from "@/lib/db";
import Category from "@/models/Category";
import { Sparkles, Home, ChevronRight } from "lucide-react";
import CategoriesClientView from "./CategoriesClientView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tất Cả Danh Mục Sản Phẩm | SHOPDEE Việt Nam",
  description:
    "Khám phá tất cả các danh mục sản phẩm hot trend tại SHOPDEE: Thời trang Gen Z, Công nghệ, Mỹ phẩm, Giày dép, Decor phòng, Phụ kiện chính hãng giao nhanh 24h.",
  openGraph: {
    title: "Danh Mục Mua Sắm SHOPDEE — Đỉnh Cao Mua Sắm Gen Z",
    description: "Khám phá thế giới sản phẩm xu hướng với hàng ngàn ưu đãi hấp dẫn.",
    url: "https://shopdeevn.online/categories",
    siteName: "SHOPDEE",
    locale: "vi_VN",
    type: "website",
  },
};

export default async function CategoriesPage() {
  await connectDB();
  const rawCategories = await Category.find({ isActive: true }).sort({ order: 1 }).lean();

  const serializedCategories = JSON.parse(JSON.stringify(rawCategories)).map((cat: any) => ({
    _id: cat._id.toString(),
    name: cat.name,
    slug: cat.slug,
    description: cat.description || "",
    icon: cat.icon || "Tag",
    image: cat.image || "",
    order: cat.order || 0,
    subcategories: cat.subcategories || [],
    isActive: cat.isActive !== false,
    productCount: cat.productCount || 0,
  }));

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-16">
      {/* Hero Header Banner */}
      <div className="bg-gradient-to-br from-[#192841] via-[#1e345b] to-[#254273] text-white py-10 sm:py-14 border-b border-white/10 relative overflow-hidden">
        {/* Decorative blur lights */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-4">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-white/60">
            <Link href="/" className="hover:text-white flex items-center gap-1 transition">
              <Home className="w-3.5 h-3.5" /> Trang chủ
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-white/40" />
            <span className="text-white font-medium">Danh mục sản phẩm</span>
          </nav>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-pink-300 text-xs font-bold mb-3 border border-white/10 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" /> BỘ SƯU TẬP GEN Z • SHOPDEE
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Tất Cả Danh Mục Khám Phá
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-2 leading-relaxed">
              Khám phá thế giới mua sắm đa dạng từ Thời trang, Mỹ phẩm, Công nghệ đến Decor phòng cực chất. Tất cả sản phẩm đều được kiểm định chất lượng và hỗ trợ giao nhanh 24h!
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 relative z-20">
        <CategoriesClientView categories={serializedCategories} />
      </div>
    </div>
  );
}
