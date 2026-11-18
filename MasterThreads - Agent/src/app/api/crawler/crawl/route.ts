import { NextRequest, NextResponse } from 'next/server';
import {
  ThreadsCrawler,
  CrawlOptions,
  activeCrawlJobs,
} from '@/lib/crawler/threads-crawler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mode = 'feed',
      query = '',
      urls = [],
      limit = 0,
      continuous = false,
      jobId = `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      targetCategories = [],
      minLikes = 0,
      minReplies = 0,
      minViews = 0,
      minEngagement = 0,
      onlyYear2026 = true,
      vietnamOnly = true,
      campaignId = null,
      autoAnalyze = true,
      stream = false,
    } = body;

    // Create abort controller for this crawl job
    const abortController = new AbortController();
    activeCrawlJobs.set(jobId, {
      abortController,
      isRunning: true,
    });

    const crawlOptions: CrawlOptions = {
      mode,
      query,
      urls,
      limit: Number(limit) || 0,
      continuous: continuous || Number(limit) === 0,
      jobId,
      abortSignal: abortController.signal,
      targetCategories: Array.isArray(targetCategories)
        ? targetCategories.filter((c: any) => typeof c === 'string' && c.trim().length > 0)
        : [],
      minLikes: Number(minLikes) || 0,
      minReplies: Number(minReplies) || 0,
      minViews: Number(minViews) || 0,
      minEngagement: Number(minEngagement) || 0,
      onlyYear2026: onlyYear2026 !== false,
      vietnamOnly: vietnamOnly !== false,
      campaignId,
      autoAnalyze,
    };

    if (stream) {
      const responseStream = new TransformStream();
      const writer = responseStream.writable.getWriter();
      const encoder = new TextEncoder();

      const sendEvent = async (event: string, data: any) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          await writer.write(encoder.encode(payload));
        } catch {}
      };

      (async () => {
        try {
          await sendEvent('start', {
            jobId,
            message: 'Bắt đầu tiến trình quét dữ liệu Threads...',
            continuous: crawlOptions.continuous,
          });

          const result = await ThreadsCrawler.crawlAndIngest(
            crawlOptions,
            async (progress) => {
              await sendEvent('progress', progress);
            }
          );

          await sendEvent('complete', result);
        } catch (err: any) {
          await sendEvent('error', { error: err.message });
        } finally {
          activeCrawlJobs.delete(jobId);
          try {
            await writer.close();
          } catch {}
        }
      })();

      return new Response(responseStream.readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming standard response
    try {
      const result = await ThreadsCrawler.crawlAndIngest(crawlOptions);
      return NextResponse.json({
        success: true,
        data: result,
      });
    } finally {
      activeCrawlJobs.delete(jobId);
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi trong quá trình quét Threads' },
      { status: 500 }
    );
  }
}
