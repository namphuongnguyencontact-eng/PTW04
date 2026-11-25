import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseSoundEffect,
  COMMENT_INTRO_PAGE,
  COMMENT_NEXT_PAGE,
  MyInstantsProvider,
  parseMyInstantsPage,
  parseMyInstantsSearch,
  SoundEffectService,
  type SoundEffectProvider
} from "./sound-effects.js";
import { ProjectStore } from "./storage.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MyInstants", () => {
  it("đọc đúng tên, trang nguồn và MP3 từ kết quả tìm kiếm", () => {
    const html = `<button class="small-button" onclick="play('/media/sounds/vine-boom.mp3', 'loader-1', 'vine')"></button>
      <a href="/en/instant/vine-boom-1/" class="instant-link link-secondary">VINE &amp; BOOM</a>`;
    expect(parseMyInstantsSearch(html)).toEqual([{
      title: "VINE & BOOM",
      pageUrl: "https://www.myinstants.com/en/instant/vine-boom-1/",
      audioUrl: "https://www.myinstants.com/media/sounds/vine-boom.mp3"
    }]);
  });

  it("lấy chính xác MP3 từ trang instant thay vì phụ thuộc kết quả tìm kiếm", () => {
    expect(parseMyInstantsPage(COMMENT_INTRO_PAGE, `
      <script>var preloadAudioUrl = '/media/sounds/tununuuuu.mp3';</script>
      <title>Tununuuuu - Bouton d'effet sonore instantané | Myinstants</title>
    `)).toEqual({
      title: "Tununuuuu",
      pageUrl: COMMENT_INTRO_PAGE,
      audioUrl: "https://www.myinstants.com/media/sounds/tununuuuu.mp3"
    });
  });

  it("chọn nhóm hiệu ứng theo nội dung tiếng Việt có dấu", () => {
    expect(chooseSoundEffect("Trời ơi, tôi không tin nổi!")).toMatchObject({ query: "vine boom" });
    expect(chooseSoundEffect("Cảnh bình thường tiếp theo")).toMatchObject({ query: "whoosh transition" });
  });

  it("tự gán SFX, lưu cache local và tái sử dụng cùng một file", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-sfx-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot, { probeAudio: async () => ({ duration: 1.25 }) });
    await store.initialize();
    const project = await store.create("SFX tự động");
    project.comments = ["Cảnh thường một", "Cảnh thường hai"].map((text, index) => ({
      id: `comment-${index}`,
      order: index + 1,
      image: { relativePath: `assets/comments/${index}.png`, originalName: `${index}.png`, mimeType: "image/png", size: 1 },
      text,
      rate: 1,
      pitch: 0,
      pauseAfter: 0,
      audioStatus: "missing" as const
    }));
    await store.save(project);
    const provider: SoundEffectProvider = {
      search: vi.fn(async () => [{ title: "Whoosh", pageUrl: "https://www.myinstants.com/en/instant/whoosh-1/", audioUrl: "https://www.myinstants.com/media/sounds/whoosh.mp3" }]),
      download: vi.fn(async () => new Uint8Array([73, 68, 51]))
    };
    const result = await new SoundEffectService(store, provider).autoAssign(project.id);
    expect(result.assigned).toBe(2);
    expect(result.project.soundEffects.events).toHaveLength(2);
    expect(result.project.soundEffects.assets).toHaveLength(1);
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(provider.download).toHaveBeenCalledTimes(1);
    expect(result.project.soundEffects.assets[0]).toMatchObject({ provider: "myinstants", duration: 1.25 });
  });

  it("tải đúng ding một lần và gắn cho mọi tin nhắn trong comment", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-ding-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot, { probeAudio: async () => ({ duration: 0.4 }) });
    await store.initialize();
    const project = await store.create("Ding hội thoại");
    project.comments = [{
      id: "chat", order: 1,
      image: { relativePath: "assets/comments/chat.png", originalName: "chat.png", mimeType: "image/png", size: 1 },
      text: "", rate: 1, pitch: 0, pauseAfter: 0, audioStatus: "missing",
      conversation: {
        enabled: true,
        image: { relativePath: "assets/conversations/chat.png", originalName: "chat.png", mimeType: "image/png", size: 1 },
        mode: "replace", revealMode: "scroll", speakerAVoiceId: "a", speakerBVoiceId: "b",
        messageGapSeconds: 0.08, dingEnabled: true, dingVolume: 0.25, dingLeadSeconds: 0.1,
        messages: [{ id: "m", order: 1, speaker: "a", text: "Chào", box: { x: 0.1, y: 0.2, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "missing" }]
      }
    }];
    await store.save(project);
    const provider: SoundEffectProvider = {
      search: vi.fn(async () => [{ title: "ding sound effect", pageUrl: "https://www.myinstants.com/en/instant/ding-sound-effect/", audioUrl: "https://www.myinstants.com/media/sounds/ding.mp3" }]),
      download: vi.fn(async () => new Uint8Array([73, 68, 51]))
    };
    const service = new SoundEffectService(store, provider);
    const first = await service.ensureConversationDing(project.id, "chat");
    const second = await service.ensureConversationDing(project.id, "chat");
    expect(first.comments[0]?.conversation?.dingAssetId).toBe(first.soundEffects.assets[0]?.id);
    expect(first.soundEffects.assets[0]?.sourcePageUrl).toBe("https://www.myinstants.com/fr/instant/ding-sound-effect/");
    expect(second.soundEffects.assets).toHaveLength(1);
    expect(provider.download).toHaveBeenCalledTimes(1);
  });

  it("cố định tununuuuu cho comment đầu và mouse click cho các comment sau", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-appearance-sfx-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot, { probeAudio: async () => ({ duration: 0.5 }) });
    await store.initialize();
    const project = await store.create("SFX xuất hiện comment");
    const provider: SoundEffectProvider = {
      search: vi.fn(async (query: string) => query === "tununuuuu"
        ? [{ title: "tununuuuu", pageUrl: COMMENT_INTRO_PAGE, audioUrl: "https://www.myinstants.com/media/sounds/tununuuuu.mp3" }]
        : [{ title: "mouse click by ek6", pageUrl: COMMENT_NEXT_PAGE, audioUrl: "https://www.myinstants.com/media/sounds/mouse-click.mp3" }]),
      download: vi.fn(async () => new Uint8Array([73, 68, 51]))
    };
    const service = new SoundEffectService(store, provider);
    const first = await service.ensureCommentAppearanceSounds(project.id);
    const second = await service.ensureCommentAppearanceSounds(project.id);

    expect(first.soundEffects.assets.map((asset) => asset.sourcePageUrl)).toEqual([COMMENT_INTRO_PAGE, COMMENT_NEXT_PAGE]);
    expect(first.soundEffects.appearance).toMatchObject({ enabled: true, volume: 0.35 });
    expect(first.soundEffects.appearance.introAssetId).not.toBe(first.soundEffects.appearance.nextAssetId);
    expect(second.soundEffects.assets).toHaveLength(2);
    expect(provider.download).toHaveBeenCalledTimes(2);
  });

  it.skipIf(process.env.CVS_MYINSTANTS_INTEGRATION !== "1")("tìm và tải MP3 thật trực tiếp từ MyInstants", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-sfx-live-test-"));
    roots.push(dataRoot);
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const project = await store.create("MyInstants thật");
    project.comments = [{
      id: "comment-live", order: 1,
      image: { relativePath: "assets/comments/live.png", originalName: "live.png", mimeType: "image/png", size: 1 },
      text: "Trời ơi, thật bất ngờ!", rate: 1, pitch: 0, pauseAfter: 0, audioStatus: "missing",
      conversation: {
        enabled: true,
        image: { relativePath: "assets/conversations/live.png", originalName: "live.png", mimeType: "image/png", size: 1 },
        mode: "replace", revealMode: "scroll", speakerAVoiceId: "a", speakerBVoiceId: "b",
        messageGapSeconds: 0.08, dingEnabled: true, dingVolume: 0.25, dingLeadSeconds: 0.1,
        messages: [{ id: "m", order: 1, speaker: "a", text: "Xin chào", box: { x: 0.1, y: 0.2, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "missing" }]
      }
    }];
    await store.save(project);
    const service = new SoundEffectService(store, new MyInstantsProvider());
    const result = await service.autoAssign(project.id);
    expect(result.assigned).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(result.project.soundEffects.assets[0]?.sourcePageUrl).toMatch(/^https:\/\/www\.myinstants\.com\/.+\/instant\//);
    expect(result.project.soundEffects.assets[0]?.duration).toBeGreaterThan(0);
    const withDing = await service.ensureConversationDing(project.id, "comment-live");
    const ding = withDing.soundEffects.assets.find((asset) => asset.id === withDing.comments[0]?.conversation?.dingAssetId);
    expect(ding?.sourcePageUrl).toBe("https://www.myinstants.com/fr/instant/ding-sound-effect/");
    expect(ding?.duration).toBeGreaterThan(0);
    const withAppearance = await service.ensureCommentAppearanceSounds(project.id);
    expect(withAppearance.soundEffects.assets.find((asset) => asset.id === withAppearance.soundEffects.appearance.introAssetId)?.sourcePageUrl).toBe(COMMENT_INTRO_PAGE);
    expect(withAppearance.soundEffects.assets.find((asset) => asset.id === withAppearance.soundEffects.appearance.nextAssetId)?.sourcePageUrl).toBe(COMMENT_NEXT_PAGE);
  }, 60_000);

  it("chặn chuyển hướng sang tên miền ngoài MyInstants khi tải SFX", async () => {
    const fetcher = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1:43123/api/health" }
    })) as unknown as typeof fetch;
    const provider = new MyInstantsProvider(fetcher);
    await expect(provider.download({
      title: "Ding",
      pageUrl: "https://www.myinstants.com/en/instant/ding/",
      audioUrl: "https://www.myinstants.com/media/sounds/ding.mp3"
    })).rejects.toThrow("không thuộc MyInstants");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
