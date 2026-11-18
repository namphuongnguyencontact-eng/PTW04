import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const CampaignInputSchema = z.object({
  name: z.string().min(1, 'Tên chiến dịch không được để trống'),
  topic: z.string().min(1, 'Chủ đề chiến dịch không được để trống'),
  mainKeywords: z.array(z.string()).or(z.string()).optional(),
  secondaryKeywords: z.array(z.string()).or(z.string()).optional(),
  language: z.string().default('vi'),
  dateRange: z.string().optional().nullable(),
  targetPostsCount: z.number().min(1).max(200).default(30),
  minEngagement: z.number().min(0).default(50),
  targetCategoryIds: z.array(z.string()).optional(),
});

function serializeArray(field: any): string {
  if (!field) return JSON.stringify([]);
  if (Array.isArray(field)) {
    return JSON.stringify(field.map((s) => String(s).trim()).filter(Boolean));
  }
  if (typeof field === 'string') {
    return JSON.stringify(
      field
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  return JSON.stringify([]);
}

export async function GET(request: NextRequest) {
  try {
    const campaigns = await prisma.scanCampaign.findMany({
      include: {
        _count: {
          select: { posts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = campaigns.map((c) => {
      const parseJson = (s: string | null) => {
        if (!s) return [];
        try {
          return JSON.parse(s);
        } catch {
          return [];
        }
      };

      return {
        ...c,
        mainKeywords: parseJson(c.mainKeywords),
        secondaryKeywords: parseJson(c.secondaryKeywords),
        targetCategoryIds: parseJson(c.targetCategoryIds),
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi lấy danh sách chiến dịch' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CampaignInputSchema.parse(body);

    const campaign = await prisma.scanCampaign.create({
      data: {
        name: validated.name,
        topic: validated.topic,
        mainKeywords: serializeArray(validated.mainKeywords),
        secondaryKeywords: serializeArray(validated.secondaryKeywords),
        language: validated.language,
        dateRange: validated.dateRange || null,
        targetPostsCount: validated.targetPostsCount,
        minEngagement: validated.minEngagement,
        targetCategoryIds: JSON.stringify(validated.targetCategoryIds || []),
        status: 'PENDING',
      },
    });

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Dữ liệu không hợp lệ' },
      { status: 400 }
    );
  }
}
