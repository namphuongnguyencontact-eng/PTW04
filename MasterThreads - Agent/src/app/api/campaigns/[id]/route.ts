import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await prisma.scanCampaign.findUnique({
      where: { id },
      include: {
        posts: {
          include: {
            analysis: true,
            productMatches: {
              include: { product: true },
            },
            comments: true,
          },
          orderBy: { maxOpportunityScore: 'desc' },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy chiến dịch' },
        { status: 404 }
      );
    }

    const parseJson = (s: string | null) => {
      if (!s) return [];
      try {
        return JSON.parse(s);
      } catch {
        return [];
      }
    };

    return NextResponse.json({
      success: true,
      data: {
        ...campaign,
        mainKeywords: parseJson(campaign.mainKeywords),
        secondaryKeywords: parseJson(campaign.secondaryKeywords),
        targetCategoryIds: parseJson(campaign.targetCategoryIds),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.scanCampaign.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Đã xóa chiến dịch' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
