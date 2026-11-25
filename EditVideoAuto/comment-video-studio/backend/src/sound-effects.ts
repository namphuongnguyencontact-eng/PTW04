import { randomUUID } from "node:crypto";
import type { CommentItem, ProjectData, SoundEffectAsset } from "@comment-video-studio/shared";
import { ProjectStore } from "./storage.js";

const MYINSTANTS_ORIGIN = "https://www.myinstants.com";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const CONVERSATION_DING_PAGE = "https://www.myinstants.com/fr/instant/ding-sound-effect/";
export const COMMENT_INTRO_PAGE = "https://www.myinstants.com/fr/instant/tununuuuu-67224/";
export const COMMENT_NEXT_PAGE = "https://www.myinstants.com/fr/instant/mouse-click-by-ek6-9658/";

export interface MyInstantsCandidate {
  title: string;
  pageUrl: string;
  audioUrl: string;
}

export interface SoundEffectProvider {
  search(query: string): Promise<MyInstantsCandidate[]>;
  download(candidate: MyInstantsCandidate): Promise<Uint8Array>;
  resolvePage?(pageUrl: string): Promise<MyInstantsCandidate>;
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function myInstantsUrl(pathname: string) {
  const url = new URL(pathname, MYINSTANTS_ORIGIN);
  if (url.hostname !== "www.myinstants.com" || url.protocol !== "https:") {
    throw new Error("MyInstants trả về đường dẫn không hợp lệ.");
  }
  return url.toString();
}

export function parseMyInstantsSearch(html: string): MyInstantsCandidate[] {
  const results: MyInstantsCandidate[] = [];
  const pattern = /<button[^>]+onclick="play\('([^']+)'[^>]*>[\s\S]*?<a\s+href="([^"]*\/instant\/[^"]+)"\s+class="instant-link[^"]*">([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const audioPath = match[1];
    const pagePath = match[2];
    if (!audioPath?.startsWith("/media/sounds/") || !pagePath) continue;
    results.push({
      title: decodeHtml(match[3] ?? "Sound effect"),
      pageUrl: myInstantsUrl(pagePath),
      audioUrl: myInstantsUrl(audioPath)
    });
  }
  return results;
}

export function parseMyInstantsPage(pageUrl: string, html: string): MyInstantsCandidate {
  const parsedPage = new URL(pageUrl);
  if (parsedPage.hostname !== "www.myinstants.com" || !parsedPage.pathname.includes("/instant/")) {
    throw new Error("Trang SFX không thuộc MyInstants.");
  }
  const audioPath = html.match(/preloadAudioUrl\s*=\s*['\"]([^'\"]+)['\"]/i)?.[1];
  if (!audioPath?.startsWith("/media/sounds/")) throw new Error("Không tìm thấy file MP3 trên trang MyInstants đã chọn.");
  const titleHtml = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? parsedPage.pathname.split("/").filter(Boolean).at(-1) ?? "Sound effect";
  const title = decodeHtml(titleHtml.split(/\s[-|]\s/)[0] ?? titleHtml);
  return { title, pageUrl: parsedPage.toString(), audioUrl: myInstantsUrl(audioPath) };
}

async function readLimitedBytes(response: Response, maxBytes: number, errorMessage: string) {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maxBytes) throw new Error(errorMessage);
  if (!response.body) {
    const content = new Uint8Array(await response.arrayBuffer());
    if (!content.length || content.length > maxBytes) throw new Error(errorMessage);
    return content;
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
        throw new Error(errorMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error(errorMessage);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export class MyInstantsProvider implements SoundEffectProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async fetchTrusted(
    initialUrl: URL,
    assertAllowed: (url: URL) => void,
    init: RequestInit
  ) {
    let current = initialUrl;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      assertAllowed(current);
      const response = await this.fetcher(current, { ...init, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === 3) throw new Error("MyInstants chuyển hướng không hợp lệ.");
        current = new URL(location, current);
        continue;
      }
      return response;
    }
    throw new Error("MyInstants chuyển hướng quá nhiều lần.");
  }

  async search(query: string) {
    const url = new URL("/en/search/", MYINSTANTS_ORIGIN);
    url.searchParams.set("name", query);
    const response = await this.fetchTrusted(url, (candidate) => {
      if (candidate.hostname !== "www.myinstants.com" || candidate.protocol !== "https:") {
        throw new Error("MyInstants trả về đường dẫn không hợp lệ.");
      }
    }, {
      headers: { "user-agent": "CommentVideoStudio/0.1 (+local desktop app)", accept: "text/html" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`MyInstants không phản hồi (${response.status}).`);
    return parseMyInstantsSearch(await response.text());
  }

  async resolvePage(pageUrl: string) {
    const parsed = new URL(pageUrl);
    const assertPageUrl = (candidate: URL) => {
      if (candidate.hostname !== "www.myinstants.com" || candidate.protocol !== "https:" || !candidate.pathname.includes("/instant/")) {
        throw new Error("Trang SFX không thuộc MyInstants.");
      }
    };
    assertPageUrl(parsed);
    const response = await this.fetchTrusted(parsed, assertPageUrl, {
      headers: { "user-agent": "CommentVideoStudio/0.1 (+local desktop app)", accept: "text/html" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`Không đọc được trang SFX MyInstants (${response.status}).`);
    return parseMyInstantsPage(parsed.toString(), await response.text());
  }

  async download(candidate: MyInstantsCandidate) {
    const url = new URL(candidate.audioUrl);
    const assertAudioUrl = (target: URL) => {
      if (target.hostname !== "www.myinstants.com" || target.protocol !== "https:" || !target.pathname.startsWith("/media/sounds/")) {
        throw new Error("Đường dẫn tải SFX không thuộc MyInstants.");
      }
    };
    assertAudioUrl(url);
    const response = await this.fetchTrusted(url, assertAudioUrl, {
      headers: { "user-agent": "CommentVideoStudio/0.1 (+local desktop app)", accept: "audio/mpeg,audio/*" },
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Không tải được SFX từ MyInstants (${response.status}).`);
    return readLimitedBytes(response, MAX_AUDIO_BYTES, "File SFX trống hoặc vượt quá giới hạn 20 MB.");
  }
}

interface EffectChoice {
  query: string;
  reason: string;
}

const rules: Array<{ words: string[]; choice: EffectChoice }> = [
  { words: ["bat ngo", "soc", "troi oi", "khong tin", "that a"], choice: { query: "vine boom", reason: "Khoảnh khắc bất ngờ" } },
  { words: ["cuoi", "haha", "vui", "hai huoc", "buon cuoi"], choice: { query: "funny laugh", reason: "Tình huống hài hước" } },
  { words: ["buon", "khoc", "that bai", "thua", "mat roi"], choice: { query: "sad violin", reason: "Sắc thái buồn hoặc thất bại" } },
  { words: ["danh", "dam", "dap", "va cham", "nga", "roi xuong"], choice: { query: "impact sound", reason: "Hành động hoặc va chạm" } },
  { words: ["khong hieu", "gi vay", "tai sao", "ha?", "sao co"], choice: { query: "huh meme", reason: "Phản ứng khó hiểu" } },
  { words: ["thang", "thanh cong", "tuyet voi", "gioi", "chuc mung"], choice: { query: "success applause", reason: "Thành công hoặc chúc mừng" } },
  { words: ["so", "ma", "kinh di", "am anh"], choice: { query: "horror scare", reason: "Không khí sợ hãi" } },
  { words: ["yeu", "crush", "tinh yeu", "trai tim"], choice: { query: "love sound", reason: "Cảm xúc tình cảm" } },
  { words: ["tuc", "gian", "cay", "buc minh"], choice: { query: "angry rage", reason: "Cảm xúc tức giận" } },
  { words: ["tien", "giau", "luong", "mua", "ban"], choice: { query: "cash register", reason: "Nội dung tiền bạc" } }
];

function normalizeVietnamese(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replaceAll("đ", "d").toLowerCase();
}

export function chooseSoundEffect(text: string): EffectChoice {
  const normalized = normalizeVietnamese(text);
  return rules.find((rule) => rule.words.some((word) => normalized.includes(word)))?.choice
    ?? { query: "whoosh transition", reason: "Chuyển sang cảnh mới" };
}

function hashNumber(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export interface AutoSoundEffectResult {
  project: ProjectData;
  assigned: number;
  skipped: Array<{ commentId: string; error: string }>;
}

export class SoundEffectService {
  constructor(
    private readonly store: ProjectStore,
    private readonly provider: SoundEffectProvider = new MyInstantsProvider()
  ) {}

  private async ensureFixedAsset(project: ProjectData, pageUrl: string, query: string) {
    const pathname = new URL(pageUrl).pathname;
    const existing = project.soundEffects.assets.find((asset) => new URL(asset.sourcePageUrl).pathname === pathname);
    if (existing) return existing;
    const direct = await this.provider.resolvePage?.(pageUrl).catch(() => undefined);
    const candidates = direct ? [direct] : await this.provider.search(query);
    const candidate = candidates.find((item) => new URL(item.pageUrl).pathname === pathname);
    if (!candidate) throw new Error(`Không tìm thấy đúng sound effect “${query}” trên MyInstants.`);
    const content = await this.provider.download(candidate);
    const asset = await this.store.attachDownloadedSoundEffect(project.id, {
      title: candidate.title,
      sourcePageUrl: pageUrl,
      audioUrl: candidate.audioUrl,
      content
    });
    project.soundEffects.assets.push(asset);
    return asset;
  }

  async ensureCommentAppearanceSounds(projectId: string): Promise<ProjectData> {
    const project = await this.store.get(projectId);
    const intro = await this.ensureFixedAsset(project, COMMENT_INTRO_PAGE, "tununuuuu");
    const next = await this.ensureFixedAsset(project, COMMENT_NEXT_PAGE, "mouse click by ek6");
    project.soundEffects.appearance = {
      ...project.soundEffects.appearance,
      enabled: true,
      introAssetId: intro.id,
      nextAssetId: next.id
    };
    project.soundEffects.enabled = true;
    return this.store.save(project);
  }

  async ensureConversationDing(projectId: string, commentId: string): Promise<ProjectData> {
    const project = await this.store.get(projectId);
    const comment = project.comments.find((candidate) => candidate.id === commentId);
    if (!comment?.conversation) throw new Error("Comment chưa có ảnh hội thoại.");
    const assigned = project.soundEffects.assets.find((asset) => asset.id === comment.conversation?.dingAssetId);
    if (assigned) return project;
    const existing = project.soundEffects.assets.find((asset) => new URL(asset.sourcePageUrl).pathname.endsWith("/instant/ding-sound-effect/"));
    if (existing) {
      comment.conversation.dingAssetId = existing.id;
      return this.store.save(project);
    }
    const candidates = await this.provider.search("ding sound effect");
    const candidate = candidates.find((item) => new URL(item.pageUrl).pathname.endsWith("/instant/ding-sound-effect/"));
    if (!candidate) throw new Error("Không tìm thấy đúng âm “ding sound effect” trên MyInstants.");
    const content = await this.provider.download(candidate);
    const asset = await this.store.attachDownloadedSoundEffect(projectId, {
      title: candidate.title,
      sourcePageUrl: CONVERSATION_DING_PAGE,
      audioUrl: candidate.audioUrl,
      content
    });
    project.soundEffects.assets.push(asset);
    comment.conversation.dingAssetId = asset.id;
    project.soundEffects.enabled = true;
    return this.store.save(project);
  }

  async autoAssign(projectId: string, commentId?: string, force = false): Promise<AutoSoundEffectResult> {
    const project = await this.store.get(projectId);
    const comments = commentId
      ? project.comments.filter((comment) => comment.id === commentId)
      : project.comments.slice().sort((left, right) => left.order - right.order);
    if (commentId && !comments.length) throw new Error("Không tìm thấy comment cần chọn SFX.");
    const queryCache = new Map<string, MyInstantsCandidate[]>();
    const usedPages = new Set(project.soundEffects.events.map((event) => (
      project.soundEffects.assets.find((asset) => asset.id === event.assetId)?.sourcePageUrl
    )).filter((value): value is string => Boolean(value)));
    const skipped: AutoSoundEffectResult["skipped"] = [];
    let assigned = 0;

    for (const comment of comments) {
      const current = project.soundEffects.events.find((event) => event.commentId === comment.id);
      if (current?.locked && !force) continue;
      if (current && !force) continue;
      if (!comment.text.trim()) {
        skipped.push({ commentId: comment.id, error: "Comment chưa có nội dung đọc." });
        continue;
      }
      try {
        const choice = chooseSoundEffect(comment.text);
        let candidates = queryCache.get(choice.query);
        if (!candidates) {
          candidates = await this.provider.search(choice.query);
          queryCache.set(choice.query, candidates);
        }
        if (!candidates.length) throw new Error(`Không tìm thấy “${choice.query}” trên MyInstants.`);
        const unused = candidates.filter((candidate) => !usedPages.has(candidate.pageUrl));
        const pool = unused.length ? unused : candidates;
        const candidate = pool[hashNumber(`${project.id}:${comment.id}:${force ? Date.now() : 0}`) % pool.length]!;
        let asset = project.soundEffects.assets.find((item) => item.sourcePageUrl === candidate.pageUrl);
        if (!asset) {
          const content = await this.provider.download(candidate);
          asset = await this.store.attachDownloadedSoundEffect(project.id, {
            title: candidate.title,
            sourcePageUrl: candidate.pageUrl,
            audioUrl: candidate.audioUrl,
            content
          });
          project.soundEffects.assets.push(asset);
        }
        project.soundEffects.events = project.soundEffects.events.filter((event) => event.commentId !== comment.id);
        project.soundEffects.events.push({
          id: randomUUID(),
          commentId: comment.id,
          assetId: asset.id,
          offsetSeconds: 0.08,
          volume: 1,
          locked: false,
          query: choice.query,
          reason: choice.reason
        });
        usedPages.add(candidate.pageUrl);
        assigned += 1;
      } catch (error) {
        skipped.push({ commentId: comment.id, error: error instanceof Error ? error.message : "Không chọn được SFX." });
      }
    }
    project.soundEffects.enabled = true;
    return { project: await this.store.save(project), assigned, skipped };
  }
}
