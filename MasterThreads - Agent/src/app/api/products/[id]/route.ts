import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  brand: z.string().optional().nullable(),
  description: z.string().min(1).optional(),
  problemsSolved: z.array(z.string()).or(z.string()).optional(),
  targetAudience: z.array(z.string()).or(z.string()).optional(),
  typicalSituations: z.array(z.string()).or(z.string()).optional(),
  keywords: z.array(z.string()).or(z.string()).optional(),
  synonyms: z.array(z.string()).or(z.string()).optional(),
  negativeKeywords: z.array(z.string()).or(z.string()).optional(),
  price: z.number().nullable().optional(),
  affiliateUrl: z.string().nullable().optional(),
  originalUrl: z.string().nullable().optional(),
  platform: z.string().optional(),
  notes: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        productMatches: {
          include: {
            post: true,
          },
          orderBy: { opportunityScore: 'desc' },
          take: 10,
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy sản phẩm' },
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
        ...product,
        problemsSolved: parseJson(product.problemsSolved),
        targetAudience: parseJson(product.targetAudience),
        typicalSituations: parseJson(product.typicalSituations),
        keywords: parseJson(product.keywords),
        synonyms: parseJson(product.synonyms),
        negativeKeywords: parseJson(product.negativeKeywords),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = UpdateProductSchema.parse(body);

    const updateData: any = { ...validated };

    if (validated.problemsSolved !== undefined) {
      updateData.problemsSolved = serializeArrayField(validated.problemsSolved);
    }
    if (validated.targetAudience !== undefined) {
      updateData.targetAudience = serializeArrayField(validated.targetAudience);
    }
    if (validated.typicalSituations !== undefined) {
      updateData.typicalSituations = serializeArrayField(validated.typicalSituations);
    }
    if (validated.keywords !== undefined) {
      updateData.keywords = serializeArrayField(validated.keywords);
    }
    if (validated.synonyms !== undefined) {
      updateData.synonyms = serializeArrayField(validated.synonyms);
    }
    if (validated.negativeKeywords !== undefined) {
      updateData.negativeKeywords = serializeArrayField(validated.negativeKeywords);
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Đã xóa sản phẩm' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
