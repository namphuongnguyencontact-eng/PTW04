import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Threads Affiliate Intelligence — Phân tích lan truyền & Đối chiếu sản phẩm',
  description:
    'Công cụ Social Listening & Affiliate Marketing phát hiện bài viết Threads có mức độ lan truyền cao, phân tích insight và đối chiếu cơ hội affiliate tự nhiên.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full bg-[#FEFAF3] text-[#222B24] antialiased selection:bg-[#B8CFB3] selection:text-[#222B24]">
        {children}
      </body>
    </html>
  );
}
