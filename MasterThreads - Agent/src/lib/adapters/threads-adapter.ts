import { prisma } from '../prisma';
import { calculateViralScore } from '../scoring';

export interface ThreadsConnectionStatus {
  isConfigured: boolean;
  isValid: boolean;
  provider: 'OFFICIAL_API' | 'MANUAL_OR_DEMO';
  appId?: string;
  userId?: string;
  scopes: string[];
  rateLimitStatus: {
    callCount: number;
    totalTime: number;
    estimatedLimit: string;
  };
  message: string;
}

export interface IngestedPostData {
  threadsPostId: string;
  postUrl: string;
  authorUsername: string;
  authorName?: string;
  authorAvatarUrl?: string;
  content: string;
  publishedAt: Date;
  likesCount: number;
  repliesCount: number;
  repostsCount: number;
  quotesCount: number;
  viewsCount?: number | null;
  source: 'API' | 'MANUAL_URL' | 'CSV_IMPORT' | 'DEMO_SEED';
  campaignId?: string | null;
  comments?: Array<{
    commentId?: string;
    authorUsername: string;
    content: string;
    likesCount?: number;
    publishedAt?: Date;
  }>;
}

export class ThreadsAdapter {
  /**
   * Check connection status of official Meta Threads API
   */
  static async checkConnection(): Promise<ThreadsConnectionStatus> {
    const tokenSetting = await prisma.appSetting.findUnique({
      where: { key: 'threads_access_token' },
    });
    const appIdSetting = await prisma.appSetting.findUnique({
      where: { key: 'threads_app_id' },
    });
    const userIdSetting = await prisma.appSetting.findUnique({
      where: { key: 'threads_user_id' },
    });

    const accessToken =
      tokenSetting?.value || process.env.THREADS_ACCESS_TOKEN || '';
    const appId = appIdSetting?.value || process.env.THREADS_APP_ID || '';
    const userId = userIdSetting?.value || process.env.THREADS_USER_ID || '';

    if (!accessToken) {
      return {
        isConfigured: false,
        isValid: false,
        provider: 'MANUAL_OR_DEMO',
        appId: appId || undefined,
        userId: userId || undefined,
        scopes: [],
        rateLimitStatus: {
          callCount: 0,
          totalTime: 0,
          estimatedLimit: 'Chưa cấu hình API token',
        },
        message:
          'Chưa cấu hình Threads API Token. Hệ thống đang sử dụng chế độ Nhập bài viết thủ công và Bộ dữ liệu mẫu.',
      };
    }

    try {
      // Test token with Meta Graph API
      const res = await fetch(
        `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${accessToken}`
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return {
          isConfigured: true,
          isValid: false,
          provider: 'OFFICIAL_API',
          appId: appId || undefined,
          scopes: ['threads_basic', 'threads_content_publish'],
          rateLimitStatus: {
            callCount: 0,
            totalTime: 0,
            estimatedLimit: 'Token không hợp lệ hoặc đã hết hạn',
          },
          message: `Lỗi xác thực Meta Threads API: ${errorData?.error?.message || 'Token hết hạn hoặc không có quyền truy cập.'}`,
        };
      }

      const userData = await res.json();
      return {
        isConfigured: true,
        isValid: true,
        provider: 'OFFICIAL_API',
        appId: appId || undefined,
        userId: userData.id,
        scopes: ['threads_basic', 'threads_content_publish', 'threads_read_replies'],
        rateLimitStatus: {
          callCount: 1,
          totalTime: 100,
          estimatedLimit: '250 calls / hour (Meta Graph API Standard)',
        },
        message: `Đã kết nối thành công tài khoản Threads @${userData.username} (${userData.id}).`,
      };
    } catch (err: any) {
      return {
        isConfigured: true,
        isValid: false,
        provider: 'OFFICIAL_API',
        appId: appId || undefined,
        scopes: [],
        rateLimitStatus: {
          callCount: 0,
          totalTime: 0,
          estimatedLimit: 'Không thể kết nối đến máy chủ Meta',
        },
        message: `Không thể kết nối đến máy chủ Meta Graph API: ${err.message}`,
      };
    }
  }

