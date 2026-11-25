import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadsCommentCandidate } from "@comment-video-studio/shared";
import {
  buildThreadsCandidates,
  rankThreadsComments,
  renderThreadsCommentCard,
  selectThreadsContentMedia,
  ThreadsImportService,
  threadsAvatarPlaceholder,
  threadsPostKey,
  validateThreadsUrl,
  type ThreadsSource
} from "./threads.js";
import { ProjectStore } from "./storage.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function candidate(overrides: Partial<ThreadsCommentCandidate> = {}): ThreadsCommentCandidate {
  return {
    id: "comment-1",
    parentId: "post",
    depth: 0,
    username: "nguoidung",
    text: "Đúng quá",
    permalink: "https://www.threads.net/@nguoidung/post/comment-1",
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    media: [],
    score: 0,
    reasons: [],
    suggested: false,
    ...overrides
  };
}

describe("phân tích Threads", () => {
  it("chỉ chấp nhận link bài viết Threads công khai", () => {
    expect(validateThreadsUrl("https://www.threads.net/@kenh/post/ABC123#reply")).toBe("https://www.threads.net/@kenh/post/ABC123");
    expect(validateThreadsUrl("https://www.threads.com/@kenh/post/ABC123")).toContain("threads.com");
    expect(() => validateThreadsUrl("https://example.com/@kenh/post/ABC123")).toThrow(/threads/i);
    expect(threadsPostKey("https://www.threads.com/@KeNh/post/ABC123/media")).toBe("kenh/ABC123");
  });

  it("nhận đúng bài từ link, không biến comment ghim thành bài gốc hoặc comment cha", () => {
    const image = (url: string) => ({ url, renderedWidth: 0, renderedHeight: 0, naturalWidth: 0, naturalHeight: 0 });
    const rows = [
      { id: "pinned", permalink: "https://www.threads.net/@spam/post/PIN", username: "spam", text: "Comment ghim", x: 476, y: 50, pinned: true, images: [image("https://cdn.test/pin.jpg")], likeLabel: "2", replyLabel: "0", repostLabel: "0" },
      { id: "post", permalink: "https://www.threads.net/@kenh/post/POST", username: "kenh", text: "Bài viết thật\n1\n/\n2", x: 500, y: 100, pinned: false, images: [], likeLabel: "7,1K", replyLabel: "657", repostLabel: "249" },
      { id: "comment", permalink: "https://www.threads.net/@ban/post/C1", username: "ban", text: "Comment thường", x: 500, y: 200, pinned: false, images: [], likeLabel: "10", replyLabel: "1", repostLabel: "0" },
      { id: "reply", permalink: "https://www.threads.net/@reply/post/R1", username: "reply", text: "Câu trả lời", x: 528, y: 240, pinned: false, images: [], likeLabel: "4", replyLabel: "0", repostLabel: "0" }
    ];
    const result = buildThreadsCandidates(rows, "https://www.threads.com/@kenh/post/POST");
    expect(result.post.id).toBe("post");
    expect(result.post.text).toBe("Bài viết thật");
    expect(result.comments.map((item) => [item.id, item.parentId, item.depth])).toEqual([
      ["pinned", "post", 0],
      ["comment", "post", 0],
      ["reply", "comment", 1]
    ]);
  });

  it("loại avatar độ phân giải lớn nhưng giữ ảnh nội dung bài viết", () => {
    const media = selectThreadsContentMedia([
      {
        url: "https://scontent.test.fbcdn.net/avatar.jpg",
        alt: "Ảnh đại diện",
        anchorHref: "https://www.threads.net/@kenh",
        renderedWidth: 40,
        renderedHeight: 40,
        naturalWidth: 640,
        naturalHeight: 640
      },
      {
        url: "https://scontent.test.fbcdn.net/chat.jpg",
        alt: "Ảnh đoạn chat",
        anchorHref: "https://www.threads.net/@kenh/post/POST/media",
        renderedWidth: 240,
        renderedHeight: 430,
        naturalWidth: 1080,
        naturalHeight: 1920
      }
    ]);
    expect(media).toEqual([{ url: "https://scontent.test.fbcdn.net/chat.jpg", type: "image", alt: "Ảnh đoạn chat" }]);
  });

  it("không loại comment ngắn khi phù hợp hoặc có nhiều tim", () => {
    const ranked = rankThreadsComments("Chuyện đi làm hôm nay thật buồn cười", [
      candidate({ id: "short", text: "Đúng quá", likeCount: 2_400 }),
      candidate({ id: "long", text: "Mời bạn inbox mua ngay sản phẩm ở https://spam.test", likeCount: 3_000 })
    ]);
    const short = ranked.find((item) => item.id === "short")!;
    const spam = ranked.find((item) => item.id === "long")!;
    expect(short.suggested).toBe(true);
    expect(short.reasons).toContain("Ngắn nhưng phù hợp hoặc nhiều tim");
    expect(short.score).toBeGreaterThan(spam.score);
  });

  it("tạo card PNG giữ text, tên và tỷ lệ hợp lệ", async () => {
    const content = await renderThreadsCommentCard(candidate({ username: "nguoidung", text: "Một bình luận tiếng Việt có dấu", likeCount: 278 }));
    const metadata = await sharp(content).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1_000);
    expect(metadata.height).toBeGreaterThan(200);
  });

  it("dùng avatar xám trống thay vì chèn chữ cái đầu tên tài khoản", () => {
    const avatar = threadsAvatarPlaceholder();
    expect(avatar).toContain("<circle");
    expect(avatar).toContain("#e5e7eb");
    expect(avatar).not.toContain("<text");
  });
});

