import { NextRequest, NextResponse } from 'next/server';
import { ThreadsCommentScraper } from '@/lib/crawler/threads-comment-scraper';

export async function POST(request: NextRequest) {
  try {
    const { url, mode = 'deep', maxComments = 0 } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp link bài viết Threads hợp lệ.' },
        { status: 400 }
      );
    }

    if (!url.includes('threads.net') && !url.includes('threads.com')) {
      return NextResponse.json(
        { success: false, error: 'Đường dẫn phải thuộc nền tảng Threads (threads.net hoặc threads.com).' },
        { status: 400 }
      );
    }

    const postData = await ThreadsCommentScraper.scrapePostAndAllComments({
      url,
      mode,
      maxComments: Number(maxComments) || 0,
    });

    return NextResponse.json({
      success: true,
      data: postData,
    });
  } catch (error: any) {
    console.error('Error scraping post and comments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi quét bài viết và bình luận.' },
      { status: 500 }
    );
  }
}
