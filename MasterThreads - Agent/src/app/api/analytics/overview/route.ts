import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const [
      totalPosts,
      totalAnalyzed,
      postsWithMatch,
      highOpportunityPosts,
      completedCampaigns,
      activeProducts,
      allPosts,
      categoriesWithProducts,
      recentOpportunities,
    ] = await Promise.all([
      prisma.threadsPost.count(),
      prisma.threadsPost.count({ where: { analysisStatus: 'ANALYZED' } }),
      prisma.threadsPost.count({
        where: {
          productMatches: { some: {} },
        },
      }),
      prisma.threadsPost.count({
        where: { maxOpportunityScore: { gte: 75 } },
      }),
      prisma.scanCampaign.count({ where: { status: 'COMPLETED' } }),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.threadsPost.findMany({
        select: {
          id: true,
          publishedAt: true,
          viralScore: true,
          maxOpportunityScore: true,
          analysis: { select: { mainTopics: true } },
        },
      }),
      prisma.category.findMany({
        include: {
          products: {
            include: {
              _count: { select: { productMatches: true } },
            },
          },
        },
      }),
      prisma.threadsPost.findMany({
        where: {
          maxOpportunityScore: { gt: 0 },
        },
        include: {
          productMatches: {
            include: {
              product: { include: { category: true } },
            },
            orderBy: { opportunityScore: 'desc' },
            take: 1,
          },
          analysis: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
    ]);

    // 1. Viral score distribution
    const viralDistribution = [
      { range: '0-20', label: 'Tương tác thấp', count: 0 },
      { range: '21-40', label: 'Tiềm năng', count: 0 },
      { range: '41-60', label: 'Đang tăng trưởng', count: 0 },
      { range: '61-80', label: 'Tương tác cao', count: 0 },
      { range: '81-100', label: 'Viral nổi bật', count: 0 },
    ];

    // 2. Opportunity score distribution
    const opportunityDistribution = [
      { range: '0-20', label: 'Không phù hợp', count: 0 },
      { range: '21-40', label: 'Liên quan yếu', count: 0 },
      { range: '41-60', label: 'Cơ hội trung bình', count: 0 },
      { range: '61-80', label: 'Cơ hội tốt', count: 0 },
      { range: '81-100', label: 'Cơ hội xuất sắc', count: 0 },
    ];

    // 3. Topics frequency
    const topicFrequencyMap: Record<string, number> = {};

    // 4. Posts by day (last 7 days or recent dates)
    const postsByDayMap: Record<string, number> = {};

    for (const post of allPosts) {
      // Viral bin
      const v = post.viralScore;
      if (v <= 20) viralDistribution[0].count++;
      else if (v <= 40) viralDistribution[1].count++;
      else if (v <= 60) viralDistribution[2].count++;
      else if (v <= 80) viralDistribution[3].count++;
      else viralDistribution[4].count++;

      // Opportunity bin
      const opp = post.maxOpportunityScore;
      if (opp <= 20) opportunityDistribution[0].count++;
      else if (opp <= 40) opportunityDistribution[1].count++;
      else if (opp <= 60) opportunityDistribution[2].count++;
      else if (opp <= 80) opportunityDistribution[3].count++;
      else opportunityDistribution[4].count++;

      // Topics
      if (post.analysis?.mainTopics) {
        try {
          const topics = JSON.parse(post.analysis.mainTopics);
          if (Array.isArray(topics)) {
            for (const t of topics) {
              topicFrequencyMap[t] = (topicFrequencyMap[t] || 0) + 1;
            }
          }
        } catch {}
      }

      // Date
      const dayStr = new Date(post.publishedAt).toLocaleDateString('vi-VN', {
        month: '2-digit',
        day: '2-digit',
      });
      postsByDayMap[dayStr] = (postsByDayMap[dayStr] || 0) + 1;
    }

    const postsOverTime = Object.entries(postsByDayMap).map(([date, count]) => ({
      date,
      count,
    }));

    const topTopics = Object.entries(topicFrequencyMap)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const categoryPerformance = categoriesWithProducts.map((cat) => {
      const matchCount = cat.products.reduce(
        (sum, p) => sum + p._count.productMatches,
        0
      );
      return {
        id: cat.id,
        name: cat.name,
        color: cat.color || '#84A282',
        productCount: cat.products.length,
        matchCount,
      };
    }).sort((a, b) => b.matchCount - a.matchCount);

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          totalPosts,
          totalAnalyzed,
          postsWithMatch,
          highOpportunityPosts,
          completedCampaigns,
          activeProducts,
        },
        charts: {
          postsOverTime,
          viralDistribution,
          opportunityDistribution,
          categoryPerformance,
          topTopics,
        },
        recentOpportunities: recentOpportunities.map((p) => ({
          id: p.id,
          postUrl: p.postUrl,
          authorUsername: p.authorUsername,
          content: p.content,
          publishedAt: p.publishedAt,
          viralScore: p.viralScore,
          opportunityScore: p.maxOpportunityScore,
          userNotes: p.userNotes,
          userTags: p.userTags,
          topMatch: p.productMatches[0]
            ? {
                productName: p.productMatches[0].product.name,
                categoryName: p.productMatches[0].product.category.name,
                score: p.productMatches[0].opportunityScore,
                reason: p.productMatches[0].reason,
                affiliateAngle: p.productMatches[0].affiliateAngle,
                matchType: p.productMatches[0].matchType,
              }
            : null,
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi lấy dữ liệu thống kê' },
      { status: 500 }
    );
  }
}