describe("nhập comment Threads", () => {
  it("mở và giữ phiên Chrome local thông qua nguồn Threads", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-threads-browser-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const open = vi.fn(async (url?: string) => ({ open: true, url: url ?? "https://www.threads.com/", message: "Chrome local đã mở" }));
    const source: ThreadsSource = {
      open,
      read: vi.fn(async () => { throw new Error("Không dùng trong test này"); })
    };
    const service = new ThreadsImportService(store, source, { recognize: vi.fn() } as never, {} as never);

    const result = await service.openBrowser("https://www.threads.net/@kenh/post/ABC123");

    expect(result.open).toBe(true);
    expect(open).toHaveBeenCalledWith("https://www.threads.net/@kenh/post/ABC123");
  });

  it("đóng Chrome local trước khi chuyển sang điều khiển Chrome thật", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-threads-close-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const close = vi.fn(async () => undefined);
    const source: ThreadsSource = {
      close,
      read: vi.fn(async () => { throw new Error("Không dùng trong test này"); })
    };
    const service = new ThreadsImportService(store, source, { recognize: vi.fn() } as never, {} as never);

    await service.closeBrowser();

    expect(close).toHaveBeenCalledOnce();
  });

  it("tự kèm comment cha khi chọn reply và đưa ảnh thường vào vùng media", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-threads-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot, { probeImage: async () => ({ width: 800, height: 600 }) });
    await store.initialize();
    const project = await store.create("Threads tự động");
    const post = candidate({ id: "post", parentId: undefined, text: "Bài viết gốc", permalink: "https://www.threads.net/@kenh/post/POST" });
    const parent = candidate({ id: "parent", username: "cha", text: "Comment cha rất hay", likeCount: 99 });
    const reply = candidate({
      id: "reply",
      parentId: "parent",
      depth: 1,
      username: "con",
      text: "Trả lời ngắn nhưng đúng",
      likeCount: 18,
      media: [{ url: "https://scontent.test.fbcdn.net/photo.jpg", type: "image" }]
    });
    const source: ThreadsSource = { read: vi.fn(async () => ({ sourceUrl: post.permalink, post, comments: [parent, reply] })) };
    const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const fetcher = vi.fn(async () => new Response(image, { status: 200, headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
    const ocr = { recognize: vi.fn(async () => ({ language: "vi-VN", supportedLanguages: ["vi-VN"], observations: [
      { text: "Ảnh minh họa", confidence: 0.99, x: 0.2, y: 0.3, width: 0.4, height: 0.08 }
    ] })) };
    const soundEffects = {
      ensureConversationDing: vi.fn(async () => store.get(project.id)),
      ensureCommentAppearanceSounds: vi.fn(async () => store.get(project.id))
    };
    const service = new ThreadsImportService(store, source, ocr, soundEffects as never, fetcher);
    const analyzed = await service.analyze(post.permalink);
    const result = await service.importSelection(project.id, analyzed.analysisId, ["reply"]);

    expect(result.comments).toHaveLength(2);
    expect(result.comments.map((comment) => comment.text)).toEqual(["Comment cha rất hay", "Trả lời ngắn nhưng đúng"]);
    expect(result.comments[1]?.parentCommentId).toBe(result.comments[0]?.id);
    expect(result.comments[1]?.attachment).toMatchObject({
      detectedType: "text",
      holdAfterSeconds: 2,
      asset: { mimeType: "image/jpeg", width: 800, height: 600 }
    });
    expect(result.comments[1]?.source).toMatchObject({ provider: "threads", sourceId: "reply", likeCount: 18 });
    expect(soundEffects.ensureCommentAppearanceSounds).toHaveBeenCalledWith(project.id);
  });

  it("nhận diện ảnh chat thành hội thoại và giữ ding riêng cho từng tin", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-threads-chat-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot, { probeImage: async () => ({ width: 720, height: 1280 }) });
    await store.initialize();
    const project = await store.create("Threads chat");
    const post = candidate({ id: "post", parentId: undefined, text: "Bài gốc", permalink: "https://www.threads.net/@kenh/post/POST" });
    const chat = candidate({ id: "chat", text: "Đoạn hội thoại", media: [{ url: "https://scontent.test.fbcdn.net/chat.png", type: "image" }] });
    const source: ThreadsSource = { read: async () => ({ sourceUrl: post.permalink, post, comments: [chat] }) };
    const image = await sharp({ create: { width: 32, height: 48, channels: 3, background: "#fff" } }).png().toBuffer();
    const fetcher = vi.fn(async () => new Response(image, { status: 200, headers: { "content-type": "image/png" } })) as unknown as typeof fetch;
    const ocr = { recognize: vi.fn(async () => ({ language: "vi-VN", supportedLanguages: ["vi-VN"], observations: [
      { text: "Tin bên trái một", confidence: 0.99, x: 0.08, y: 0.24, width: 0.32, height: 0.06 },
      { text: "Tin bên phải", confidence: 0.99, x: 0.6, y: 0.4, width: 0.3, height: 0.06 },
      { text: "Tin bên trái hai", confidence: 0.99, x: 0.08, y: 0.58, width: 0.32, height: 0.06 }
    ] })) };
    const soundEffects = {
      ensureConversationDing: vi.fn(async () => store.get(project.id)),
      ensureCommentAppearanceSounds: vi.fn(async () => store.get(project.id))
    };
    const service = new ThreadsImportService(store, source, ocr, soundEffects as never, fetcher);
    const analyzed = await service.analyze(post.permalink);
    const result = await service.importSelection(project.id, analyzed.analysisId, ["chat"]);

    expect(result.comments[0]?.conversation?.messages).toHaveLength(3);
    expect(result.comments[0]?.conversation?.mode).toBe("after-comment");
    expect(result.comments[0]?.attachment).toBeUndefined();
    expect(soundEffects.ensureConversationDing).toHaveBeenCalledWith(project.id, result.comments[0]?.id);
  });

  it("cho phép nhập bài gốc và giữ nguyên B-roll, watermark, logo của project", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-threads-pipeline-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot, { probeImage: async () => ({ width: 800, height: 600 }) });
    await store.initialize();
    let project = await store.create("Threads đủ pipeline");
    project.illustrations.enabled = true;
    project.illustrations.videos = [{ id: "broll", relativePath: "assets/broll.mp4", originalName: "broll.mp4", mimeType: "video/mp4", size: 1, duration: 12, width: 1080, height: 1920 }];
    project.branding.watermark = { enabled: true, text: "@Kenh", opacity: 0.4, xPercent: 50, yPercent: 90, fontSize: 42 };
    project.branding.logo.enabled = true;
    project.branding.logo.asset = { relativePath: "assets/logo.png", originalName: "logo.png", mimeType: "image/png", size: 1, width: 256, height: 256 };
    project = await store.save(project);
    const post = candidate({ id: "post", parentId: undefined, text: "Bài viết gốc", permalink: "https://www.threads.net/@kenh/post/POST" });
    const source: ThreadsSource = { read: async () => ({ sourceUrl: post.permalink, post, comments: [] }) };
    const soundEffects = { ensureConversationDing: vi.fn(), ensureCommentAppearanceSounds: vi.fn(async () => store.get(project.id)) };
    const service = new ThreadsImportService(store, source, { recognize: vi.fn() }, soundEffects as never);
    const analyzed = await service.analyze(post.permalink);
    const result = await service.importSelection(project.id, analyzed.analysisId, [post.id]);

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]?.source?.sourceId).toBe("post");
    expect(result.illustrations).toMatchObject({ enabled: true, videos: [{ id: "broll" }] });
    expect(result.branding.watermark).toMatchObject({ enabled: true, text: "@Kenh" });
    expect(result.branding.logo).toMatchObject({ enabled: true, asset: { originalName: "logo.png" } });
  });

  it("chặn chuyển hướng ảnh đính kèm sang máy chủ không thuộc Threads/Meta", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-threads-ssrf-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot, { probeImage: async () => ({ width: 800, height: 600 }) });
    await store.initialize();
    const project = await store.create("Threads chặn redirect");
    const post = candidate({
      id: "post",
      parentId: undefined,
      text: "Bài viết gốc",
      permalink: "https://www.threads.net/@kenh/post/POST",
      media: [{ url: "https://scontent.test.fbcdn.net/photo.jpg", type: "image" }]
    });
    const source: ThreadsSource = { read: async () => ({ sourceUrl: post.permalink, post, comments: [] }) };
    const soundEffects = { ensureConversationDing: vi.fn(), ensureCommentAppearanceSounds: vi.fn(async () => store.get(project.id)) };
    const fetcher = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1:43123/api/health" }
    })) as unknown as typeof fetch;
    const service = new ThreadsImportService(store, source, { recognize: vi.fn() }, soundEffects as never, fetcher);
    const analyzed = await service.analyze(post.permalink);

    await expect(service.importSelection(project.id, analyzed.analysisId, [post.id]))
      .rejects.toThrow(/HTTPS|máy chủ media/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
