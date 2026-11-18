import { NextRequest, NextResponse } from 'next/server';
import { ThreadsCrawler } from '@/lib/crawler/threads-crawler';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL không hợp lệ' },
        { status: 400 }
      );
    }

    if (!url.includes('threads.net') && !url.includes('threads.com')) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp URL bài viết Threads hợp lệ (threads.com hoặc threads.net)' },
        { status: 400 }
      );
    }

    const postData = await ThreadsCrawler.scrapePostDetails(url);
    if (!postData) {
      return NextResponse.json(
        { success: false, error: 'Không thể trích xuất dữ liệu từ bài viết này. Vui lòng kiểm tra lại URL.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: postData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi quét bài viết' },
      { status: 500 }
    );
  }
}
