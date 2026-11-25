import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { BrowserContext, Page } from "playwright-core";
import type {
  ProjectData,
  ThreadsAnalysis,
  ThreadsCommentCandidate,
  ThreadsMediaCandidate
} from "@comment-video-studio/shared";
import { normalizeSpeechText } from "@comment-video-studio/shared";
import { ProjectStore, type UploadedFile } from "./storage.js";
import { classifyImageContent, type ConversationOcr } from "./conversation.js";
import type { SoundEffectService } from "./sound-effects.js";

const THREADS_HOSTS = new Set(["threads.net", "www.threads.net", "threads.com", "www.threads.com"]);
const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const ANALYSIS_TTL_MS = 30 * 60 * 1000;
const THREADS_LOGIN_WAIT_MS = 5 * 60 * 1000;
const THREADS_MAX_SCROLL_ROUNDS = 60;
const THREADS_STABLE_SCROLL_ROUNDS = 4;

interface ThreadsImageObservation {
  url: string;
  alt?: string;
  anchorHref?: string;
  renderedWidth: number;
  renderedHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}

interface ThreadsDomRow {
  id: string;
  permalink: string;
  username: string;
  text: string;
  x: number;
  y: number;
  pinned: boolean;
  avatarUrl?: string;
  images: ThreadsImageObservation[];
  likeLabel: string;
  replyLabel: string;
  repostLabel: string;
}

export interface ThreadsSource {
  read(url: string): Promise<Omit<ThreadsAnalysis, "fetchedAt">>;
  open?(url?: string): Promise<ThreadsBrowserStatus>;
  close?(): Promise<void>;
}

export interface ThreadsBrowserStatus {
  open: boolean;
  url: string;
  message: string;
}

export interface ThreadsAnalyzeResult {
  analysisId: string;
  analysis: ThreadsAnalysis;
}

interface StoredAnalysis {
  expiresAt: number;
  analysis: ThreadsAnalysis;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("đ", "d")
    .toLowerCase();
}

function tokens(value: string) {
  return new Set(normalizeText(value).match(/[a-z0-9]{2,}/g) ?? []);
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  for (const token of left) if (right.has(token)) matches += 1;
  return matches / Math.max(1, Math.min(left.size, right.size));
}

export function rankThreadsComments(postText: string, comments: ThreadsCommentCandidate[]): ThreadsCommentCandidate[] {
  const postTokens = tokens(postText);
  const maximumLikes = Math.max(1, ...comments.map((comment) => comment.likeCount));
  const emotionalWords = ["cuoi", "haha", "troi", "that", "dung", "soc", "hay", "thuong", "tuc", "buon", "vui", "chet", "het cuu"];
  const seen = new Set<string>();

  const ranked = comments.map((comment) => {
    const normalized = normalizeText(comment.text).replace(/\s+/g, " ").trim();
    const engagement = Math.log1p(Math.max(0, comment.likeCount)) / Math.log1p(maximumLikes);
    const relevance = overlap(postTokens, tokens(comment.text));
    const emotion = emotionalWords.some((word) => normalized.includes(word)) ? 1 : 0;
    const conversational = /[?!]|\b(nhung|vi|nen|ma|thì|thi|đúng|dung)\b/i.test(comment.text) ? 1 : 0;
    const meaningful = /[\p{L}\p{N}]/u.test(comment.text) && !/^[@#\s\p{P}\p{S}]+$/u.test(comment.text);
    const duplicate = seen.has(normalized);
    if (normalized) seen.add(normalized);
    const spam = /https?:\/\/|mua ngay|inbox|ib mình|ib minh|kiếm tiền|kiem tien/i.test(comment.text);
    const quality = meaningful ? 1 : 0;
    let score = engagement * 50 + relevance * 30 + Math.max(emotion, conversational) * 15 + quality * 5;
    if (duplicate) score -= 35;
    if (spam) score -= 45;
    const reasons: string[] = [];
    if (comment.likeCount > 0 && engagement >= 0.55) reasons.push(`${comment.likeCount} lượt tim`);
    if (relevance >= 0.25) reasons.push("Liên quan trực tiếp tới bài viết");
    if (emotion) reasons.push("Có điểm nhấn cảm xúc");
    if (comment.text.trim().length <= 24 && (engagement >= 0.55 || relevance >= 0.35)) reasons.push("Ngắn nhưng phù hợp hoặc nhiều tim");
    if (comment.media.length) reasons.push("Có ảnh đính kèm");
    if (!reasons.length && meaningful) reasons.push("Có thể dùng làm nhịp chuyển");
    return { ...comment, score: Math.max(0, Math.round(score * 10) / 10), reasons, suggested: false };
  });

  const eligible = ranked
    .filter((comment) => comment.text.trim() && comment.score > 0)
    .slice()
    .sort((left, right) => right.score - left.score || right.likeCount - left.likeCount);
  const suggestedIds = new Set(eligible.slice(0, 12).map((comment) => comment.id));
  return ranked.map((comment) => ({ ...comment, suggested: suggestedIds.has(comment.id) }));
}

export function validateThreadsUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Link Threads không hợp lệ.");
  }
  if (url.protocol !== "https:" || !THREADS_HOSTS.has(url.hostname.toLowerCase()) || !/\/post\//.test(url.pathname)) {
    throw new Error("Hãy dán link bài viết công khai từ threads.net hoặc threads.com.");
  }
  url.hash = "";
  return url.toString();
}

