import { NextRequest, NextResponse } from 'next/server';
import { seedDemoDataset } from '@/lib/seed-data';

export async function POST(request: NextRequest) {
  try {
    const result = await seedDemoDataset();
    return NextResponse.json({
      success: true,
      message: `Đã nạp thành công bộ dữ liệu mẫu gồm ${result.productsCount} sản phẩm, ${result.postsCount} bài viết và các phân tích AI tương ứng.`,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi nạp dữ liệu mẫu' },
      { status: 500 }
    );
  }
}
