import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ProductInputSchema = z.object({
  name: z.string().min(1, 'Tên sản phẩm không được để trống'),
  categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
  brand: z.string().optional().nullable(),
  description: z.string().min(1, 'Mô tả sản phẩm không được để trống'),
  problemsSolved: z.array(z.string()).or(z.string()).optional(),
  targetAudience: z.array(z.string()).or(z.string()).optional(),
  typicalSituations: z.array(z.string()).or(z.string()).optional(),
  keywords: z.array(z.string()).or(z.string()).optional(),
  synonyms: z.array(z.string()).or(z.string()).optional(),
  negativeKeywords: z.array(z.string()).or(z.string()).optional(),
  price: z.number().nullable().optional(),
  affiliateUrl: z.string().url('Link affiliate không hợp lệ').or(z.literal('')).nullable().optional(),
  originalUrl: z.string().url('Link gốc không hợp lệ').or(z.literal('')).nullable().optional(),
  platform: z.string().default('Shopee'),
  notes: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

function serializeArrayField(field: any): string {
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
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const status = searchParams.get('status') || '';
    const platform = searchParams.get('platform') || '';

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { brand: { contains: search } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (status) {
      where.status = status;
    }

    if (platform) {
      where.platform = platform;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        _count: {
          select: { productMatches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format parsed lists for easy frontend consumption
    const formatted = products.map((p) => {
      const parseJson = (s: string | null) => {
        if (!s) return [];
        try {
          return JSON.parse(s);
        } catch {
          return [];
        }
      };

      return {
        ...p,
        problemsSolved: parseJson(p.problemsSolved),
        targetAudience: parseJson(p.targetAudience),
        typicalSituations: parseJson(p.typicalSituations),
        keywords: parseJson(p.keywords),
        synonyms: parseJson(p.synonyms),
        negativeKeywords: parseJson(p.negativeKeywords),
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi lấy danh sách sản phẩm' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ProductInputSchema.parse(body);

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: validated.categoryId },
    });
    if (!category) {
      return NextResponse.json(
        { success: false, error: 'Danh mục không tồn tại' },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name: validated.name,
        categoryId: validated.categoryId,
        brand: validated.brand,
        description: validated.description,
        problemsSolved: serializeArrayField(validated.problemsSolved),
        targetAudience: serializeArrayField(validated.targetAudience),
        typicalSituations: serializeArrayField(validated.typicalSituations),
        keywords: serializeArrayField(validated.keywords),
        synonyms: serializeArrayField(validated.synonyms),
        negativeKeywords: serializeArrayField(validated.negativeKeywords),
        price: validated.price,
        affiliateUrl: validated.affiliateUrl || null,
        originalUrl: validated.originalUrl || null,
        platform: validated.platform,
        notes: validated.notes,
        status: validated.status,
      },
      include: { category: true },
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Dữ liệu không hợp lệ' },
      { status: 400 }
    );
  }
}
