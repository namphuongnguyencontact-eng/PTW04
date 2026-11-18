import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await prisma.scanCampaign.update({
      where: { id },
      data: {
        status: 'PARTIAL',
        errorMessage: 'Người dùng đã hủy chiến dịch thủ công.',
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: campaign });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
