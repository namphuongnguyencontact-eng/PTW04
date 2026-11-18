import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ThreadsCrawler } from '@/lib/crawler/threads-crawler';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await prisma.scanCampaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy chiến dịch' },
        { status: 404 }
      );
    }

    // Mark campaign as running
    await prisma.scanCampaign.update({
      where: { id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    // Extract keywords from campaign
    const keywords: string[] = (() => {
      try {
        const main = JSON.parse(campaign.mainKeywords || '[]');
        const sec = JSON.parse(campaign.secondaryKeywords || '[]');
        return [...main, ...sec].filter(Boolean);
      } catch {
        return [];
      }
    })();

    const query = keywords.length > 0 ? keywords[0] : campaign.topic || 'affiliate';

    try {
      // Execute live Threads crawler
      const result = await ThreadsCrawler.crawlAndIngest({
        mode: keywords.length > 0 ? 'search' : 'feed',
        query,
        limit: Math.min(30, campaign.targetPostsCount || 10),
        campaignId: campaign.id,
        autoAnalyze: true,
      });

      await prisma.scanCampaign.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          collectedCount: result.totalSaved,
          validCount: result.totalSaved,
          analyzedCount: result.totalSaved,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Đã quét và lưu trữ thành công ${result.totalSaved} bài viết thực tế từ Threads cho chiến dịch.`,
        collectedCount: result.totalSaved,
        validCount: result.totalSaved,
        analyzedCount: result.totalSaved,
      });
    } catch (crawlErr: any) {
      await prisma.scanCampaign.update({
        where: { id },
        data: {
          status: 'FAILED',
          errorMessage: crawlErr.message || 'Lỗi quét Threads',
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        { success: false, error: crawlErr.message || 'Lỗi quét Threads' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
