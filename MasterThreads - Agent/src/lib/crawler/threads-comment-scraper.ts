import puppeteer, { Browser } from 'puppeteer-core';
import { ThreadsCrawler } from './threads-crawler';
import { DetailedComment, PostDetailsForExport } from '../docx/threads-docx-generator';

export interface ScrapePostAndCommentsOptions {
  url: string;
  mode?: 'fast' | 'deep';
  maxComments?: number; // 0 or undefined = all available
  headless?: boolean;
  onProgress?: (progress: {
    status: 'starting' | 'navigating' | 'extracting_post' | 'scrolling' | 'completed' | 'error';
    message: string;
    commentsCount?: number;
    totalExpected?: number;
  }) => void;
}

export class ThreadsCommentScraper {
  /**
   * Normalize user input URL to canonical threads.net link
   */
  static normalizeUrl(rawUrl: string): { normalizedUrl: string; shortcode: string } {
    let clean = rawUrl.trim();
    if (!clean.startsWith('http')) {
      clean = 'https://' + clean;
    }
    clean = clean.replace('threads.com', 'threads.net');
    // Remove query params
    const qIdx = clean.indexOf('?');
    if (qIdx !== -1) clean = clean.substring(0, qIdx);

    // Extract shortcode e.g. /post/DeeYRo8k670 or /t/DeeYRo8k670
    const codeMatch = clean.match(/\/(?:post|t)\/([a-zA-Z0-9_-]+)/);
    const shortcode = codeMatch ? codeMatch[1] : '';

    return { normalizedUrl: clean, shortcode };
  }

  /**
   * Parse numerical counter string like '4.3K', '1.2M', '500'
   */
  static parseNumberString(str: string): number {
    if (!str) return 0;
    const clean = str.trim().toUpperCase().replace(/,/g, '');
    if (clean.endsWith('K')) {
      const val = parseFloat(clean.replace('K', ''));
      return isNaN(val) ? 0 : Math.round(val * 1000);
    }
    if (clean.endsWith('M')) {
      const val = parseFloat(clean.replace('M', ''));
      return isNaN(val) ? 0 : Math.round(val * 1000000);
    }
    const val = parseInt(clean, 10);
    return isNaN(val) ? 0 : val;
  }

