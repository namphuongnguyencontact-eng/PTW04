import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { ThreadsAdapter } from '../src/lib/adapters/threads-adapter';
import {
  ThreadsCrawler,
  matchCategoriesSemantic,
  isVietnameseText,
} from '../src/lib/crawler/threads-crawler';
import { prisma } from '../src/lib/prisma';
import { analyzePostById } from '../src/lib/ai/ai-service';

async function launchLiveFeedScanner() {
  console.log('--- KHỞI CHẠY TRÌNH DUYỆT CHROME HIỂN THỊ (HEADFUL) ---');

  const profileDir = ThreadsCrawler.getProfileDir();

  const browser = await ThreadsCrawler.launchBrowser({ headless: false });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  console.log('Đang mở https://www.threads.com/ trên cửa sổ trình duyệt...');
  await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });

  console.log('Cửa sổ đã mở! Bắt đầu giám sát và quét newfeed...');

  const visitedUrls = new Set<string>();
  let savedCount = 0;

  // Monitor and scroll loop
  const interval = setInterval(async () => {
    try {
      if (page.isClosed()) {
        clearInterval(interval);
        return;
      }

      // Extract all post links currently visible on user's newsfeed
      const links: string[] = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/post/"]'));
        return anchors.map((a: any) => a.href);
      });

      for (const rawLink of links) {
        const cleanUrl = rawLink.replace(/\/(media|embed)\/?$/, '');
        if (visitedUrls.has(cleanUrl)) continue;
        visitedUrls.add(cleanUrl);

        console.log(`\n🔍 Phát hiện bài viết mới trên newfeed: ${cleanUrl}`);

        // Scrape details from DOM directly or via fetch
        const postData = await page.evaluate((targetUrl: string) => {
          const postLink = document.querySelector(`a[href*="${targetUrl.split('/').pop()}"]`);
          if (!postLink) return null;

          // Find container
          let container: any = postLink;
          for (let i = 0; i < 7; i++) {
            if (container && container.parentElement) {
              container = container.parentElement;
            }
          }

          if (!container) return null;

          const textEl = container.innerText || '';
          return {
            text: textEl.slice(0, 300),
          };
        }, cleanUrl);

        console.log(` -> Đang xử lý nội dung...`);
      }

      // Smooth subtle scroll down
      await page.evaluate(() => {
        window.scrollBy({ top: 600, behavior: 'smooth' });
      });
    } catch (e: any) {
      console.error('Lỗi khi quét newfeed:', e.message);
    }
  }, 4000);
}

launchLiveFeedScanner().catch(console.error);
