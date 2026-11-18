'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Flame,
  Package,
  FolderTree,
  BrainCircuit,
  Radio,
  Bookmark,
  Settings,
  Sparkles,
  ExternalLink,
  FileText,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/export-word', label: 'Quét & Xuất Word', icon: FileText },
  { href: '/opportunities', label: 'Bài viết tiềm năng', icon: Flame },
  { href: '/products', label: 'Sản phẩm của tôi', icon: Package },
  { href: '/categories', label: 'Danh mục sản phẩm', icon: FolderTree },
  { href: '/ai-analysis', label: 'Phân tích AI', icon: BrainCircuit },
  { href: '/campaigns', label: 'Chiến dịch quét', icon: Radio },
  { href: '/saved-posts', label: 'Bài viết đã lưu', icon: Bookmark },
  { href: '/settings', label: 'Cài đặt và kết nối', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 bg-[#F6E2E9] border-r border-[#84A282]/20 flex flex-col justify-between min-h-screen">
      <div>
        {/* App Brand Header */}
        <div className="p-5 border-b border-[#84A282]/20">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#84A282] flex items-center justify-center text-[#FEFAF3] shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-[#222B24] leading-tight">
                Threads Affiliate
              </h1>
              <p className="text-[11px] font-medium text-[#5E6D62] tracking-wide uppercase">
                Intelligence
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation items */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#84A282] text-[#FEFAF3] shadow-sm font-semibold'
                    : 'text-[#222B24] hover:bg-[#FEFAF3]/80 hover:text-[#84A282]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-[#FEFAF3]' : 'text-[#5E6D62]'
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Quick Badge */}
      <div className="p-4 m-3 rounded-2xl bg-[#FEFAF3]/90 border border-[#84A282]/20 shadow-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-[#5E6D62] uppercase tracking-wider">
            Múi giờ
          </span>
          <span className="text-[11px] font-bold text-[#84A282] bg-[#B8CFB3]/30 px-2 py-0.5 rounded-full">
            GMT+7
          </span>
        </div>
        <p className="text-xs text-[#222B24] font-medium">Asia/Ho_Chi_Minh</p>
        <div className="mt-3 pt-2.5 border-t border-[#84A282]/15 flex items-center justify-between text-[11px] text-[#5E6D62]">
          <span>Phiên bản v1.0.0</span>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>
      </div>
    </aside>
  );
}