  /**
   * Parse Threads URL to extract post ID or handle
   * Example: https://www.threads.net/@user/post/DA123456789
   */
  static parseThreadsUrl(url: string): { author: string; postId: string } | null {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('threads.net')) return null;

      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      // Path format: /@author/post/CODE
      if (pathSegments.length >= 3 && pathSegments[1] === 'post') {
        const author = pathSegments[0].replace(/^@/, '');
        const postId = pathSegments[2];
        return { author, postId };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Ingest and normalize post data with deduplication and metric calculation
   */
  static async ingestAndSavePost(data: IngestedPostData): Promise<{
    post: any;
    isNew: boolean;
  }> {
    // 1. Calculate viral score and engagement metrics
    const viral = calculateViralScore({
      likesCount: data.likesCount,
      repliesCount: data.repliesCount,
      repostsCount: data.repostsCount,
      quotesCount: data.quotesCount,
      viewsCount: data.viewsCount,
      publishedAt: data.publishedAt,
    });

    // 2. Check if post already exists (deduplication)
    const existingPost = await prisma.threadsPost.findUnique({
      where: { threadsPostId: data.threadsPostId },
      include: { comments: true },
    });

    if (existingPost) {
      // Record metrics snapshot
      await prisma.postMetricsSnapshot.create({
        data: {
          postId: existingPost.id,
          likesCount: data.likesCount,
          repliesCount: data.repliesCount,
          repostsCount: data.repostsCount,
          quotesCount: data.quotesCount,
          viewsCount: data.viewsCount,
        },
      });

      // Update post metrics
      const updatedPost = await prisma.threadsPost.update({
        where: { id: existingPost.id },
        data: {
          likesCount: data.likesCount,
          repliesCount: data.repliesCount,
          repostsCount: data.repostsCount,
          quotesCount: data.quotesCount,
          viewsCount: data.viewsCount,
          engagementCount: viral.engagementCount,
          engagementRate: viral.engagementRate,
          viralScore: viral.viralScore,
          viralClassification: viral.viralClassification,
          viralExplanation: viral.viralExplanation,
        },
      });

      return { post: updatedPost, isNew: false };
    }

    // 3. Create new normalized post
    const newPost = await prisma.$transaction(async (tx) => {
      const created = await tx.threadsPost.create({
        data: {
          threadsPostId: data.threadsPostId,
          postUrl: data.postUrl,
          authorUsername: data.authorUsername,
          authorName: data.authorName,
          authorAvatarUrl: data.authorAvatarUrl,
          content: data.content,
          publishedAt: data.publishedAt,
          source: data.source,
          campaignId: data.campaignId,
          likesCount: data.likesCount,
          repliesCount: data.repliesCount,
          repostsCount: data.repostsCount,
          quotesCount: data.quotesCount,
          viewsCount: data.viewsCount,
          engagementCount: viral.engagementCount,
          engagementRate: viral.engagementRate,
          viralScore: viral.viralScore,
          viralClassification: viral.viralClassification,
          viralExplanation: viral.viralExplanation,
          analysisStatus: 'UNANALYZED',
        },
      });

      // Create snapshot
      await tx.postMetricsSnapshot.create({
        data: {
          postId: created.id,
          likesCount: data.likesCount,
          repliesCount: data.repliesCount,
          repostsCount: data.repostsCount,
          quotesCount: data.quotesCount,
          viewsCount: data.viewsCount,
        },
      });

      // Add comments if provided
      if (data.comments && data.comments.length > 0) {
        for (const c of data.comments) {
          await tx.postComment.create({
            data: {
              postId: created.id,
              commentId: c.commentId || `comm_${Math.random().toString(36).substring(2, 9)}`,
              authorUsername: c.authorUsername,
              content: c.content,
              likesCount: c.likesCount || 0,
              publishedAt: c.publishedAt || new Date(),
            },
          });
        }
      }

      return created;
    });

    return { post: newPost, isNew: true };
  }
}
