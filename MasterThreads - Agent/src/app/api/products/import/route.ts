import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ImportItemSchema = z.object({
  name: z.string().min(1, 'Thiếu tên sản phẩm'),
  categoryName: z.string().optional(),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  description: z.string().min(1, 'Thiếu mô tả sản phẩm'),
  problemsSolved: z.string().optional(),
  targetAudience: z.string().optional(),
  typicalSituations: z.string().optional(),
  keywords: z.string().optional(),
  synonyms: z.string().optional(),
  negativeKeywords: z.string().optional(),
  price: z.number().or(z.string()).optional(),
  affiliateUrl: z.string().optional(),
  originalUrl: z.string().optional(),
  platform: z.string().default('Shopee'),
  notes: z.string().optional(),
});

function serializeList(text?: string): string {
  if (!text) return JSON.stringify([]);
  return JSON.stringify(
    text
      .split(/[,\n;|]/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, mode = 'commit' } = body; // mode: 'preview' | 'commit'

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Danh sách sản phẩm trống' },
        { status: 400 }
      );
    }

    const categories = await prisma.category.findMany();
    const categoryMapByName = new Map(
      categories.map((c) => [c.name.toLowerCase().trim(), c.id])
    );
    const defaultCategoryId = categories[0]?.id;

    const validatedItems: any[] = [];
    const errors: Array<{ row: number; item: string; error: string }> = [];

    items.forEach((item, index) => {
      try {
        const parsed = ImportItemSchema.parse(item);

        let categoryId = parsed.categoryId;
        if (!categoryId && parsed.categoryName) {
          categoryId = categoryMapByName.get(parsed.categoryName.toLowerCase().trim());
        }
        if (!categoryId) {
          categoryId = defaultCategoryId;
        }

        if (!categoryId) {
          errors.push({
            row: index + 1,
            item: parsed.name,
            error: 'Không tìm thấy danh mục phù hợp và chưa có danh mục mặc định.',
          });
          return;
        }

        const priceNum = parsed.price
          ? Number(String(parsed.price).replace(/[^0-9.]/g, ''))
          : null;

        validatedItems.push({
          name: parsed.name,
          categoryId,
          brand: parsed.brand || null,
          description: parsed.description,
          problemsSolved: serializeList(parsed.problemsSolved),
          targetAudience: serializeList(parsed.targetAudience),
          typicalSituations: serializeList(parsed.typicalSituations),
          keywords: serializeList(parsed.keywords),
          synonyms: serializeList(parsed.synonyms),
          negativeKeywords: serializeList(parsed.negativeKeywords),
          price: priceNum,
          affiliateUrl: parsed.affiliateUrl || null,
          originalUrl: parsed.originalUrl || null,
          platform: parsed.platform || 'Shopee',
          notes: parsed.notes || null,
          status: 'ACTIVE',
        });
      } catch (err: any) {
        errors.push({
          row: index + 1,
          item: item?.name || 'Không rõ',
          error: err.errors?.[0]?.message || err.message,
        });
      }
    });

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        preview: {
          total: items.length,
          validCount: validatedItems.length,
          errorCount: errors.length,
          errors,
          samples: validatedItems.slice(0, 5),
        },
      });
    }

    // Commit mode: insert all valid items
    let createdCount = 0;
    for (const validItem of validatedItems) {
      await prisma.product.create({
        data: validItem,
      });
      createdCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Đã nhập thành công ${createdCount} sản phẩm.`,
      createdCount,
      errors,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi xử lý file import' },
      { status: 500 }
    );
  }
}
