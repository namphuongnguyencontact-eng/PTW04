import puppeteer, { Browser, Page } from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { prisma } from '../prisma';
import { ThreadsAdapter } from '../adapters/threads-adapter';
import { analyzePostById } from '../ai/ai-service';

export interface ScrapedComment {
  authorUsername: string;
  content: string;
  likesCount: number;
  commentUrl?: string;
}

export interface ScrapedPostData {
  code: string;
  username: string;
  fullName: string;
  avatar: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quoteCount: number;
  viewsCount: number | null;
  publishedAt: Date;
  comments: ScrapedComment[];
}

export interface CategoryMatchResult {
  category: string;
  score: number;
  reason: string;
}

export interface CrawlOptions {
  mode?: 'feed' | 'search' | 'profile' | 'urls';
  query?: string;
  urls?: string[];
  limit?: number; // 0 or undefined for continuous/infinite
  continuous?: boolean;
  abortSignal?: AbortSignal;
  jobId?: string;

  // New filtering options
  targetCategories?: string[]; // Multiple product categories entered by user
  minLikes?: number;
  minReplies?: number;
  minViews?: number;
  minEngagement?: number;
  onlyYear2026?: boolean; // Default true
  vietnamOnly?: boolean;  // Default true

  campaignId?: string | null;
  autoAnalyze?: boolean;
}

export interface CrawlLogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  url?: string;
}

export interface CrawlProgressEvent {
  current: number;
  total: number;
  currentUrl: string;
  post?: any;
  matchedCategory?: CategoryMatchResult | null;
  log: CrawlLogEntry;
}

export interface CrawlResult {
  totalDiscovered: number;
  totalSaved: number;
  savedPosts: any[];
  logs: CrawlLogEntry[];
}

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

// Active continuous crawl jobs tracker
export const activeCrawlJobs = new Map<
  string,
  { abortController: AbortController; isRunning: boolean }
>();

/**
 * Checks if a piece of text is written in Vietnamese or originates from Vietnam context
 */
export function isVietnameseText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  // Vietnamese accented characters
  const vnDiacritics =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (vnDiacritics.test(text)) return true;

  // Common Vietnamese stop words
  const vnCommonWords =
    /\b(và|là|của|có|cho|được|trong|với|này|người|khi|không|mình|bạn|em|anh|chị|ạ|ơi|quá|thế|nhỉ|đang|nhé|nè|luôn|cực|trọ|phòng|bàn|nhà|mua|bán|giá|tiền|setup|decor|shopee|lazada|tiktok|săn|sale)\b/i;
  if (vnCommonWords.test(text)) return true;

  return false;
}

const VN_BOUNDARY = '(?:^|[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ])';
const VN_BOUNDARY_END = '(?:[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]|$)';

/**
 * Checks if a piece of text contains a specific Vietnamese keyword or phrase with proper boundaries
 */
export function hasVnKeyword(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  if (phrase.includes(' ')) {
    return text.toLowerCase().includes(phrase.toLowerCase());
  }
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(`${VN_BOUNDARY}${escaped}${VN_BOUNDARY_END}`, 'i');
  return reg.test(text);
}

/**
 * Explicit Noise & Irrelevant Post Phrases (Jobs, Exams, General Politics/Gossip)
 */
const NOISE_PHRASES = [
  'tuyển dụng', 'tuyển gấp', 'tìm việc', 'intern', 'fresher', 'part-time', 'full-time',
  'mô tả công việc', 'nộp cv', 'apply cv', 'gửi cv', 'lương up to', 'mức lương:',
  'thực tập sinh', 'lịch thi', 'phòng thi', 'thi tốt nghiệp', 'thi thpt', 'chấm điểm',
  'điểm thi', 'thi cử', 'ôn thi đại học', 'lương ở việt nam', 'lương ở các nước',
  'kinh tế thế giới', 'tin tức thời sự', 'thất tình', 'chia tay rồi', 'cắm sừng',
  'bắt gian', 'bóc phốt ngoại tình',
];

/**
 * Commercial / Shopping / Review / Setup / Pain-Point Intent Groups
 */