  /**
   * Scrape post information and ALL comments from a Threads URL.
   */
  static async scrapePostAndAllComments(
    options: ScrapePostAndCommentsOptions
  ): Promise<PostDetailsForExport> {
    const { url, mode = 'deep', maxComments = 0, onProgress } = options;
    const { normalizedUrl, shortcode } = this.normalizeUrl(url);

    if (!shortcode) {
      throw new Error('URL không hợp lệ. Vui lòng cung cấp link bài viết Threads (VD: https://www.threads.net/@user/post/abc)');
    }

    if (onProgress) {
      onProgress({
        status: 'starting',
        message: `Bắt đầu quét bài viết ${shortcode}...`,
      });
    }

    // Step 1: Always attempt to fetch SSR post metadata first for baseline
    let postDetails = await ThreadsCrawler.scrapePostDetails(normalizedUrl);

    // If fast mode is requested, return immediately
    if (mode === 'fast') {
      if (onProgress) {
        onProgress({
          status: 'completed',
          message: `Hoàn tất quét nhanh. Đã thu thập ${postDetails?.comments?.length || 0} bình luận.`,
          commentsCount: postDetails?.comments?.length || 0,
        });
      }

      const formattedComments: DetailedComment[] = (postDetails?.comments || []).map((c) => ({
        authorUsername: c.authorUsername,
        content: c.content,
        likesCount: c.likesCount || 0,
        time: undefined,
        commentUrl: c.commentUrl,
      }));

      return {
        code: shortcode,
        url: normalizedUrl,
        username: postDetails?.username || 'threads.user',
        fullName: postDetails?.fullName || postDetails?.username || 'Threads User',
        avatar: postDetails?.avatar || null,
        content: postDetails?.content || '',
        likeCount: postDetails?.likeCount || 0,
        replyCount: postDetails?.replyCount || 0,
        repostCount: postDetails?.repostCount || 0,
        quoteCount: postDetails?.quoteCount || 0,
        viewsCount: postDetails?.viewsCount || null,
        publishedAt: postDetails?.publishedAt || new Date(),
        scrapedAt: new Date(),
        comments: formattedComments,
      };
    }

    // Step 2: Deep Puppeteer crawler with GraphQL Network Interception + DOM Virtualization Capture
    let browser: Browser | null = null;
    const commentsMap = new Map<string, DetailedComment>();
    const urlAuthor = normalizedUrl.match(/@([a-zA-Z0-9._]+)/)?.[1];
    let domPostInfo: any = null;

    try {
      if (onProgress) {
        onProgress({
          status: 'navigating',
          message: 'Đang khởi chạy trình duyệt để trích xuất toàn bộ dữ liệu & bình luận...',
        });
      }

      browser = await ThreadsCrawler.launchBrowser({
        headless: options.headless ?? true,
      });

      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      await page.setViewport({ width: 1280, height: 1000 });

      // KEY ADVANCEMENT: Intercept all network GraphQL responses
      // Whenever Threads loads batches of comments on scroll or click, intercept and extract JSON
      page.on('response', async (res) => {
        const resUrl = res.url();
        if (
          resUrl.includes('graphql') ||
          resUrl.includes('/api/graphql') ||
          resUrl.includes('/graphql/query')
        ) {
          try {
            const text = await res.text();
            if (
              text.includes('caption') ||
              text.includes('direct_replies') ||
              text.includes('thread_items') ||
              text.includes('reply_threads')
            ) {
              const json = JSON.parse(text);

              const extractFromObj = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;

                // Check if node is a comment / post
                if (obj.caption && obj.user) {
                  const contentText =
                    typeof obj.caption === 'string' ? obj.caption : obj.caption.text;
                  if (contentText && contentText.trim()) {
                    const u = obj.user.username;
                    const cleanText = contentText.trim();

                    // Skip if it matches root post content
                    if (
                      postDetails?.content &&
                      cleanText.includes(postDetails.content.slice(0, 35))
                    ) {
                      return;
                    }

                    const commentCode = obj.code || obj.shortcode;
                    const commentUrl = commentCode
                      ? `https://www.threads.net/@${u}/post/${commentCode}`
                      : undefined;

                    const key = `${u}:${cleanText.slice(0, 50)}`;
                    if (!commentsMap.has(key)) {
                      commentsMap.set(key, {
                        authorUsername: u,
                        authorName: obj.user.full_name || u,
                        authorAvatar: obj.user.profile_pic_url,
                        content: cleanText,
                        likesCount: Number(obj.like_count) || 0,
                        time: obj.taken_at
                          ? new Date(obj.taken_at * 1000).toISOString()
                          : undefined,
                        isSubReply: !!obj.text_post_app_info?.is_reply,
                        commentUrl,
                      });
                    } else if (commentUrl) {
                      const existing = commentsMap.get(key);
                      if (existing && !existing.commentUrl) {
                        existing.commentUrl = commentUrl;
                      }
                    }
                  }
                }

                for (const k of Object.keys(obj)) {
                  extractFromObj(obj[k]);
                }
              };

              extractFromObj(json);
            }
          } catch {}
        }
      });

      if (onProgress) {
        onProgress({
          status: 'navigating',
          message: `Đang tải trang bài viết ${normalizedUrl}...`,
        });
      }

      await page.goto(normalizedUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      // Extract root post metadata from DOM
      domPostInfo = await page.evaluate(() => {
        const firstArticle = document.querySelector('div[data-pressable-container="true"], article');
        if (!firstArticle) return null;

        const userLink = firstArticle.querySelector('a[href^="/@"], a[href*="threads.net/@"], a[href*="threads.com/@"]');
        let username = '';
        if (userLink) {
          const href = userLink.getAttribute('href') || '';
          const m = href.match(/@([a-zA-Z0-9._]+)/);
          if (m) username = m[1];
        }

        const timeEl = firstArticle.querySelector('time');
        const time = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText) : '';

        // Extract content
        const contentEls = Array.from(firstArticle.querySelectorAll('span[dir="auto"], div[dir="auto"]'));
        const textParts: string[] = [];
        for (const ce of contentEls) {
          const t = (ce as HTMLElement).innerText.trim();
          if (!t) continue;
          if (t === username) continue;
          if (t === 'Translate' || t === 'Dịch' || t === 'Xem bản dịch') continue;
          if (/^\d+$/.test(t)) continue;
          if (/^\d+[hdmwy]$/.test(t)) continue;
          if (t.includes('replies') || t.includes('phản hồi')) continue;
          textParts.push(t);
        }

        const img = firstArticle.querySelector(
          'img[alt*="avatar"], img[alt*="ảnh đại diện"], img[src*="cdninstagram"]'
        );
        const avatar = img ? img.getAttribute('src') : null;

        // Extract numbers from buttons
        const allBtns = Array.from(firstArticle.querySelectorAll('div[role="button"], button'));
        const numbers: number[] = [];
        for (const b of allBtns) {
          const txt = (b as HTMLElement).innerText.trim();
          if (/^\d+[KkMm]?$/.test(txt)) {
            let num = 0;
            const clean = txt.toUpperCase();
            if (clean.endsWith('K')) num = Math.round(parseFloat(clean) * 1000);
            else if (clean.endsWith('M')) num = Math.round(parseFloat(clean) * 1000000);
            else num = parseInt(clean);
            if (!isNaN(num)) numbers.push(num);
          }
        }

        return {
          username,
          time,
          avatar,
          content: Array.from(new Set(textParts)).join('\n'),
          likeCount: numbers[0] || 0,
          replyCount: numbers[1] || 0,
          repostCount: numbers[2] || 0,
        };
      });

      const rootUsername = postDetails?.username || domPostInfo?.username || urlAuthor || 'threads.user';

      if (onProgress) {
        onProgress({
          status: 'scrolling',
          message: `Đã kết nối bài viết của @${rootUsername}. Đang cuộn trang quét tất cả bình luận...`,
          commentsCount: commentsMap.size,
          totalExpected: postDetails?.replyCount || domPostInfo?.replyCount || undefined,
        });
      }

      // Scrolling and gathering loop
      let stagnantRounds = 0;
      let lastCount = 0;
      const maxScrollRounds = maxComments > 0 ? Math.ceil(maxComments / 4) + 15 : 65;

      for (let round = 1; round <= maxScrollRounds; round++) {
        // 1. Click all buttons that expand collapsed reply threads ("replies", "phản hồi", "view replies", "xem thêm")
        try {
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
            for (const b of buttons) {
              const t = (b as HTMLElement).innerText?.trim().toLowerCase() || '';
              if (
                t.includes('reply') ||
                t.includes('replies') ||
                t.includes('phản hồi') ||
                t.includes('xem thêm') ||
                t.includes('view more') ||
                t.includes('view replies') ||
                t.includes('xem phản hồi') ||
                /^\d+\s+(?:replies|phản hồi)$/.test(t)
              ) {
                (b as HTMLElement).click();
              }
            }
          });
        } catch {}