export function threadsPostKey(input: string) {
  const parsed = new URL(input, "https://www.threads.net");
  const match = parsed.pathname.match(/\/@([^/]+)\/post\/([^/?#]+)/i);
  if (!match) return "";
  return `${decodeURIComponent(match[1]!).toLowerCase()}/${match[2]}`;
}

export function selectThreadsContentMedia(images: ThreadsImageObservation[]): ThreadsMediaCandidate[] {
  const selected = new Map<string, ThreadsMediaCandidate>();
  for (const image of images) {
    if (!/^https:/i.test(image.url)) continue;
    const alt = (image.alt ?? "").toLowerCase();
    const renderedSquare = Math.abs(image.renderedWidth - image.renderedHeight) <= 12;
    const smallRenderedImage = image.renderedWidth <= 112 && image.renderedHeight <= 112;
    const profileLink = image.anchorHref ? /^https:\/\/(?:www\.)?threads\.(?:net|com)\/@[^/]+\/?(?:\?.*)?$/i.test(image.anchorHref) : false;
    const labeledAvatar = /profile picture|ảnh đại diện|avatar/.test(alt);
    if ((renderedSquare && smallRenderedImage) || profileLink || labeledAvatar) continue;
    const mediaLink = image.anchorHref ? /\/post\/[^/]+\/media(?:\/|$|\?)/i.test(image.anchorHref) : false;
    const largeOnScreen = image.renderedWidth >= 160 && image.renderedHeight >= 120;
    if (!mediaLink && !largeOnScreen) continue;
    selected.set(image.url, { url: image.url, type: "image", ...(image.alt ? { alt: image.alt } : {}) });
  }
  return [...selected.values()];
}

function cleanThreadsText(value: string) {
  return value.replace(/\s+\d+\s*\/\s*\d+\s*$/u, "").trim();
}

export function buildThreadsCandidates(rows: ThreadsDomRow[], sourceUrl: string) {
  const sourceKey = threadsPostKey(sourceUrl);
  const postRow = rows.find((row) => threadsPostKey(row.permalink) === sourceKey);
  if (!postRow) throw new Error("Không xác định được bài Threads gốc. Hãy giữ cửa sổ Chrome mở và chờ trang tải xong.");
  const toCandidate = (row: ThreadsDomRow, parentId?: string, depth = 0): ThreadsCommentCandidate => ({
    id: row.id,
    ...(parentId ? { parentId } : {}),
    depth,
    username: row.username,
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    text: cleanThreadsText(row.text),
    permalink: row.permalink,
    likeCount: parseMetric(row.likeLabel),
    replyCount: parseMetric(row.replyLabel),
    repostCount: parseMetric(row.repostLabel),
    media: selectThreadsContentMedia(row.images),
    score: 0,
    reasons: [],
    suggested: false
  });
  const post = toCandidate(postRow);
  const commentRows = rows
    .filter((row) => row !== postRow && threadsPostKey(row.permalink) !== sourceKey)
    .sort((left, right) => left.y - right.y);
  const unpinnedRows = commentRows.filter((row) => !row.pinned);
  const baseRows = unpinnedRows.length ? unpinnedRows : commentRows;
  const baseX = baseRows.length ? Math.min(...baseRows.map((row) => row.x)) : postRow.x;
  const stack: Array<{ id: string; depth: number }> = [];
  const comments = commentRows.map((row) => {
    const depth = row.pinned ? 0 : Math.max(0, Math.min(3, Math.round((row.x - baseX) / 28)));
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const parentId = depth > 0 ? (stack[stack.length - 1]?.id ?? post.id) : post.id;
    const candidate = toCandidate(row, parentId, depth);
    stack.push({ id: candidate.id, depth });
    return candidate;
  });
  return { post, comments };
}

function parseMetric(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll(",", ".");
  const match = normalized.match(/([\d.]+)\s*([km])?/);
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * (match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1));
}

export class ThreadsBrowserSource implements ThreadsSource {
  private context?: BrowserContext;
  private contextPromise?: Promise<BrowserContext>;
  private page?: Page;

  constructor(private readonly profileDirectory: string) {}

  private async ensureContext() {
    if (this.context) return this.context;
    if (this.contextPromise) return this.contextPromise;
    this.contextPromise = (async () => {
      const { chromium } = await import("playwright-core");
      await mkdir(this.profileDirectory, { recursive: true });
      const context = await chromium.launchPersistentContext(this.profileDirectory, {
        channel: "chrome",
        headless: false,
        viewport: { width: 1280, height: 900 },
        locale: "vi-VN",
        args: ["--disable-blink-features=AutomationControlled"]
      });
      this.context = context;
      context.on("close", () => {
        if (this.context === context) {
          this.context = undefined;
          this.page = undefined;
        }
      });
      return context;
    })();
    try {
      return await this.contextPromise;
    } finally {
      this.contextPromise = undefined;
    }
  }

  private async ensurePage() {
    const context = await this.ensureContext();
    if (this.page && !this.page.isClosed()) return this.page;
    this.page = context.pages().find((candidate) => !candidate.isClosed()) ?? await context.newPage();
    return this.page;
  }

  async open(inputUrl?: string): Promise<ThreadsBrowserStatus> {
    const url = inputUrl?.trim() ? validateThreadsUrl(inputUrl) : "https://www.threads.com/";
    const page = await this.ensurePage();
    if (page.url() !== url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.bringToFront();
    return {
      open: true,
      url: page.url(),
      message: "Chrome local đã mở và sẽ được giữ nguyên. Hãy đăng nhập Threads rồi quay lại ứng dụng để phân tích."
    };
  }

  async close() {
    const pendingContext = this.contextPromise;
    const context = this.context ?? (pendingContext ? await pendingContext.catch(() => undefined) : undefined);
    this.contextPromise = undefined;
    this.context = undefined;
    this.page = undefined;
    if (context) await context.close();
  }

  async read(inputUrl: string): Promise<Omit<ThreadsAnalysis, "fetchedAt">> {
    const url = validateThreadsUrl(inputUrl);
    const page = await this.ensurePage();
    await page.bringToFront();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const sourceKey = threadsPostKey(url);
      const deadline = Date.now() + THREADS_LOGIN_WAIT_MS;
      let ready = false;
      while (Date.now() < deadline) {
        const currentKey = threadsPostKey(page.url());
        if (currentKey === sourceKey) {
          const pageReady = await page.evaluate((expectedKey) => {
            const keys = new Set<string>();
            let targetVisible = false;
            for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]')) {
              try {
                const parsed = new URL(link.href, location.href);
                const match = parsed.pathname.match(/\/@([^/]+)\/post\/([^/?#]+)/i);
                if (!match) continue;
                const key = `${decodeURIComponent(match[1]!).toLowerCase()}/${match[2]}`;
                keys.add(key);
                if (key === expectedKey) targetVisible = true;
              } catch {
                continue;
              }
            }
            const interactionReady = Array.from(document.querySelectorAll<HTMLElement>('button,[role="button"]')).some((element) => /(?:thích|like|trả lời|reply)\s*[\d.,]*/i.test(`${element.getAttribute("aria-label") ?? ""} ${element.innerText ?? ""}`));
            return targetVisible && (keys.size > 1 || interactionReady);
          }, sourceKey).catch(() => false);
          if (pageReady) {
            ready = true;
            break;
          }
        } else if (!/login|accounts/i.test(page.url())) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
        }
        await page.waitForTimeout(1_000);
      }
      if (!ready) throw new Error("Hết 5 phút chờ đăng nhập hoặc tải bài Threads. Chrome được giữ mở trong thời gian chờ; hãy đăng nhập rồi bấm phân tích lại.");

      let previousCount = 0;
      let stableRounds = 0;
      for (let index = 0; index < THREADS_MAX_SCROLL_ROUNDS && (index < 12 || stableRounds < THREADS_STABLE_SCROLL_ROUNDS); index += 1) {
        let expandedReplies = 0;
        const replyButtons = page.getByRole("button", { name: /Hiển thị câu trả lời|View repl(?:y|ies)/i });
        const replyButtonCount = Math.min(await replyButtons.count().catch(() => 0), 10);
        for (let buttonIndex = 0; buttonIndex < replyButtonCount; buttonIndex += 1) {
          const button = replyButtons.nth(buttonIndex);
          if (await button.isVisible().catch(() => false)) {
            await button.click({ timeout: 2_000 }).catch(() => undefined);
            expandedReplies += 1;
            await page.waitForTimeout(180);
          }
        }
        const count = await page.evaluate(() => new Set(Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]')).map((link) => {
          try {
            const match = new URL(link.href, location.href).pathname.match(/\/@([^/]+)\/post\/([^/?#]+)/i);
            return match ? `${decodeURIComponent(match[1]!).toLowerCase()}/${match[2]}` : "";
          } catch {
            return "";
          }
        }).filter(Boolean)).size);
        stableRounds = count <= previousCount && expandedReplies === 0 ? stableRounds + 1 : 0;
        previousCount = Math.max(previousCount, count);
        await page.evaluate(() => window.scrollBy({ top: Math.max(650, window.innerHeight * 0.8), behavior: "instant" }));
        await page.waitForTimeout(800);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(500);

      const raw = await page.evaluate((): ThreadsDomRow[] => {
        const postLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]'));
        const rows: ThreadsDomRow[] = [];
        const groupedLinks = new Map<string, { permalink: string; links: HTMLAnchorElement[] }>();
        for (const link of postLinks) {
          try {
            const parsed = new URL(link.href, location.href);
            const match = parsed.pathname.match(/\/@([^/]+)\/post\/([^/?#]+)/i);
            if (!match) continue;
            const key = `${decodeURIComponent(match[1]!).toLowerCase()}/${match[2]}`;
            const permalink = `${parsed.origin}/@${match[1]}/post/${match[2]}`;
            const current = groupedLinks.get(key) ?? { permalink, links: [] };
            current.links.push(link);
            groupedLinks.set(key, current);
          } catch {
            continue;
          }
        }
        for (const { permalink, links } of groupedLinks.values()) {
          let best: HTMLElement | null = null;
          let bestLength = -1;
          for (const link of links) {
            let container: HTMLElement | null = link;
            for (let level = 0; level < 10 && container; level += 1, container = container.parentElement) {
              const text = (container.innerText ?? "").trim();
              const nestedPostKeys = new Set<string>();
              for (const item of container.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]')) {
                try {
                  const match = new URL(item.href, location.href).pathname.match(/\/@([^/]+)\/post\/([^/?#]+)/i);
                  if (match) nestedPostKeys.add(`${decodeURIComponent(match[1]!).toLowerCase()}/${match[2]}`);
                } catch {
                  continue;
                }
              }
              const nestedPostLinks = nestedPostKeys.size;
              if (text.length >= 2 && text.length <= 5_000 && nestedPostLinks === 1 && text.length > bestLength) {
                best = container;
                bestLength = text.length;
              }
              if (nestedPostLinks > 1) break;
            }
          }
          if (!best) continue;
          const rect = best.getBoundingClientRect();
          const hrefPath = new URL(permalink).pathname;
          const username = decodeURIComponent(hrefPath.match(/\/@([^/]+)/)?.[1] ?? "threads");
          const blocks = Array.from(best.querySelectorAll<HTMLElement>('div[dir="auto"], span[dir="auto"]'))
            .map((element) => (element.innerText ?? "").trim())
            .filter(Boolean);
          const uniqueBlocks = Array.from(new Set(blocks));
          const text = uniqueBlocks
            .filter((line) => line !== username
              && !/^\d+\s*(giây|phút|giờ|ngày|s|m|h|d)$/i.test(line)
              && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(line)
              && !/^[\d.,]+\s*[kmb]?$/.test(line)
              && !/^(thread|đã ghim|đã chỉnh sửa|\d+[.,]?\d*\s*lượt xem)$/i.test(line))
            .sort((left, right) => right.length - left.length)[0] ?? "";
          const labels = Array.from(best.querySelectorAll<HTMLElement>('button,[role="button"]'))
            .map((element) => {
              const iconLabel = element.querySelector<HTMLElement>("[aria-label]")?.getAttribute("aria-label") ?? "";
              return `${element.getAttribute("aria-label") ?? iconLabel} ${element.innerText ?? ""}`.trim();
            })
            .filter(Boolean);
          const numericLabels = labels.filter((item) => /\d/.test(item));
          const images = Array.from(best.querySelectorAll<HTMLImageElement>("img")).map((image) => {
            const imageRect = image.getBoundingClientRect();
            return {
              url: image.currentSrc || image.src,
              alt: image.alt || undefined,
              anchorHref: image.closest<HTMLAnchorElement>("a")?.href,
              renderedWidth: imageRect.width,
              renderedHeight: imageRect.height,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight
            };
          }).filter((image) => Boolean(image.url));
          const avatar = images.find((image) => image.renderedWidth > 20 && image.renderedWidth <= 112 && Math.abs(image.renderedWidth - image.renderedHeight) <= 12);
          rows.push({
            id: permalink,
            permalink,
            username,
            text,
            x: rect.x,
            y: rect.y + window.scrollY,
            pinned: /(^|\n)\s*(đã ghim|pinned)\s*($|\n)/i.test(best.innerText ?? ""),
            avatarUrl: avatar?.url,
            images,
            likeLabel: labels.find((item) => ["like", "thích", "tim"].some((word) => item.toLowerCase().includes(word))) ?? numericLabels[0] ?? "",
            replyLabel: labels.find((item) => ["reply", "trả lời", "bình luận"].some((word) => item.toLowerCase().includes(word))) ?? numericLabels[1] ?? "",
            repostLabel: labels.find((item) => ["repost", "đăng lại"].some((word) => item.toLowerCase().includes(word))) ?? numericLabels[2] ?? ""
          });
        }
        return rows;
      });
      if (!raw.length) throw new Error("Không đọc được nội dung bài Threads. Hãy kiểm tra bài còn công khai hoặc đăng nhập trong cửa sổ Chrome của tool.");
      const { post, comments } = buildThreadsCandidates(raw, url);
      return {
        sourceUrl: url,
        post,
        comments: rankThreadsComments(post.text, comments),
        warning: "Chrome chờ đăng nhập tối đa 5 phút và cuộn đến khi danh sách ổn định. Hãy kiểm tra lại số tim, cây trả lời và ảnh trước khi nhập."
      };
    } catch (error) {
      if (page.isClosed()) {
        this.page = undefined;
        throw new Error("Chrome local đã bị đóng. Hãy bấm ‘Mở Chrome local để đăng nhập’ rồi thử lại.", { cause: error });
      }
      throw error;
    }
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(value: string, maximum = 43) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line || `${line} ${word}`.length <= maximum) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function renderThreadsCommentCard(comment: ThreadsCommentCandidate) {
  const lines = wrapText(comment.text);
  const height = 150 + lines.length * 52 + 75;
  const text = lines.map((line, index) => `<tspan x="112" dy="${index === 0 ? 0 : 52}">${escapeXml(line)}</tspan>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}">
    <rect width="1000" height="${height}" rx="22" fill="#fff"/>
    ${threadsAvatarPlaceholder()}
    <text x="112" y="54" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#101114">${escapeXml(comment.username)}</text>
    <text x="112" y="88" font-family="Arial, sans-serif" font-size="25" fill="#8a8f98">${escapeXml(comment.timestampLabel ?? "Threads")}</text>
    <text x="112" y="145" font-family="Arial, sans-serif" font-size="38" fill="#101114">${text}</text>
    <line x1="32" y1="${height - 70}" x2="968" y2="${height - 70}" stroke="#edf0f3"/>
    <text x="46" y="${height - 24}" font-family="Arial, sans-serif" font-size="28" fill="#4d535b">♡ ${comment.likeCount}　◯ ${comment.replyCount}　↻ ${comment.repostCount}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function threadsAvatarPlaceholder() {
  return `<circle cx="58" cy="58" r="34" fill="#e5e7eb"/>`;
}

export class ThreadsImportService {
  private readonly analyses = new Map<string, StoredAnalysis>();

  constructor(
    private readonly store: ProjectStore,
    private readonly source: ThreadsSource,
    private readonly ocr: ConversationOcr,
    private readonly soundEffects: Pick<SoundEffectService, "ensureConversationDing" | "ensureCommentAppearanceSounds">,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async openBrowser(url?: string) {
    if (!this.source.open) throw new Error("Nguồn Threads hiện tại không hỗ trợ mở Chrome local.");
    return this.source.open(url);
  }

  async closeBrowser() {
    await this.source.close?.();
  }

  async analyze(url: string): Promise<ThreadsAnalyzeResult> {
    const raw = await this.source.read(validateThreadsUrl(url));
    const analysis: ThreadsAnalysis = { ...raw, comments: rankThreadsComments(raw.post.text, raw.comments), fetchedAt: new Date().toISOString() };
    const analysisId = randomUUID();
    this.analyses.set(analysisId, { analysis, expiresAt: Date.now() + ANALYSIS_TTL_MS });
    return { analysisId, analysis };
  }

  private getAnalysis(id: string) {
    const stored = this.analyses.get(id);
    if (!stored || stored.expiresAt < Date.now()) throw new Error("Kết quả phân tích đã hết hạn. Hãy phân tích lại link Threads.");
    return stored.analysis;
  }

  private assertTrustedMediaUrl(url: URL) {
    if (url.protocol !== "https:") throw new Error("Ảnh Threads phải dùng HTTPS.");
    const hostname = url.hostname.toLowerCase();
    const trustedMediaHost = THREADS_HOSTS.has(hostname)
      || hostname.endsWith(".fbcdn.net")
      || hostname.endsWith(".cdninstagram.com");
    if (!trustedMediaHost) throw new Error("Ảnh đính kèm không thuộc máy chủ media của Threads.");
  }

  private async readLimitedBytes(response: Response, maxBytes: number) {
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > maxBytes) throw new Error("Ảnh Threads trống hoặc vượt quá 25 MB.");
    if (!response.body) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > maxBytes) throw new Error("Ảnh Threads trống hoặc vượt quá 25 MB.");
      return bytes;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error("Ảnh Threads trống hoặc vượt quá 25 MB.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!total) throw new Error("Ảnh Threads trống hoặc vượt quá 25 MB.");
    return Buffer.concat(chunks, total);
  }

  private async downloadImage(url: string, baseName: string): Promise<UploadedFile> {
    let current = new URL(url);
    let response: Response | undefined;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      this.assertTrustedMediaUrl(current);
      const nextResponse = await this.fetcher(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: { accept: "image/*", "user-agent": "CommentVideoStudio/0.1" }
      });
      if (nextResponse.status >= 300 && nextResponse.status < 400) {
        const location = nextResponse.headers.get("location");
        if (!location || redirectCount === 3) throw new Error("Ảnh đính kèm chuyển hướng không hợp lệ.");
        current = new URL(location, current);
        continue;
      }
      response = nextResponse;
      break;
    }
    if (!response || !response.ok) throw new Error(`Không tải được ảnh Threads (${response?.status ?? "lỗi"}).`);
    const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(type)) throw new Error("Media Threads không phải PNG, JPEG hoặc WebP.");
    const bytes = await this.readLimitedBytes(response, MAX_REMOTE_IMAGE_BYTES);
    const extension = type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg";
    const filePath = path.join(this.store.tempRoot, `${randomUUID()}${extension}`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    return { path: filePath, originalname: `${baseName}${extension}`, mimetype: type, size: bytes.length };
  }

  async importSelection(projectId: string, analysisId: string, selectedIds: string[]): Promise<ProjectData> {
    if (!selectedIds.length) throw new Error("Bạn chưa chọn comment Threads nào.");
    const analysis = this.getAnalysis(analysisId);
    const allCandidates = [analysis.post, ...analysis.comments];
    const byId = new Map(allCandidates.map((comment) => [comment.id, comment]));
    const selected = new Set(selectedIds.filter((id) => byId.has(id)));
    for (const id of [...selected]) {
      let parent = byId.get(id)?.parentId;
      while (parent && parent !== analysis.post.id) {
        selected.add(parent);
        parent = byId.get(parent)?.parentId;
      }
    }
    const ordered = allCandidates.filter((comment) => selected.has(comment.id));
    const importedBySource = new Map<string, string>();

    for (const candidate of ordered) {
      const cardBuffer = await renderThreadsCommentCard(candidate);
      const cardPath = path.join(this.store.tempRoot, `${randomUUID()}.png`);
      await writeFile(cardPath, cardBuffer);
      const parentSource = candidate.parentId && candidate.parentId !== analysis.post.id ? candidate.parentId : undefined;
      let rootSource = parentSource;
      while (rootSource && byId.get(rootSource)?.parentId && byId.get(rootSource)?.parentId !== analysis.post.id) rootSource = byId.get(rootSource)?.parentId;
      const parentCommentId = rootSource ? importedBySource.get(rootSource) : undefined;
      const existingIds = new Set((await this.store.get(projectId)).comments.map((comment) => comment.id));
      let project = await this.store.importCommentImages(projectId, [{ path: cardPath, originalname: `${candidate.username}.png`, mimetype: "image/png", size: cardBuffer.length }], parentCommentId);
      await unlink(cardPath).catch(() => undefined);
      const imported = project.comments.find((comment) => !existingIds.has(comment.id));
      if (!imported) throw new Error(`Không xác định được comment vừa nhập từ @${candidate.username}.`);
      imported.text = candidate.text;
      imported.speechText = normalizeSpeechText(candidate.text);
      imported.source = { provider: "threads", sourceId: candidate.id, permalink: candidate.permalink, username: candidate.username, likeCount: candidate.likeCount };
      imported.audioStatus = "missing";
      project = await this.store.save(project);
      importedBySource.set(candidate.id, imported.id);

      const media = candidate.media[0];
      if (!media) continue;
      let downloaded: UploadedFile | undefined;
      try {
        downloaded = await this.downloadImage(media.url, `threads-${candidate.username}`);
        const recognized = await this.ocr.recognize(downloaded.path).catch(() => undefined);
        const classification = classifyImageContent(recognized?.observations ?? []);
        if (classification.type === "conversation" && recognized) {
          await this.store.importConversationImage(projectId, imported.id, downloaded, classification.messages, recognized.language, "after-comment");
          await this.soundEffects.ensureConversationDing(projectId, imported.id);
        } else {
          await this.store.importCommentAttachment(projectId, imported.id, downloaded, {
            mode: "auto",
            detectedType: classification.type === "text" ? "text" : "illustration",
            classificationConfidence: classification.confidence,
            textBlocks: classification.textBlocks
          });
        }
      } finally {
        if (downloaded) await unlink(downloaded.path).catch(() => undefined);
      }
    }
    await this.soundEffects.ensureCommentAppearanceSounds(projectId);
    return this.store.get(projectId);
  }
}
