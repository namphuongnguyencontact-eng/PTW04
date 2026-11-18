import { NextRequest, NextResponse } from 'next/server';
import { resetDemoDataset } from '@/lib/seed-data';

export async function POST(request: NextRequest) {
  try {
    const result = await resetDemoDataset();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi xóa dữ liệu mẫu' },
      { status: 500 }
    );
  }
}
