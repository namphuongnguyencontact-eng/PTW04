import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { prisma } from '../src/lib/prisma';
import { ThreadsAdapter } from '../src/lib/adapters/threads-adapter';
import {
  ThreadsCrawler,
  isVietnameseText,
  matchCategoriesSemantic,
} from '../src/lib/crawler/threads-crawler';
import { analyzePostById } from '../src/lib/ai/ai-service';

async function runLiveFeedCrawler() {
  console.log('================================================================');
  console.log('🚀 ĐANG MỞ CỬA SỔ CHROME TRỰC QUAN ĐỂ QUÉT NEWFEED THREADS CÁ NHÂN');
  console.log('================================================================');

  // Load existing categories from DB for automatic semantic matching
  const dbCats = await prisma.category.findMany({ select: { name: true } });
  const targetCategories = dbCats.map((c) => c.name);
  if (targetCategories.length === 0) {
    targetCategories.push(
      'Decor phòng ngủ & Bàn học',
      'Phụ kiện công nghệ & Công thái học',
      'Đồ gia dụng thông minh',
      'Thời trang & Phụ kiện',
      'Mỹ phẩm & Chăm sóc da'
    );
  }

  console.log(`📋 Danh mục đối chiếu: [${targetCategories.join(', ')}]`);

  const profileDir = ThreadsCrawler.getProfileDir();

  const executablePath = ThreadsCrawler.getExecutablePath();
  console.log(`🌐 Đường dẫn Chrome: ${executablePath}`);
  console.log(`📁 Thư mục lưu phiên đăng nhập: ${profileDir}`);

  const browser = await ThreadsCrawler.launchBrowser({ headless: false });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  try {
    await page.bringToFront();
  } catch {}

  console.log('\n👉 Đang điều hướng đến https://www.threads.com/ ...');
  await page.goto('https://www.threads.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  console.log('----------------------------------------------------------------');
  console.log('💡 HƯỚNG DẪN:');
  console.log('• Cửa sổ Chrome đang hiển thị trên màn hình của bạn.');
  console.log('• Nếu chưa đăng nhập, bạn có thể đăng nhập tài khoản Threads trên cửa sổ này.');
  console.log('• Phiên đăng nhập sẽ được lưu tự động cho các lần quét sau.');
  console.log('• Hệ thống sẽ tự động quét từng bài viết xuất hiện trên Newfeed của bạn.');
  console.log('----------------------------------------------------------------\n');

  const visitedUrls = new Set<string>();
  let savedCount = 0;

  let loopIteration = 0;

  // Continuous monitoring loop
  while (true) {
    try {
      loopIteration++;
      if (page.isClosed()) {
        console.log('Cửa sổ trình duyệt đã đóng.');
        break;
      }

      // 1. Collect all post links currently visible on user's feed
      const currentLinks: string[] = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll('a[href*="/post/"], a[href*="/t/"]')
        );
        return anchors
          .map((a: any) => a.href)
          .filter((href: string) => href && href.includes('/post/'));
      });

      let foundNewInThisBatch = 0;

      for (const rawUrl of currentLinks) {
        const cleanUrl = rawUrl.replace(/\/(media|embed)\/?$/, '');
        if (visitedUrls.has(cleanUrl)) continue;
        visitedUrls.add(cleanUrl);
        foundNewInThisBatch++;

        console.log(`\n🔍 Phát hiện bài viết mới trên newfeed: ${cleanUrl}`);

        // Scrape details via fast Relay cache / Meta bot headers
        const postDetails = await ThreadsCrawler.scrapePostDetails(cleanUrl);

        if (!postDetails || !postDetails.content) {
          console.log(`⚠️ Không thể lấy nội dung từ: ${cleanUrl}`);
          continue;
        }

        // Filter: Year 2026
        const pubYear = new Date(postDetails.publishedAt).getFullYear();
        if (pubYear !== 2026) {
          console.log(`⏩ [Bỏ qua] Bài viết từ năm ${pubYear} (chỉ lấy bài viết mới năm 2026).`);
          continue;
        }

        // Filter: Vietnam / Vietnamese language
        if (!isVietnameseText(postDetails.content)) {
          console.log(`⏩ [Bỏ qua] Bài viết của @${postDetails.username} không phải tiếng Việt.`);
          continue;
        }

        // Semantic Category Matching
        const categoryMatches = matchCategoriesSemantic(
          postDetails.content,
          postDetails.comments,
          targetCategories
        );

        let matchedCategory = categoryMatches.length > 0 ? categoryMatches[0] : null;

        const postUrl = `https://www.threads.com/@${postDetails.username}/post/${postDetails.code}`;
        const userTags: string[] = [];
        let userNotes = '';

        if (matchedCategory) {
          userTags.push(matchedCategory.category);
          userTags.push(`${matchedCategory.score}% phù hợp`);
          userNotes = `🎯 Phù hợp danh mục: [${matchedCategory.category}] (Độ khớp: ${matchedCategory.score}%).\n💡 Lý do: ${matchedCategory.reason}`;
        }

        // Save to database
        const { post, isNew } = await ThreadsAdapter.ingestAndSavePost({
          threadsPostId: postDetails.code,
          postUrl,
          authorUsername: postDetails.username,
          authorName: postDetails.fullName,
          authorAvatarUrl: postDetails.avatar || undefined,
          content: postDetails.content,
          publishedAt: postDetails.publishedAt,
          likesCount: postDetails.likeCount,
          repliesCount: postDetails.replyCount,
          repostsCount: postDetails.repostCount,
          quotesCount: postDetails.quoteCount,
          viewsCount: postDetails.viewsCount,
          source: 'API',
          comments: postDetails.comments,
        });

        if (matchedCategory) {
          await prisma.threadsPost.update({
            where: { id: post.id },
            data: {
              userTags: JSON.stringify(userTags),
              userNotes: userNotes,
            },
          });
        }

        // Auto AI Analysis
        try {
          await analyzePostById({ postId: post.id });
        } catch {}

        savedCount++;

        console.log(
          `✅ [Đã lưu #${savedCount}] @${postDetails.username} (${postDetails.likeCount} tim, ${postDetails.replyCount} reply)`
        );
        console.log(`   📝 Nội dung: "${postDetails.content.slice(0, 80)}..."`);
        if (matchedCategory) {
          console.log(`   🎯 KHỚP DANH MỤC: [${matchedCategory.category}] (${matchedCategory.score}%)`);
          console.log(`   💡 Lý do: ${matchedCategory.reason}`);
        }
      }

      // Heartbeat message every 5 loops
      if (loopIteration % 5 === 0 && foundNewInThisBatch === 0) {
        console.log(
          `⏳ [Đang trực tiếp quét Newfeed] Đã quét qua ${visitedUrls.size} bài | Đã lưu ${savedCount} bài 2026 VN phù hợp. Hãy lướt newfeed hoặc đăng nhập trên Chrome...`
        );
      }

      // 2. Smoothly scroll down the page to trigger newfeed loading
      await page.evaluate(() => {
        window.scrollBy({ top: 800, behavior: 'smooth' });
      });

      // Wait 3 seconds before checking next batch
      await new Promise((r) => setTimeout(r, 3000));
    } catch (loopErr: any) {
      console.error('Lỗi trong vòng lặp quét:', loopErr.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

runLiveFeedCrawler().catch(console.error);
