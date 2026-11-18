import { create } from "zustand";
import { ProductItem } from "@/components/shop/ProductCard";

interface QuickViewState {
  product: ProductItem | null;
  isOpen: boolean;
  openQuickView: (product: ProductItem) => void;
  closeQuickView: () => void;
}

export const useQuickViewStore = create<QuickViewState>((set) => ({
  product: null,
  isOpen: false,
  openQuickView: (product) => set({ product, isOpen: true }),
  closeQuickView: () => set({ product: null, isOpen: false }),
}));
