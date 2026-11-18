"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  X,
  Star,
  ShoppingCart,
  Check,
  Heart,
  ShieldCheck,
  Truck,
  RotateCcw,
  Zap,
  ArrowRight,
  Eye,
  Plus,
  Minus,
  Sparkles,
} from "lucide-react";
import { ProductItem } from "./ProductCard";
import { formatVND } from "@/lib/utils";
import { useCartStore } from "@/store/useCartStore";
import { useWishlistStore } from "@/store/useWishlistStore";
import { useAuthStore } from "@/store/useAuthStore";
import { showToast } from "@/store/useToastStore";
import { useQuickViewStore } from "@/store/useQuickViewStore";

interface QuickViewModalProps {
  product?: ProductItem | null;
  onClose?: () => void;
}

export default function QuickViewModal(props: QuickViewModalProps) {
  const router = useRouter();
  const store = useQuickViewStore();
  const { addItem, setIsDrawerOpen } = useCartStore();
  const { isInWishlist, toggleWishlist } = useWishlistStore();
  const { user } = useAuthStore();

  // Support both direct props and global store
  const product = props.product !== undefined ? props.product : store.product;
  const isGlobalOpen = store.isOpen;
  const isDirectOpen = props.product !== undefined && props.product !== null;
  const isOpen = isDirectOpen || isGlobalOpen;

  const handleClose = () => {
    if (props.onClose) {
      props.onClose();
    }
    store.closeQuickView();
  };

  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Touch gesture support for mobile sheet drag-down to dismiss
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Reset state whenever active product changes
  useEffect(() => {
    if (product) {
      setActiveImageIndex(0);
      setQuantity(1);
      const firstOpt = product.variants?.[0]?.options?.[0] || "Mặc định";
      setSelectedVariant(firstOpt);
    }
  }, [product?._id]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const isLiked = isInWishlist(product._id);
  const activePrice = product.isFlashSale && product.flashSalePrice ? product.flashSalePrice : product.price;
  const discount = product.discountPercent || (product.originalPrice > activePrice ? Math.round(((product.originalPrice - activePrice) / product.originalPrice) * 100) : 0);
  const firstVariant = product.variants?.[0];
  const currentVariant = selectedVariant || firstVariant?.options?.[0] || "Mặc định";

  const handleAddToCart = () => {
    if (!user) {
      showToast({
        type: "info",
        title: "Yêu cầu đăng nhập",
        message: "Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng.",
      });
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    addItem({
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images[activeImageIndex] || product.images[0] || "",
      price: activePrice,
      originalPrice: product.originalPrice,
      quantity,
      variantName: currentVariant,
    });

    showToast({
      type: "success",
      title: "Đã thêm vào giỏ hàng!",
      message: `${product.name} (x${quantity})`,
    });

    handleClose();
  };

  const handleBuyNow = () => {
    if (!user) {
      showToast({
        type: "info",
        title: "Yêu cầu đăng nhập",
        message: "Vui lòng đăng nhập để mua hàng.",
      });
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    addItem({
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images[activeImageIndex] || product.images[0] || "",
      price: activePrice,
      originalPrice: product.originalPrice,
      quantity,
      variantName: currentVariant,
    });

    handleClose();
    router.push("/cart");
  };

  // Drag down to close gesture on mobile sheet header
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const diff = touchCurrentY.current - touchStartY.current;
    if (diff > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${Math.min(diff, 120)}px)`;
    }
  };

  const handleTouchEnd = () => {
    const diff = touchCurrentY.current - touchStartY.current;
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
    if (diff > 80) {
      handleClose();
    }
    touchStartY.current = 0;
    touchCurrentY.current = 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Main Container: Mobile Bottom-Sheet Drawer & Desktop Modal Card */}
      <div
        ref={sheetRef}
        className="relative w-full md:max-w-3xl bg-white shadow-2xl rounded-t-3xl md:rounded-2xl z-10 animate-in slide-in-from-bottom md:zoom-in-95 duration-250 border-t md:border border-slate-200 max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden transition-transform"
      >
        {/* Mobile Drag Indicator Bar */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="md:hidden pt-2.5 pb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none"
        >
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
          <span className="text-[10px] text-slate-400 mt-1 font-medium">Vuốt xuống để đóng</span>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          aria-label="Đóng cửa sổ xem nhanh"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 flex items-center justify-center transition cursor-pointer shadow-xs"
        >
          <X className="w-4 h-4 md:w-5 md:h-5" />
        </button>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Gallery Section */}
            <div className="p-4 sm:p-6 bg-slate-50 flex flex-col items-center justify-start border-b md:border-b-0 md:border-r border-slate-100">
              {/* Main Image */}
              <div className="relative aspect-square w-full max-w-[280px] md:max-w-none overflow-hidden bg-white shadow-xs border border-slate-200 rounded-xl">
                <img
                  src={product.images[activeImageIndex] || product.images[0] || ""}
                  alt={product.name}
                  className="w-full h-full object-cover transition-all duration-300"
                />

                {/* Badge Overlay */}
                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                  {product.isFeatured ? (
                    <span className="px-2 py-0.5 bg-red-600 text-white font-black text-[10px] rounded-xs shadow-xs uppercase">
                      Mall Chính Hãng
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-[#192841] text-white font-bold text-[10px] rounded-xs shadow-xs">
                      Yêu Thích
                    </span>
                  )}
                  {product.isFlashSale && (
                    <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-xs shadow-xs flex items-center gap-0.5">
                      <Zap className="w-3 h-3 fill-current" /> Flash Deal
                    </span>
                  )}
                </div>

                {discount > 0 && (
                  <div className="absolute top-0 right-0 bg-yellow-400 text-red-600 px-2 py-1 text-center font-black text-xs leading-none shadow-xs rounded-bl-sm">
                    -{discount}%
                  </div>
                )}
              </div>

              {/* Thumbnails Strip */}
              {product.images.length > 1 && (
                <div className="flex items-center gap-2 mt-3.5 max-w-full overflow-x-auto pb-1 px-1 no-scrollbar">
                  {product.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                        activeImageIndex === idx
                          ? "border-[#192841] scale-105 shadow-xs"
                          : "border-transparent opacity-60 hover:opacity-100 bg-white"
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Trust Badges */}
              <div className="w-full grid grid-cols-3 gap-1.5 mt-4 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-600 font-medium">
                <div className="flex flex-col items-center gap-0.5">
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Freeship 0Đ</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>100% Chính Hãng</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Đổi Trả 7 Ngày</span>
                </div>
              </div>
            </div>

            {/* Details Section */}
            <div className="p-4 sm:p-6 flex flex-col justify-between space-y-4">
              <div>
                {/* Category & Brand */}
                <div className="flex items-center gap-2 mb-1.5">
                  {product.categoryName && (
                    <span className="text-[11px] font-bold text-[#192841] uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-2xs">
                      {product.categoryName}
                    </span>
                  )}
                  {product.brand && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      Thương hiệu: <strong className="text-slate-800">{product.brand}</strong>
                    </span>
                  )}
                </div>

                {/* Product Name */}
                <h2 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 leading-snug">
                  {product.name}
                </h2>

                {/* Rating & Sold count */}
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                  <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-sm border border-amber-200/60">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="font-bold text-slate-900 text-xs">{product.ratingAverage.toFixed(1)}</span>
                  </div>
                  <span>•</span>
                  <span>Đã bán <strong>{product.soldCount > 1000 ? (product.soldCount / 1000).toFixed(1) + "k" : product.soldCount}</strong> sản phẩm</span>
                  {product.stock !== undefined && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-700 font-medium">Còn {product.stock} trong kho</span>
                    </>
                  )}
                </div>

                {/* Price Display */}
                <div className="mt-3.5 p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-baseline gap-2.5">
                  <div className="flex items-baseline text-[#192841]">
                    <span className="text-xs sm:text-sm font-bold mr-0.5">₫</span>
                    <span className="text-xl sm:text-2xl font-black">
                      {activePrice.toLocaleString("vi-VN")}
                    </span>
                  </div>
                  {product.originalPrice > activePrice && (
                    <span className="text-xs text-slate-400 line-through">
                      ₫{product.originalPrice.toLocaleString("vi-VN")}
                    </span>
                  )}
                  {discount > 0 && (
                    <span className="ml-auto px-2 py-0.5 bg-red-600 text-white font-black text-[10px] rounded-2xs uppercase tracking-tight">
                      TIẾT KIỆM {discount}%
                    </span>
                  )}
                </div>

                {/* Variants Selection */}
                {firstVariant && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-slate-800">
                        {firstVariant.name}: <span className="font-semibold text-[#192841]">{currentVariant}</span>
                      </label>
                      <span className="text-[11px] text-slate-400">Chọn 1 tùy chọn</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {firstVariant.options.map((opt) => {
                        const isSelected = currentVariant === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSelectedVariant(opt)}
                            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                              isSelected
                                ? "bg-[#192841] text-white border-2 border-[#192841] shadow-xs"
                                : "bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quantity Selector */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Số lượng:</span>
                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden h-9 bg-slate-50 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      aria-label="Giảm số lượng"
                      className="w-9 h-full flex items-center justify-center text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition text-sm font-bold cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-12 text-center text-xs font-black text-slate-900 select-none">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      aria-label="Tăng số lượng"
                      className="w-9 h-full flex items-center justify-center text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition text-sm font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Link to Full Product Detail Page */}
                <div className="mt-4 pt-2 text-right">
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={handleClose}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#192841] hover:underline"
                  >
                    <span>Xem đầy đủ thông số & đánh giá</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Actions Bar (Mobile First & Safe Area Optimized) */}
        <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200/90 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {/* Wishlist toggle */}
          <button
            type="button"
            onClick={() => toggleWishlist(product._id)}
            aria-label={isLiked ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
            className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 ${
              isLiked
                ? "bg-rose-50 border-rose-300 text-rose-500 shadow-xs"
                : "border-slate-200 text-slate-500 hover:text-rose-500 hover:border-rose-200 hover:bg-slate-50"
            }`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? "fill-rose-500" : ""}`} />
          </button>

          {/* Add to Cart Button */}
          <button
            type="button"
            onClick={handleAddToCart}
            className="flex-1 h-11 bg-[#192841]/10 hover:bg-[#192841]/20 active:bg-[#192841]/30 text-[#192841] border border-[#192841] rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Thêm Vào Giỏ</span>
          </button>

          {/* Buy Now Button */}
          <button
            type="button"
            onClick={handleBuyNow}
            className="flex-1 h-11 bg-[#192841] hover:bg-[#132034] active:bg-[#0f172a] text-white rounded-xl font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer uppercase tracking-wider active:scale-[0.98]"
          >
            <span>Mua Ngay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
