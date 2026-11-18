import { prisma } from '../src/lib/prisma';
import { ThreadsCrawler } from '../src/lib/crawler/threads-crawler';
import { analyzePostById } from '../src/lib/ai/ai-service';

async function main() {
  console.log('--- BẮT ĐẦU DỌN DẸP BÀI VIẾT GIẢ & QUÉT BÀI VIẾT THỰC TẾ TỪ THREADS ---');

  // 1. Remove fake demo posts with non-existent URLs
  const fakePosts = await prisma.threadsPost.findMany({
    where: {
      OR: [
        { threadsPostId: { startsWith: 'C4_demo' } },
        { threadsPostId: { startsWith: 'post_' } },
        { postUrl: { contains: 'C4_demo' } },
        { postUrl: { contains: 'post_mv' } },
      ],
    },
  });

  console.log(`Tìm thấy ${fakePosts.length} bài viết giả lập cần dọn dẹp...`);
  for (const fp of fakePosts) {
    await prisma.threadsPost.delete({ where: { id: fp.id } });
    console.log(` -> Đã xóa bài viết giả: ${fp.threadsPostId} (${fp.postUrl})`);
  }

  // 2. Crawl REAL posts using ThreadsCrawler with relevant affiliate topics
  const topics = ['phòng trọ', 'decor', 'bàn làm việc'];

  for (const topic of topics) {
    console.log(`\n=== Đang quét Threads với từ khóa: "${topic}" ===`);
    const result = await ThreadsCrawler.crawlAndIngest(
      {
        mode: 'search',
        query: topic,
        limit: 5,
        autoAnalyze: true,
      },
      (prog) => {
        console.log(`[${prog.log.timestamp}] ${prog.log.message}`);
      }
    );
    console.log(`-> Đã lưu ${result.totalSaved} bài viết thực tế cho "${topic}".`);
  }

  // 3. Print out all current posts in database to verify
  const allPosts = await prisma.threadsPost.findMany({
    select: {
      id: true,
      threadsPostId: true,
      authorUsername: true,
      postUrl: true,
      content: true,
      likesCount: true,
      repliesCount: true,
      viralScore: true,
      maxOpportunityScore: true,
      analysisStatus: true,
      productMatches: {
        include: { product: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n======================================================');
  console.log(`TỔNG SỐ BÀI VIẾT THẬT ĐANG CÓ TRONG HỆ THỐNG: ${allPosts.length}`);
  console.log('======================================================');
  allPosts.forEach((p, idx) => {
    console.log(`\n[#${idx + 1}] ID: ${p.threadsPostId} | Tác giả: @${p.authorUsername}`);
    console.log(`URL: ${p.postUrl}`);
    console.log(`Nội dung: ${p.content.slice(0, 100)}...`);
    console.log(`Tương tác: ${p.likesCount} likes | ${p.repliesCount} replies | Viral Score: ${p.viralScore}`);
    console.log(`Opportunity Score: ${p.maxOpportunityScore} | Sản phẩm ghép: ${p.productMatches.length}`);
  });
}

main()
  .catch((e) => {
    console.error('Lỗi thực thi:', e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
