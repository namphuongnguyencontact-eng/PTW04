import { NextRequest, NextResponse } from 'next/server';
import { analyzePostById } from '@/lib/ai/ai-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const forceProvider = body?.provider;

    const result = await analyzePostById({
      postId: id,
      forceProvider,
    });

    return NextResponse.json({
      success: true,
      message: 'Phân tích AI hoàn tất.',
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi trong quá trình phân tích AI' },
      { status: 500 }
    );
  }
}