const INTENT_GROUPS: Array<{ type: string; phrases: string[] }> = [
  {
    type: 'Mua sắm & Hỏi link',
    phrases: [
      'xin link', 'mua ở đâu', 'chỗ mua', 'chỗ bán', 'ai dùng rồi', 'ai xài rồi',
      'có nên mua', 'rcm', 'recommend', 'gợi ý cho mình', 'gợi ý giúp', 'tìm mua',
      'cần tìm', 'tư vấn giúp', 'nên mua loại nào', 'đang phân vân', 'pass lại',
      'thanh lý', 'ai pass', 'giá bao nhiêu', 'xin địa chỉ', 'link shopee', 'link bio',
      'trên shopee', 'trên tiktok', 'tiktok shop', 'săn sale', 'chốt đơn', 'đặt hàng',
      'vừa sắm', 'mới tậu', 'mới sắm', 'mới mua', 'định mua', 'tính mua', 'ngáo giá', 'tăng giá'
    ],
  },
  {
    type: 'Review & Trải nghiệm',
    phrases: [
      'review', 'đánh giá', 'unbox', 'mở hộp', 'dùng thử', 'trải nghiệm', 'chân ái',
      'cứu tinh', 'đáng tiền', 'tiền nào của nấy', 'chính hãng', 'setup góc', 'decor lại',
      'góc làm việc', 'góc học tập', 'bàn làm việc', 'đồ dùng hữu ích', 'món đồ đáng mua',
      'chất lượng tốt', 'dùng thích lắm', 'dùng cực thích', 'ưng cái bụng', 'độ hoàn thiện'
    ],
  },
  {
    type: 'Nhu cầu & Nỗi đau',
    phrases: [
      'đau lưng', 'mỏi vai gáy', 'mỏi cổ', 'gù lưng', 'cột sống', 'ngồi nhiều đau',
      'phòng trọ chật', 'bừa bộn', 'nổi mụn', 'da khô', 'da dầu', 'da nhạy cảm',
      'thâm mụn', 'mụn viêm', 'thức khuya mỏi mắt', 'chống cận', 'ẩm mốc', 'ướt balo',
      'chống nước', 'tiện lợi', 'gọn gàng'
    ],
  },
];

/**
 * Domain-specific product entities and compound terms (Meaningful 2+ syllable phrases)
 */
const CATEGORY_DOMAIN_MAP: Record<string, { aliases: string[]; terms: string[] }> = {
  decor: {
    aliases: ['decor', 'trang trí', 'nội thất', 'phòng ngủ', 'bàn học', 'góc làm việc', 'phòng trọ'],
    terms: [
      'bàn học', 'bàn làm việc', 'bàn nâng hạ', 'ghế công thái học', 'ghế gaming',
      'ghế xoay', 'đèn bàn', 'đèn học', 'đèn màn hình', 'kệ sách', 'kệ để đồ',
      'kệ treo tường', 'gương đứng', 'gương toàn thân', 'rèm cửa', 'thảm trải sàn',
      'tủ quần áo', 'setup bàn', 'setup góc', 'decor góc', 'decor phòng',
      'trang trí phòng', 'đồng hồ để bàn', 'khung tranh', 'giường ngủ', 'đệm topper',
      'nệm ngủ', 'phòng trọ', 'bàn gỗ', 'bàn trà', 'kê chân', 'giá đỡ màn hình'
    ],
  },
  tech: {
    aliases: ['công nghệ', 'phụ kiện công nghệ', 'điện tử', 'thiết bị', 'gadget'],
    terms: [
      'tai nghe bluetooth', 'tai nghe không dây', 'chuột không dây', 'chuột bluetooth',
      'chuột gaming', 'bàn phím cơ', 'bàn phím bluetooth', 'giá đỡ laptop', 'stand laptop',
      'cáp sạc', 'củ sạc', 'củ sạc nhanh', 'pin dự phòng', 'sạc dự phòng', 'laptop',
      'máy tính', 'ipad', 'màn hình rời', 'ổ cắm điện', 'kê tay bàn phím', 'lót chuột',
      'ốp lưng', 'hub chuyển đổi', 'giá đỡ ipad', 'tay cầm chơi game', 'giá treo tai nghe',
      'loa bluetooth', 'apple watch', 'đồng hồ thông minh'
    ],
  },
  ergonomic: {
    aliases: ['công thái học', 'ergonomic', 'chống gù', 'chống đau mỏi'],
    terms: [
      'ghế công thái học', 'bàn nâng hạ', 'giá đỡ laptop', 'kê tay', 'kê chân công thái học',
      'gối công thái học', 'đệm lưng', 'đau lưng', 'mỏi vai gáy', 'mỏi cổ', 'cột sống',
      'tư thế ngồi', 'chống gù', 'đèn màn hình chống mỏi mắt'
    ],
  },
  household: {
    aliases: ['gia dụng', 'đồ dùng', 'phòng trọ', 'tiện ích', 'nhà bếp', 'thông minh'],
    terms: [
      'đồ gia dụng', 'nồi chiên không dầu', 'nồi cơm điện', 'ấm siêu tốc', 'bình giữ nhiệt',
      'ly giữ nhiệt', 'máy hút bụi', 'máy hút bụi mini', 'máy sấy tóc', 'hộp cơm cắm điện',
      'kệ bát', 'bếp từ', 'quạt mini', 'quạt tích điện', 'máy lọc không khí', 'máy hút ẩm',
      'máy tạo ẩm', 'bình nước', 'hộp đựng đồ', 'móc treo quần áo', 'thùng rác thông minh',
      'máy xay sinh tố', 'chảo chống dính'
    ],
  },
  fashion: {
    aliases: ['thời trang', 'balo', 'túi xách', 'outfit', 'quần áo', 'giày dép', 'phụ kiện thời trang'],
    terms: [
      'balo đi học', 'balo laptop', 'balo chống nước', 'túi xách', 'túi tote',
      'túi đeo chéo', 'túi', 'balo', 'áo hoodie', 'áo polo', 'áo thun', 'áo khoác', 'quần jean',
      'quần ống rộng', 'giày sneaker', 'dép quai hậu', 'local brand', 'outfit đi học',
      'phối đồ', 'mũ lưỡi trai', 'ví tiền', 'áo sơ mi', 'chân váy', 'áo blazer'
    ],
  },
  skincare: {
    aliases: ['mỹ phẩm', 'chăm sóc da', 'skincare', 'làm đẹp'],
    terms: [
      'skincare', 'chăm sóc da', 'kem chống nắng', 'sữa rửa mặt', 'toner', 'serum',
      'kem dưỡng ẩm', 'trị mụn', 'da dầu mụn', 'da nhạy cảm', 'tẩy trang',
      'nước tẩy trang', 'mặt nạ dưỡng da', 'son môi', 'son dưỡng', 'chấm mụn',
      'bha', 'retinol', 'phục hồi da', 'tẩy tế bào chết', 'kem mắt'
    ],
  },
  health: {
    aliases: ['sức khỏe', 'chăm sóc cá nhân', 'thể thao'],
    terms: [
      'bàn chải điện', 'máy tăm nước', 'vitamin', 'thực phẩm chức năng', 'viên uống',
      'đau cột sống', 'đau thắt lưng', 'mỏi cổ vai gáy', 'chống cận thị', 'mỏi mắt',
      'ngủ ngon', 'tập gym', 'bình lắc gym', 'dây kháng lực', 'thảm yoga'
    ],
  },
};

