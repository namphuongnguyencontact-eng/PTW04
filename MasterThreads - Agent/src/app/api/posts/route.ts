import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ThreadsAdapter } from '@/lib/adapters/threads-adapter';
import { analyzePostById } from '@/lib/ai/ai-service';
import { z } from 'zod';

const IngestPostInputSchema = z.object({
  url: z.string().url('URL không hợp lệ').or(z.literal('')).nullable().optional(),
  content: z.string().min(5, 'Nội dung bài viết quá ngắn').optional(),
  authorUsername: z.string().optional(),
  likesCount: z.number().optional().default(0),
  repliesCount: z.number().optional().default(0),
  repostsCount: z.number().optional().default(0),
  quotesCount: z.number().optional().default(0),
  viewsCount: z.number().nullable().optional(),
  campaignId: z.string().optional(),
  autoAnalyze: z.boolean().default(true),
  comments: z
    .array(
      z.object({
        authorUsername: z.string(),
        content: z.string(),
        likesCount: z.number().default(0),
      })
    )
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const minViralScore = Number(searchParams.get('minViralScore') || '0');
    const minOpportunityScore = Number(
      searchParams.get('minOpportunityScore') || '0'
    );
    const categoryId = searchParams.get('categoryId') || '';
    const productId = searchParams.get('productId') || '';
    const campaignId = searchParams.get('campaignId') || '';
    const isSaved = searchParams.get('isSaved');
    const isDismissed = searchParams.get('isDismissed') === 'true';
    const analysisStatus = searchParams.get('analysisStatus') || '';
    const sort = searchParams.get('sort') || 'opportunity_desc'; // opportunity_desc | viral_desc | engagement_desc | newest
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '30')));

    const where: any = {
      isDismissed: isDismissed,
    };

    if (search) {
      where.OR = [
        { content: { contains: search } },
        { authorUsername: { contains: search } },
      ];
    }

    if (minViralScore > 0) {
      where.viralScore = { gte: minViralScore };
    }

    if (minOpportunityScore > 0) {
      where.maxOpportunityScore = { gte: minOpportunityScore };
    }

    if (isSaved === 'true') {
      where.isSaved = true;
    }

    if (campaignId) {
      where.campaignId = campaignId;
    }

    if (analysisStatus) {
      where.analysisStatus = analysisStatus;
    }

    if (productId) {
      where.productMatches = {
        some: { productId },
      };
    } else if (categoryId) {
      where.productMatches = {
        some: {
          product: { categoryId },
        },
      };
    }

    let orderBy: any = { maxOpportunityScore: 'desc' };
    if (sort === 'viral_desc') {
      orderBy = { viralScore: 'desc' };
    } else if (sort === 'engagement_desc') {
      orderBy = { engagementCount: 'desc' };
    } else if (sort === 'newest') {
      orderBy = { publishedAt: 'desc' };
    }

    const [total, posts] = await Promise.all([
      prisma.threadsPost.count({ where }),
      prisma.threadsPost.findMany({
        where,
        include: {
          campaign: { select: { id: true, name: true } },
          comments: { take: 5 },
          analysis: true,
          productMatches: {
            include: {
              product: {
                include: { category: true },
              },
            },
            orderBy: { opportunityScore: 'desc' },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const formattedPosts = posts.map((post) => {
      const parseJson = (s: string | null) => {
        if (!s) return null;
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      };

      return {
        ...post,
        userTags: parseJson(post.userTags) || [],
        analysis: post.analysis
          ? {
              ...post.analysis,
              mainTopics: parseJson(post.analysis.mainTopics) || [],
              subTopics: parseJson(post.analysis.subTopics) || [],
              painPoints: parseJson(post.analysis.painPoints) || [],
              audienceNeeds: parseJson(post.analysis.audienceNeeds) || [],
              commentThemes: parseJson(post.analysis.commentThemes) || [],
              commentQuestions: parseJson(post.analysis.commentQuestions) || [],
              commentObjections: parseJson(post.analysis.commentObjections) || [],
              commentLimitations: parseJson(post.analysis.commentLimitations) || [],
              analysisLimitations: parseJson(post.analysis.analysisLimitations) || [],
            }
          : null,
        productMatches: post.productMatches.map((m) => ({
          ...m,
          evidence: parseJson(m.evidence) || [],
          riskNotes: parseJson(m.riskNotes) || [],
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedPosts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi lấy danh sách bài viết' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = IngestPostInputSchema.parse(body);

    let author = validated.authorUsername || 'threads.user';
    let postId = `post_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let postUrl = validated.url || `https://www.threads.net/@${author}/post/${postId}`;

    if (validated.url) {
      const parsedUrl = ThreadsAdapter.parseThreadsUrl(validated.url);
      if (parsedUrl) {
        author = parsedUrl.author;
        postId = parsedUrl.postId;
      }
    }

    if (!validated.content && !validated.url) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng nhập nội dung bài viết hoặc URL Threads' },
        { status: 400 }
      );
    }

    const { post, isNew } = await ThreadsAdapter.ingestAndSavePost({
      threadsPostId: postId,
      postUrl,
      authorUsername: author,
      content: validated.content || 'Nội dung bài viết Threads',
      publishedAt: new Date(),
      likesCount: validated.likesCount,
      repliesCount: validated.repliesCount,
      repostsCount: validated.repostsCount,
      quotesCount: validated.quotesCount,
      viewsCount: validated.viewsCount,
      source: validated.url ? 'MANUAL_URL' : 'API',
      campaignId: validated.campaignId || null,
      comments: validated.comments,
    });

    if (validated.autoAnalyze) {
      try {
        await analyzePostById({ postId: post.id });
      } catch (err: any) {
        console.error('Error during autoAnalyze:', err);
      }
    }

    const resultPost = await prisma.threadsPost.findUnique({
      where: { id: post.id },
      include: {
        analysis: true,
        productMatches: { include: { product: true } },
        comments: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: isNew ? 'Đã thêm bài viết thành công' : 'Đã cập nhật bài viết hiện có',
        data: resultPost,
      },
      { status: isNew ? 201 : 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi thêm bài viết' },
      { status: 400 }
    );
  }
}