        // 2. Extract DOM visible containers
        const domBatch = await page.evaluate(() => {
          const containers = Array.from(
            document.querySelectorAll('div[data-pressable-container="true"], article')
          );
          return containers.map((el) => {
            const userLink = el.querySelector('a[href^="/@"], a[href*="threads.net/@"]');
            let uName = '';
            if (userLink) {
              const href = userLink.getAttribute('href') || '';
              const m = href.match(/@([a-zA-Z0-9._]+)/);
              if (m) uName = m[1];
            }

            const timeEl = el.querySelector('time');
            const timeStr = timeEl
              ? timeEl.getAttribute('datetime') || timeEl.innerText
              : '';

            const img = el.querySelector(
              'img[alt*="avatar"], img[alt*="ảnh đại diện"], img[src*="cdninstagram"]'
            );
            const avatar = img ? img.getAttribute('src') : null;

            // Extract likes count
            let likesCount = 0;
            const allBtns = Array.from(el.querySelectorAll('div[role="button"], button'));
            for (const b of allBtns) {
              const txt = (b as HTMLElement).innerText.trim();
              if (/^\d+[KkMm]?$/.test(txt)) {
                const num = parseInt(txt);
                if (!isNaN(num) && num > likesCount) likesCount = num;
              }
            }

            // Extract clean content
            const contentElements = Array.from(
              el.querySelectorAll('span[dir="auto"], div[dir="auto"]')
            );
            const textParts: string[] = [];
            for (const ce of contentElements) {
              const t = (ce as HTMLElement).innerText.trim();
              if (!t) continue;
              if (t === uName) continue;
              if (
                t === 'Translate' ||
                t === 'Dịch' ||
                t === 'Xem bản dịch' ||
                t === 'See translation'
              )
                continue;
              if (/^\d+$/.test(t)) continue;
              if (/^\d+[hdmwy]$/.test(t)) continue;
              if (t.includes('replies') || t.includes('phản hồi')) continue;
              textParts.push(t);
            }

            const isSubReply =
              el.parentElement?.classList.contains('sub-thread') ||
              (el as HTMLElement).style.marginLeft !== '';

            // Find direct comment link
            const postLink = el.querySelector('a[href*="/post/"], a[href*="/t/"]');
            let commentUrl: string | undefined = undefined;
            if (postLink) {
              const href = postLink.getAttribute('href') || '';
              if (href) {
                commentUrl = href.startsWith('http') ? href : `https://www.threads.net${href}`;
              }
            }

            return {
              username: uName,
              avatar,
              time: timeStr,
              likesCount,
              cleanContent: Array.from(new Set(textParts)).join('\n'),
              isSubReply,
              commentUrl,
            };
          });
        });