/**
 * Match a post semantically against a list of user-provided categories
 */
export function matchCategoriesSemantic(
  content: string,
  comments: Array<{ content: string }>,
  categories: string[]
): CategoryMatchResult[] {
  if (!categories || categories.length === 0) return [];

  const postText = (content || '').toLowerCase();
  // Limit to top 5 comments to prevent comment noise pollution
  const topCommentsText = (comments || [])
    .slice(0, 5)
    .map((c) => c.content)
    .join(' ')
    .toLowerCase();

  // 1. Noise Filter: Immediately discard recruitment, exam logs, pure gossip
  for (const phrase of NOISE_PHRASES) {
    if (hasVnKeyword(postText, phrase)) {
      return [];
    }
  }

  // 2. Intent Detection
  let hasIntent = false;
  const detectedIntents: string[] = [];
  for (const group of INTENT_GROUPS) {
    for (const phrase of group.phrases) {
      if (hasVnKeyword(postText, phrase) || hasVnKeyword(topCommentsText, phrase)) {
        hasIntent = true;
        if (!detectedIntents.includes(group.type)) {
          detectedIntents.push(group.type);
        }
        break;
      }
    }
  }

  const results: CategoryMatchResult[] = [];

  for (const rawCat of categories) {
    const catName = rawCat.trim();
    if (!catName) continue;
    const catLower = catName.toLowerCase();

    let score = 0;
    const reasons: string[] = [];
    const matchedTerms: string[] = [];

    // A. Direct full category name match in main post
    if (hasVnKeyword(postText, catLower)) {
      score += 55;
      reasons.push(`Nội dung nhắc trực tiếp đến danh mục "${catName}"`);
    } else if (hasVnKeyword(topCommentsText, catLower)) {
      score += 30;
      reasons.push(`Bình luận nhắc đến danh mục "${catName}"`);
    }

    // B. Sub-phrases from user's custom category (split by & or comma, length >= 4)
    const userCategoryPhrases = catLower
      .split(/[,&/+/]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4);

    let phraseHits = 0;
    for (const phrase of userCategoryPhrases) {
      if (phrase && hasVnKeyword(postText, phrase)) {
        phraseHits++;
        score += 25;
        reasons.push(`Khớp cụm chủ đề "${phrase}"`);
      }
    }

    // C. Concrete Product & Domain Concepts
    for (const [domainKey, domainData] of Object.entries(CATEGORY_DOMAIN_MAP)) {
      const isRelated =
        catLower.includes(domainKey) ||
        domainData.aliases.some((alias) => catLower.includes(alias));

      if (isRelated) {
        for (const term of domainData.terms) {
          if (hasVnKeyword(postText, term)) {
            if (!matchedTerms.includes(term)) {
              matchedTerms.push(term);
              score += matchedTerms.length === 1 ? 20 : 10;
            }
          } else if (hasVnKeyword(topCommentsText, term)) {
            if (!matchedTerms.includes(term)) {
              matchedTerms.push(term);
              score += 8;
            }
          }
        }
      }
    }

    // D. Boost score if product intent is detected
    if (matchedTerms.length > 0 && hasIntent) {
      score += 25;
      reasons.push(`Có ngữ cảnh ${detectedIntents.slice(0, 2).join(' & ')}`);
    }

    if (matchedTerms.length > 0) {
      reasons.push(`Khớp sản phẩm/khái niệm thực tế: [${matchedTerms.slice(0, 4).join(', ')}]`);
    }

    // CRITICAL: Reject if there are ZERO concrete product terms and NO direct category phrase match
    if (matchedTerms.length === 0 && phraseHits === 0 && !hasVnKeyword(postText, catLower)) {
      score = 0;
    }

    // Cap at 98%
    score = Math.min(98, score);

    // High-confidence threshold: Minimum 45% score required to be classified as matched
    if (score >= 45) {
      results.push({
        category: catName,
        score,
        reason: reasons.join('. ') || 'Phù hợp với chủ đề và nhu cầu sản phẩm.',
      });
    }
  }

  // Sort descending by highest score
  results.sort((a, b) => b.score - a.score);
  return results;
}

