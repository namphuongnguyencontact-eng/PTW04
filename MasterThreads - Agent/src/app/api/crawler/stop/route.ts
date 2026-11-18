import { NextRequest, NextResponse } from 'next/server';
import { activeCrawlJobs } from '@/lib/crawler/threads-crawler';

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json().catch(() => ({}));

    if (jobId && activeCrawlJobs.has(jobId)) {
      const job = activeCrawlJobs.get(jobId);
      job?.abortController.abort();
      activeCrawlJobs.delete(jobId);
      return NextResponse.json({
        success: true,
        message: `Đã dừng tiến trình quét ${jobId}.`,
      });
    }

    // If no specific jobId provided, stop all active jobs
    let stoppedCount = 0;
    for (const [id, job] of activeCrawlJobs.entries()) {
      job.abortController.abort();
      activeCrawlJobs.delete(id);
      stoppedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Đã dừng ${stoppedCount} tiến trình quét đang chạy.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi dừng quét' },
      { status: 500 }
    );
  }
}