        // Add DOM batch into map
        for (let idx = 0; idx < domBatch.length; idx++) {
          const item = domBatch[idx];
          if (!item.username || !item.cleanContent || item.cleanContent.length < 2) {
            continue;
          }

          // Skip root post
          if (
            idx === 0 &&
            postDetails?.content &&
            item.cleanContent.includes(postDetails.content.slice(0, 30))
          ) {
            continue;
          }

          const key = `${item.username}:${item.cleanContent.slice(0, 50).trim()}`;
          if (!commentsMap.has(key)) {
            commentsMap.set(key, {
              authorUsername: item.username,
              authorAvatar: item.avatar,
              content: item.cleanContent,
              likesCount: item.likesCount || 0,
              time: item.time || undefined,
              isSubReply: item.isSubReply,
              commentUrl: item.commentUrl,
            });
          } else if (item.commentUrl) {
            const existing = commentsMap.get(key);
            if (existing && !existing.commentUrl) {
              existing.commentUrl = item.commentUrl;
            }
          }
        }

        if (commentsMap.size > lastCount) {
          lastCount = commentsMap.size;
          stagnantRounds = 0;
        } else {
          stagnantRounds++;
        }

        if (onProgress) {
          onProgress({
            status: 'scrolling',
            message: `Đang cuộn quét (vòng ${round}): Đã thu thập ${commentsMap.size} bình luận...`,
            commentsCount: commentsMap.size,
            totalExpected: postDetails?.replyCount || undefined,
          });
        }

        // Stop if user specified maxComments
        if (maxComments > 0 && commentsMap.size >= maxComments) {
          break;
        }

        // Stop if reached end of thread with multiple confirmations
        if (stagnantRounds >= 10) {
          break;
        }

        // Scroll down smoothly
        await page.evaluate(() => {
          window.scrollBy({ top: 950, behavior: 'smooth' });
        });
        await new Promise((r) => setTimeout(r, 1200));
      }
    } catch (err: any) {
      console.warn('Deep Puppeteer crawler warning, falling back to SSR:', err.message);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }
    }

    // Merge any SSR comments that might not have been captured
    if (postDetails?.comments) {
      for (const sc of postDetails.comments) {
        const key = `${sc.authorUsername}:${sc.content.slice(0, 50).trim()}`;
        if (!commentsMap.has(key)) {
          commentsMap.set(key, {
            authorUsername: sc.authorUsername,
            content: sc.content,
            likesCount: sc.likesCount || 0,
            commentUrl: sc.commentUrl,
          });
        } else if (sc.commentUrl) {
          const existing = commentsMap.get(key);
          if (existing && !existing.commentUrl) {
            existing.commentUrl = sc.commentUrl;
          }
        }
      }
    }

    const finalComments = Array.from(commentsMap.values());

    if (onProgress) {
      onProgress({
        status: 'completed',
        message: `Hoàn tất quét bài viết! Đã thu thập toàn bộ ${finalComments.length} bình luận.`,
        commentsCount: finalComments.length,
        totalExpected: postDetails?.replyCount || finalComments.length,
      });
    }

    const finalUsername =
      postDetails?.username || domPostInfo?.username || urlAuthor || 'threads.user';
    const finalFullName =
      postDetails?.fullName || domPostInfo?.username || finalUsername;
    const finalContent =
      postDetails?.content || domPostInfo?.content || '';
    const finalLikes =
      postDetails?.likeCount || domPostInfo?.likeCount || 0;
    const finalReplies =
      postDetails?.replyCount || domPostInfo?.replyCount || finalComments.length;
    const finalReposts =
      postDetails?.repostCount || domPostInfo?.repostCount || 0;
    const finalAvatar =
      postDetails?.avatar || domPostInfo?.avatar || null;

    return {
      code: shortcode,
      url: normalizedUrl,
      username: finalUsername,
      fullName: finalFullName,
      avatar: finalAvatar,
      content: finalContent,
      likeCount: finalLikes,
      replyCount: finalReplies,
      repostCount: finalReposts,
      quoteCount: postDetails?.quoteCount || 0,
      viewsCount: postDetails?.viewsCount || null,
      publishedAt: postDetails?.publishedAt || domPostInfo?.time ? new Date(domPostInfo.time) : new Date(),
      scrapedAt: new Date(),
      comments: finalComments,
    };
  }
}
