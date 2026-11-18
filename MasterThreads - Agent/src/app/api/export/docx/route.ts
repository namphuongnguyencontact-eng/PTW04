import { NextRequest, NextResponse } from 'next/server';
import { ThreadsCommentScraper } from '@/lib/crawler/threads-comment-scraper';
import { generateThreadsPostDocx, PostDetailsForExport } from '@/lib/docx/threads-docx-generator';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let postData: PostDetailsForExport | null = null;

    if (body.postData) {
      postData = body.postData;
    } else if (body.postId) {
      const dbPost = await prisma.threadsPost.findUnique({
        where: { id: body.postId },
        include: { comments: true },
      });
      if (dbPost) {
        postData = {
          code: dbPost.threadsPostId,
          url: dbPost.postUrl,
          username: dbPost.authorUsername,
          fullName: dbPost.authorName || dbPost.authorUsername,
          avatar: dbPost.authorAvatarUrl,
          content: dbPost.content,
          likeCount: dbPost.likesCount,
          replyCount: dbPost.repliesCount,
          repostCount: dbPost.repostsCount,
          quoteCount: dbPost.quotesCount,
          viewsCount: dbPost.viewsCount,
          publishedAt: dbPost.publishedAt,
          comments: dbPost.comments.map((c) => ({
            id: c.id,
            authorUsername: c.authorUsername,
            content: c.content,
            likesCount: c.likesCount,
            time: c.publishedAt ? c.publishedAt.toISOString() : undefined,
            commentUrl: c.commentId && !c.commentId.startsWith('comm_') ? `https://www.threads.net/@${c.authorUsername}/post/${c.commentId}` : undefined,
          })),
        };
      }
    } else if (body.url) {
      postData = await ThreadsCommentScraper.scrapePostAndAllComments({
        url: body.url,
        mode: body.mode || 'deep',
        maxComments: body.maxComments || 0,
      });
    }

    if (!postData) {
      return NextResponse.json(
        { success: false, error: 'Dữ liệu bài viết không hợp lệ hoặc không tìm thấy bài viết.' },
        { status: 400 }
      );
    }

    const docxBuffer = await generateThreadsPostDocx(postData);
    const filename = `threads_${postData.username || 'post'}_${postData.code || Date.now()}.docx`;

    return new NextResponse(new Uint8Array(docxBuffer) as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': docxBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating docx:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi tạo file Word (.docx)' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const postId = searchParams.get('postId');
    const mode = (searchParams.get('mode') as 'fast' | 'deep') || 'deep';
    const maxComments = parseInt(searchParams.get('maxComments') || '0', 10);

    let postData: PostDetailsForExport | null = null;

    if (postId) {
      const dbPost = await prisma.threadsPost.findUnique({
        where: { id: postId },
        include: { comments: true },
      });
      if (dbPost) {
        postData = {
          code: dbPost.threadsPostId,
          url: dbPost.postUrl,
          username: dbPost.authorUsername,
          fullName: dbPost.authorName || dbPost.authorUsername,
          avatar: dbPost.authorAvatarUrl,
          content: dbPost.content,
          likeCount: dbPost.likesCount,
          replyCount: dbPost.repliesCount,
          repostCount: dbPost.repostsCount,
          quoteCount: dbPost.quotesCount,
          viewsCount: dbPost.viewsCount,
          publishedAt: dbPost.publishedAt,
          comments: dbPost.comments.map((c) => ({
            id: c.id,
            authorUsername: c.authorUsername,
            content: c.content,
            likesCount: c.likesCount,
            time: c.publishedAt ? c.publishedAt.toISOString() : undefined,
            commentUrl: c.commentId && !c.commentId.startsWith('comm_') ? `https://www.threads.net/@${c.authorUsername}/post/${c.commentId}` : undefined,
          })),
        };
      }
    } else if (url) {
      postData = await ThreadsCommentScraper.scrapePostAndAllComments({
        url,
        mode,
        maxComments,
      });
    }

    if (!postData) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy bài viết hoặc thiếu URL/postId hợp lệ.' },
        { status: 400 }
      );
    }

    const docxBuffer = await generateThreadsPostDocx(postData);
    const filename = `threads_${postData.username || 'post'}_${postData.code || Date.now()}.docx`;

    return new NextResponse(new Uint8Array(docxBuffer) as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': docxBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error exporting docx via GET:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi trích xuất và tạo file Word' },
      { status: 500 }
    );
  }
}