export class ThreadsCrawler {
  /**
   * Find available Chrome or Edge binary path on Windows
   */
  static getExecutablePath(): string {
    const fs = require('fs');
    for (const p of CHROME_PATHS) {
      if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
        return p;
      }
    }
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  /**
   * Safe persistent Chrome profile path outside workspace to prevent Turbopack/watcher locks
   */
  static getProfileDir(): string {
    const profileDir = path.join(os.homedir(), '.masterthreads_chrome_profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    return profileDir;
  }

  /**
   * Launch a visible browser instance (headless: false) on user's screen
   */
  static async launchBrowser(options?: { headless?: boolean }): Promise<Browser> {
    const executablePath = this.getExecutablePath();
    const isHeadless = options?.headless ?? false; // Default: VISIBLE Chrome window
    const profileDir = this.getProfileDir();

    // Attempt to remove stale lockfile if left behind
    try {
      const lockfilePath = path.join(profileDir, 'lockfile');
      if (fs.existsSync(lockfilePath)) {
        fs.unlinkSync(lockfilePath);
      }
    } catch {}

    const primaryArgs = [
      '--start-maximized',
      '--new-window',
      `--user-data-dir=${profileDir}`,
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
      '--lang=vi-VN,vi',
    ];

    try {
      return await puppeteer.launch({
        executablePath,
        headless: isHeadless,
        defaultViewport: null,
        args: primaryArgs,
      });
    } catch (launchErr: any) {
      console.warn('Initial profile launch error, using dedicated session window:', launchErr.message);
      const fallbackDir = path.join(os.tmpdir(), `.chrome_session_${Date.now()}`);
      return await puppeteer.launch({
        executablePath,
        headless: isHeadless,
        defaultViewport: null,
        args: [
          '--start-maximized',
          '--new-window',
          `--user-data-dir=${fallbackDir}`,
          '--disable-blink-features=AutomationControlled',
          '--no-default-browser-check',
          '--no-first-run',
          '--lang=vi-VN,vi',
        ],
      });
    }
  }

  /**
   * Extract real post details from a single Threads URL.
   */
  static async scrapePostDetails(rawUrl: string): Promise<ScrapedPostData | null> {
    try {
      const normalizedUrl = rawUrl.replace('threads.com', 'threads.net').trim();
      const res = await fetch(normalizedUrl, {
        headers: {
          'User-Agent':
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      if (!res.ok && res.status !== 200) {
        return null;
      }

      const html = await res.text();
      let postData: any = null;

      // Extract JSON scripts
      const dataRegex =
        /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
      let sMatch;
      const allComments: ScrapedComment[] = [];

      while ((sMatch = dataRegex.exec(html)) !== null) {
        const text = sMatch[1];
        if (
          text.includes('BarcelonaPost') ||
          text.includes('direct_reply_count') ||
          text.includes('text_post_app_info') ||
          text.includes('caption')
        ) {
          try {
            const obj = JSON.parse(text);

            const searchJson = (o: any) => {
              if (!o || typeof o !== 'object') return;

              // Check if node is a Threads post
              if (o.caption && o.user && o.code && !postData) {
                const contentText =
                  typeof o.caption === 'string'
                    ? o.caption
                    : o.caption.text || '';

                postData = {
                  code: o.code,
                  username: o.user.username,
                  fullName: o.user.full_name || o.user.username,
                  avatar: o.user.profile_pic_url || null,
                  content: contentText,
                  likeCount: Number(o.like_count) || 0,
                  replyCount:
                    Number(o.text_post_app_info?.direct_reply_count) || 0,
                  repostCount:
                    Number(o.text_post_app_info?.repost_count) || 0,
                  quoteCount: Number(o.text_post_app_info?.quote_count) || 0,
                  viewsCount:
                    Number(o.text_post_app_info?.impression_count) || null,
                  publishedAt: o.taken_at
                    ? new Date(o.taken_at * 1000)
                    : new Date(),
                  comments: [],
                };
              }

              // Collect reply/comment items
              if (o.thread_items || o.reply_threads || o.direct_replies) {
                const arr =
                  o.thread_items ||
                  o.reply_threads ||
                  o.direct_replies?.edges;
                if (Array.isArray(arr)) {
                  for (const item of arr) {
                    const post =
                      item.post ||
                      item.node?.posts?.edges?.[0]?.node ||
                      item.node?.thread_items?.[0]?.post;
                    if (post && post.user && post.caption) {
                      const cText =
                        typeof post.caption === 'string'
                          ? post.caption
                          : post.caption.text;
                      if (cText && cText.trim()) {
                        allComments.push({
                          authorUsername: post.user.username,
                          content: cText.trim(),
                          likesCount: Number(post.like_count) || 0,
                          commentUrl: post.code
                            ? `https://www.threads.net/@${post.user.username}/post/${post.code}`
                            : undefined,
                        });
                      }
                    }
                  }
                }
              }

              for (const k of Object.keys(o)) {
                searchJson(o[k]);
              }
            };

            searchJson(obj);
          } catch {}
        }
      }

      if (postData) {
        // Deduplicate comments
        const uniqueCommentsMap = new Map<string, ScrapedComment>();
        for (const c of allComments) {
          if (!uniqueCommentsMap.has(c.content)) {
            uniqueCommentsMap.set(c.content, c);
          }
        }
        postData.comments = Array.from(uniqueCommentsMap.values()).slice(0, 10);
        return postData;
      }

      // Fallback: OpenGraph Meta tags
      const ogTitle = html.match(
        /<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"/i
      )?.[1];
      const ogDesc = html.match(
        /<meta\s+(?:property|name)="og:description"\s+content="([^"]*)"/i
      )?.[1];
      const ogImage = html.match(
        /<meta\s+(?:property|name)="og:image"\s+content="([^"]*)"/i
      )?.[1];

      if (ogDesc) {
        const decodedDesc = ogDesc
          .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
            String.fromCharCode(parseInt(code, 16))
          )
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"');

        const authorMatch =
          ogTitle?.match(/@([a-zA-Z0-9._]+)/) ||
          rawUrl.match(/@([a-zA-Z0-9._]+)/);
        const codeMatch = rawUrl.match(/\/post\/([a-zA-Z0-9_-]+)/);

        return {
          code: codeMatch ? codeMatch[1] : `th_${Date.now()}`,
          username: authorMatch ? authorMatch[1] : 'threads.user',
          fullName: authorMatch ? authorMatch[1] : 'Threads User',
          avatar: ogImage || null,
          content: decodedDesc,
          likeCount: 50,
          replyCount: 5,
          repostCount: 0,
          quoteCount: 0,
          viewsCount: null,
          publishedAt: new Date(),
          comments: [],
        };
      }

      return null;
    } catch (err: any) {
      console.error('Error scraping post details:', err);
      return null;
    }
  }

  /**
   * STEP 1: Open Chrome for user to login and save session
   */
  static async openLoginSession(
    onProgress?: (msg: string) => void
  ): Promise<{ success: boolean; username?: string; error?: string }> {
    const profileDir = this.getProfileDir();

    try {
      const lockfilePath = path.join(profileDir, 'lockfile');
      if (fs.existsSync(lockfilePath)) fs.unlinkSync(lockfilePath);
      const dtPath = path.join(profileDir, 'DevToolsActivePort');
      if (fs.existsSync(dtPath)) fs.unlinkSync(dtPath);
    } catch {}

    let browser: Browser | null = null;
    try {
      if (onProgress) onProgress('🌐 Đang khởi động Google Chrome trên màn hình...');
      browser = await this.launchBrowser({ headless: false });
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      try {
        await page.bringToFront();
      } catch {}

      if (onProgress) onProgress('👉 Đang mở trang đăng nhập Threads (https://www.threads.com/login)...');
      await page.goto('https://www.threads.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      if (onProgress) {
        onProgress('💡 Vui lòng đăng nhập tài khoản Threads trên cửa sổ Chrome vừa mở. Hệ thống sẽ tự động lưu tài khoản khi bạn đăng nhập xong...');
      }

      // Poll until logged in (max 5 minutes)
      const maxSeconds = 300;
      let secondsPassed = 0;

      while (secondsPassed < maxSeconds) {
        if (page.isClosed()) {
          return { success: false, error: 'Cửa sổ Chrome đã bị đóng trước khi hoàn tất đăng nhập.' };
        }

        // 1. Check cookies for login session
        const cookies = await page.cookies().catch(() => []);
        const sessionCookie = cookies.find(
          (c) => c.name === 'sessionid' || c.name === 'ds_user_id'
        );

        // 2. Check current URL and DOM
        const currentUrl = page.url();
        const isLoggedInUrl = !currentUrl.includes('/login') && currentUrl.includes('threads.');

        if (sessionCookie || isLoggedInUrl) {
          let detectedUsername = '';
          try {
            detectedUsername = await page.evaluate(() => {
              const profileLink = document.querySelector('a[href^="/@"]');
              if (profileLink) {
                const href = profileLink.getAttribute('href') || '';
                const m = href.match(/\/@([a-zA-Z0-9._]+)/);
                if (m) return m[1];
              }
              return '';
            });
          } catch {}

          if (!detectedUsername && sessionCookie) {
            detectedUsername = `threads_user_${sessionCookie.value.slice(-6)}`;
          }

          if (detectedUsername || sessionCookie) {
            if (onProgress) {
              onProgress(`✓ Nhận diện thành công tài khoản @${detectedUsername || 'threads_user'}! Đang lưu phiên đăng nhập...`);
            }
            await new Promise((r) => setTimeout(r, 2000));
            await browser.close().catch(() => {});
            return {
              success: true,
              username: detectedUsername || 'threads_user',
            };
          }
        }

        await new Promise((r) => setTimeout(r, 2000));
        secondsPassed += 2;
      }

      await browser.close().catch(() => {});
      return { success: false, error: 'Hết thời gian chờ đăng nhập (5 phút).' };
    } catch (err: any) {
      if (browser) await browser.close().catch(() => {});
      return { success: false, error: err.message };
    }
  }

  /**
   * Main crawl and ingest workflow supporting:
   * - Continuous infinite crawling until stopped by user
   * - Conditional filtering (minLikes, minReplies, minViews, minEngagement)
   * - Semantic product category matching
   * - Strict Year 2026 and Vietnam (Vietnamese language) filtering
   * - Post-by-post smooth scroll and visual element highlight
   */
  static async crawlAndIngest(
    options: CrawlOptions,
    onProgress?: (progress: CrawlProgressEvent) => void
  ): Promise<CrawlResult> {
    const {
      mode = 'feed',
      query = '',
      urls = [],
      limit = 0, // 0 = continuous / unlimited
      continuous = false,
      abortSignal,
      jobId,
      targetCategories = [],
      minLikes = 0,
      minReplies = 0,
      minViews = 0,
      minEngagement = 0,
      onlyYear2026 = true,
      vietnamOnly = true,
    } = options;

    const isUnlimited = continuous || !limit || limit === 0;
    const logs: CrawlLogEntry[] = [];
    const savedPosts: any[] = [];
    const visitedUrls: Set<string> = new Set();
    const urlQueue: string[] = [];

    const emitLog = (
      level: 'info' | 'success' | 'warn' | 'error',
      message: string,
      url?: string
    ) => {
      const entry: CrawlLogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        url,
      };
      logs.push(entry);
      if (onProgress) {
        onProgress({
          current: savedPosts.length,
          total: isUnlimited ? 0 : limit,
          currentUrl: url || '',
          log: entry,
        });
      }
      return entry;
    };

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      emitLog('info', '🚀 Đang mở cửa sổ trình duyệt Google Chrome trực quan...');
      browser = await this.launchBrowser({ headless: false });
      const pages = await browser.pages();
      page = pages.length > 0 ? pages[0] : await browser.newPage();
      try {
        await page.bringToFront();
      } catch {}
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      });

      // Determine initial starting URL on Threads
      let startUrl = 'https://www.threads.com/';
      if (mode === 'search' && query) {
        startUrl = `https://www.threads.com/search?q=${encodeURIComponent(query)}&filter=recent`;
        emitLog('info', `🔍 Đang mở tìm kiếm chủ đề "${query}" trên Threads...`, startUrl);
      } else if (mode === 'profile' && query) {
        const cleanUser = query.replace(/^@/, '').trim();
        startUrl = `https://www.threads.com/@${cleanUser}`;
        emitLog('info', `👤 Đang mở trang cá nhân @${cleanUser}...`, startUrl);
      } else {
        emitLog('info', '🌐 Đang mở trang chính https://www.threads.com/ để quét trực tiếp Newfeed...', startUrl);
      }

      await page.goto(startUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      emitLog('info', '✓ Cửa sổ Chrome đã mở thành công! Bạn có thể xem trực tiếp quá trình lướt Newfeed trên màn hình.');

      // Seed provided URLs if mode === 'urls'
      if (mode === 'urls' && urls && urls.length > 0) {
        for (const u of urls) {
          if (!visitedUrls.has(u)) {
            urlQueue.push(u);
            visitedUrls.add(u);
          }
        }
      }

      let consecutiveEmptyScrolls = 0;

      // CONTINUOUS CRAWLING LOOP
      while (true) {
        // 1. Check user abort signal
        if (abortSignal?.aborted) {
          emitLog('warn', '🛑 Nhận được lệnh Dừng từ người dùng. Đang hoàn tất và đóng tiến trình...');
          break;
        }

        // 2. Check fixed limit if not in unlimited mode
        if (!isUnlimited && savedPosts.length >= limit) {
          emitLog('success', `🎯 Đã đạt đủ chỉ tiêu ${limit} bài viết yêu cầu.`);
          break;
        }

        // 3. Discover more URLs by scrolling if queue is getting low
        if (urlQueue.length < 5 && page) {
          emitLog('info', '📜 Đang cuộn trang Threads để tải thêm bài viết mới...');
          await page.evaluate(() => window.scrollBy(0, 1500));
          await new Promise((r) => setTimeout(r, 2200));

          const pageLinks: string[] = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/post/"]'));
            return links.map((a: any) => a.href);
          });

          let newDiscovered = 0;
          for (const link of pageLinks) {
            if (link.includes('/post/')) {
              const cleaned = link.replace(/\/(media|embed)\/?$/, '');
              if (!visitedUrls.has(cleaned)) {
                visitedUrls.add(cleaned);
                urlQueue.push(cleaned);
                newDiscovered++;
              }
            }
          }

          if (newDiscovered > 0) {
            consecutiveEmptyScrolls = 0;
            emitLog(
              'info',
              `✨ Phát hiện thêm ${newDiscovered} bài viết mới. (Tổng hàng đợi: ${urlQueue.length} bài)`
            );
          } else {
            consecutiveEmptyScrolls++;
            if (consecutiveEmptyScrolls >= 5) {
              // Refresh or visit alternative feed to get fresh posts
              emitLog('info', '🔄 Đang làm mới bảng tin để nhận thêm bài viết mới nhất...');
              await page.reload({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
              consecutiveEmptyScrolls = 0;
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
        }

        // If queue is still empty, wait briefly
        if (urlQueue.length === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        // Pop next post URL from queue
        const currentUrl = urlQueue.shift()!;

        // 4. Smoothly scroll post-by-post on the user's screen with visual highlight
        if (page && !page.isClosed()) {
          try {
            await page.evaluate((url) => {
              const codeMatch = url.match(/\/post\/([a-zA-Z0-9_-]+)/);
              const code = codeMatch ? codeMatch[1] : '';
              let anchor = code ? document.querySelector(`a[href*="${code}"]`) : null;
              if (!anchor) {
                anchor = document.querySelector(`a[href*="/post/"]`);
              }
              if (anchor) {
                const container =
                  anchor.closest('div[data-pressable-container="true"]') ||
                  anchor.closest('article') ||
                  anchor;
                (container as HTMLElement).scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
                (container as HTMLElement).style.outline = '3px solid #84A282';
                (container as HTMLElement).style.borderRadius = '12px';
                (container as HTMLElement).style.transition = 'outline 0.3s ease';
              }
            }, currentUrl);
            await new Promise((r) => setTimeout(r, 700));
          } catch {}
        }

        // 5. Scrape post details
        try {
          emitLog(
            'info',
            `[Đã lưu: ${savedPosts.length}${!isUnlimited ? `/${limit}` : ''}] Đang quét bài viết: ${currentUrl}`,
            currentUrl
          );

          const postDetails = await this.scrapePostDetails(currentUrl);
          if (!postDetails || !postDetails.content) {
            emitLog('warn', `⚠️ Không thể lấy nội dung từ: ${currentUrl}`);
            continue;
          }

          // === FILTER 1: Strict Year 2026 ===
          if (onlyYear2026) {
            const pubYear = new Date(postDetails.publishedAt).getFullYear();
            if (pubYear !== 2026) {
              emitLog(
                'warn',
                `⏩ [Bỏ qua] Bài viết từ năm ${pubYear} (chỉ lấy bài viết mới năm 2026).`
              );
              continue;
            }
          }

          // === FILTER 2: Vietnam / Vietnamese Language ===
          if (vietnamOnly) {
            const isVn = isVietnameseText(postDetails.content);
            if (!isVn) {
              emitLog(
                'warn',
                `⏩ [Bỏ qua] Bài viết của @${postDetails.username} không phải tiếng Việt / khu vực Việt Nam.`
              );
              continue;
            }
          }

          // === FILTER 3: Engagement Thresholds ===
          const totalEngagement =
            postDetails.likeCount + postDetails.replyCount + postDetails.repostCount;

          if (minLikes > 0 && postDetails.likeCount < minLikes) {
            emitLog(
              'warn',
              `⏩ [Bỏ qua] Lượt tim (${postDetails.likeCount}) < mức tối thiểu (${minLikes}).`
            );
            continue;
          }

          if (minReplies > 0 && postDetails.replyCount < minReplies) {
            emitLog(
              'warn',
              `⏩ [Bỏ qua] Lượt phản hồi (${postDetails.replyCount}) < mức tối thiểu (${minReplies}).`
            );
            continue;
          }

          if (minViews > 0 && postDetails.viewsCount !== null && postDetails.viewsCount < minViews) {
            emitLog(
              'warn',
              `⏩ [Bỏ qua] Lượt xem (${postDetails.viewsCount}) < mức tối thiểu (${minViews}).`
            );
            continue;
          }

          if (minEngagement > 0 && totalEngagement < minEngagement) {
            emitLog(
              'warn',
              `⏩ [Bỏ qua] Tổng tương tác (${totalEngagement}) < mức tối thiểu (${minEngagement}).`
            );
            continue;
          }

          // === FILTER 4: Semantic Product Category Matching ===
          let matchedCategory: CategoryMatchResult | null = null;
          if (targetCategories && targetCategories.length > 0) {
            const categoryMatches = matchCategoriesSemantic(
              postDetails.content,
              postDetails.comments,
              targetCategories
            );

            if (categoryMatches.length === 0) {
              emitLog(
                'warn',
                `⏩ [Bỏ qua] Bài viết của @${postDetails.username} không có ngữ cảnh sản phẩm / nhu cầu liên quan đến các danh mục đã chọn.`
              );
              continue;
            }

            matchedCategory = categoryMatches[0];
            emitLog(
              'success',
              `🎯 [Khớp danh mục] @${postDetails.username} -> [${matchedCategory.category}] (${matchedCategory.score}%). Lý do: ${matchedCategory.reason}`
            );
          }

          // Standardize URL
          const postUrl = `https://www.threads.com/@${postDetails.username}/post/${postDetails.code}`;

          // Format user tags and notes with matched category
          const userTags: string[] = [];
          let userNotes = '';
          if (matchedCategory) {
            userTags.push(matchedCategory.category);
            userTags.push(`${matchedCategory.score}% phù hợp`);
            userNotes = `🎯 Phù hợp danh mục: [${matchedCategory.category}] (Độ khớp: ${matchedCategory.score}%).\n💡 Lý do: ${matchedCategory.reason}`;
          }

          // Ingest into database
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
            campaignId: options.campaignId || null,
            comments: postDetails.comments,
          });

          // Update tags & notes with matched category info
          if (matchedCategory) {
            await prisma.threadsPost.update({
              where: { id: post.id },
              data: {
                userTags: JSON.stringify(userTags),
                userNotes: userNotes,
              },
            });
          }

          // AI analysis if requested
          if (options.autoAnalyze !== false) {
            try {
              await analyzePostById({ postId: post.id });
            } catch (aiErr: any) {
              console.error('Auto analyze error for post:', post.id, aiErr);
            }
          }

          savedPosts.push({
            ...post,
            matchedCategory,
          });

          const successMsg = matchedCategory
            ? `✅ ${isNew ? 'Đã lưu bài viết mới' : 'Đã cập nhật'} của @${postDetails.username} (${postDetails.likeCount} tim, ${postDetails.replyCount} reply) ➔ 🎯 Khớp danh mục: [${matchedCategory.category}] (${matchedCategory.score}%)`
            : `✅ ${isNew ? 'Đã lưu bài viết mới' : 'Đã cập nhật'} của @${postDetails.username} (${postDetails.likeCount} tim, ${postDetails.replyCount} reply)`;

          const successEntry: CrawlLogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            level: 'success',
            message: successMsg,
            url: postUrl,
          };
          logs.push(successEntry);

          if (onProgress) {
            onProgress({
              current: savedPosts.length,
              total: isUnlimited ? 0 : limit,
              currentUrl: postUrl,
              post,
              matchedCategory,
              log: successEntry,
            });
          }

          // Delay to respect rate limits
          await new Promise((r) => setTimeout(r, 600));
        } catch (postErr: any) {
          emitLog('error', `Lỗi xử lý bài viết ${currentUrl}: ${postErr.message}`);
        }
      }
    } catch (err: any) {
      emitLog('error', `Lỗi tiến trình quét Threads: ${err.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
      if (jobId) {
        activeCrawlJobs.delete(jobId);
      }
    }

    emitLog(
      'success',
      `🎉 Quá trình quét kết thúc! Đã lưu trữ thành công ${savedPosts.length} bài viết thực tế phù hợp từ Threads.`
    );

    return {
      totalDiscovered: visitedUrls.size,
      totalSaved: savedPosts.length,
      savedPosts,
      logs,
    };
  }
}
