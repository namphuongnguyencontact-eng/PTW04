import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });

    const parseList = (s: string | null) => {
      if (!s) return '';
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr.join(', ') : '';
      } catch {
        return '';
      }
    };

    const csvRows: string[] = [
      [
        'ID',
        'Tên sản phẩm',
        'Danh mục',
        'Thương hiệu',
        'Mô tả',
        'Vấn đề giải quyết',
        'Khách hàng mục tiêu',
        'Tình huống sử dụng',
        'Từ khóa liên quan',
        'Giá',
        'Link Affiliate',
        'Sàn thương mại',
        'Trạng thái',
      ]
        .map((h) => `"${h}"`)
        .join(','),
    ];

    for (const p of products) {
      const row = [
        p.id,
        p.name,
        p.category.name,
        p.brand || '',
        p.description.replace(/"/g, '""'),
        parseList(p.problemsSolved).replace(/"/g, '""'),
        parseList(p.targetAudience).replace(/"/g, '""'),
        parseList(p.typicalSituations).replace(/"/g, '""'),
        parseList(p.keywords).replace(/"/g, '""'),
        p.price ? p.price.toString() : '',
        p.affiliateUrl || '',
        p.platform,
        p.status,
      ].map((cell) => `"${cell || ''}"`);

      csvRows.push(row.join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\r\n'); // UTF-8 BOM for Excel compatibility

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="threads-affiliate-products-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
