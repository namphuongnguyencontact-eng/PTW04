import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ILLUSTRATION_THUMBNAILS, ProjectStore } from "./storage.js";

let dataRoot: string;
let store: ProjectStore;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-store-test-"));
  store = new ProjectStore(dataRoot);
  await store.initialize();
});

afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

describe("ProjectStore", () => {
  it("project và comment mới dùng mặc định giọng 1,2x, nghỉ 0,1 giây và Smart Layout", async () => {
    const project = await store.create("Mặc định mới");
    expect(project.settings).toMatchObject({
      defaultRate: 1.2,
      defaultPitch: 0,
      defaultPauseAfter: 0.1,
      smartLayout: { enabled: true, mode: "auto", gapPixels: 40 }
    });
    expect(project.branding).toMatchObject({
      watermark: { enabled: false, opacity: 0.35 },
      logo: { enabled: false, opacity: 0.9, widthPercent: 16 }
    });
    expect(project.illustrations.timingMode).toBe("fixed");
    expect(project.soundEffects).toMatchObject({ enabled: true, volume: 0.2, assets: [], events: [] });
  });

  it("tự nâng cấp project cũ khi đọc mà không làm mất cấu hình", async () => {
    const project = await store.create("Tương thích cũ");
    const { illustrations: _illustrations, music: _music, soundEffects: _soundEffects, ...legacy } = project;
    const { smartLayout: _smartLayout, ...legacySettings } = legacy.settings;
    await writeFile(store.projectFile(project.id), JSON.stringify({ ...legacy, settings: legacySettings }), "utf8");
    const loaded = await store.get(project.id);
    expect(loaded.illustrations.videos).toEqual([]);
    expect(loaded.music.volume).toBe(0.1);
    expect(loaded.soundEffects).toMatchObject({ enabled: true, volume: 0.2, assets: [], events: [] });
    expect(loaded.settings.smartLayout).toMatchObject({ enabled: false, mode: "manual" });
    await store.save(loaded);
    await expect(access(`${store.projectFile(project.id)}.backup-before-smart-layout`)).resolves.toBeUndefined();
  });

  it("chuẩn hóa lại thứ tự comment khi lưu", async () => {
    const project = await store.create("Sắp xếp");
    project.comments = [
      {
        id: "b",
        order: 10,
        image: { relativePath: "assets/comments/b.png", originalName: "b.png", mimeType: "image/png", size: 1 },
        text: "B",
        rate: 1,
        pitch: 0,
        pauseAfter: 0.4,
        audioStatus: "missing"
      },
      {
        id: "a",
        order: 2,
        image: { relativePath: "assets/comments/a.png", originalName: "a.png", mimeType: "image/png", size: 1 },
        text: "A",
        rate: 1,
        pitch: 0,
        pauseAfter: 0.4,
        audioStatus: "missing"
      }
    ];
    const saved = await store.save(project);
    expect(saved.comments.map(({ id, order }) => [id, order])).toEqual([["a", 1], ["b", 2]]);
  });

  it("xóa hết comment nhưng giữ nguyên toàn bộ setting và thư viện dùng chung", async () => {
    store = new ProjectStore(dataRoot, { probeImage: async () => ({ width: 900, height: 600 }) });
    await store.initialize();
    const project = await store.create("Dùng lại project");
    const imagePath = path.join(dataRoot, "comment-can-xoa.png");
    await writeFile(imagePath, "comment");
    const imported = await store.importCommentImages(project.id, [{ path: imagePath, originalname: "comment.png", mimetype: "image/png", size: 7 }]);
    imported.settings.defaultRate = 1.25;
    imported.branding.watermark = { ...imported.branding.watermark, enabled: true, text: "@kenh" };
    imported.illustrations.videos = [{ id: "broll-1", relativePath: "assets/illustrations/broll.mp4", originalName: "broll.mp4", mimeType: "video/mp4", size: 1, duration: 5, width: 720, height: 1280 }];
    imported.music.enabled = true;
    imported.soundEffects.assets = [{ id: "sfx-1", provider: "myinstants", sourcePageUrl: "https://example.test/sfx", title: "SFX", relativePath: "assets/sfx/click.mp3", originalName: "click.mp3", mimeType: "audio/mpeg", size: 1, duration: 1 }];
    await store.save(imported);

    const cleared = await store.clearComments(project.id);

    expect(cleared.comments).toEqual([]);
    expect(cleared.illustrations.segments).toEqual([]);
    expect(cleared.soundEffects.events).toEqual([]);
    expect(cleared.settings.defaultRate).toBe(1.25);
    expect(cleared.branding.watermark).toMatchObject({ enabled: true, text: "@kenh" });
    expect(cleared.illustrations.videos).toHaveLength(1);
    expect(cleared.music.enabled).toBe(true);
    expect(cleared.soundEffects.assets).toHaveLength(1);
    await expect(access(store.resolveProjectAsset(project.id, imported.comments[0]!.image.relativePath))).rejects.toThrow();
  });

  it("xóa toàn bộ giọng đọc nhưng giữ comment, nội dung và cấu hình", async () => {
    const project = await store.create("Xóa audio");
    const imagePath = store.resolveProjectAsset(project.id, "assets/comments/a.png");
    const audioPath = store.resolveProjectAsset(project.id, "audio/comment.mp3");
    const messageAudioPath = store.resolveProjectAsset(project.id, "audio/message.mp3");
    await mkdir(path.dirname(imagePath), { recursive: true });
    await mkdir(path.dirname(audioPath), { recursive: true });
    await Promise.all([
      writeFile(imagePath, "image"),
      writeFile(audioPath, "comment-audio"),
      writeFile(messageAudioPath, "message-audio")
    ]);
    project.comments = [{
      id: "comment-a",
      order: 1,
      image: { relativePath: "assets/comments/a.png", originalName: "a.png", mimeType: "image/png", size: 5 },
      text: "Nội dung vẫn giữ",
      rate: 1.2,
      pitch: 0,
      pauseAfter: 0.1,
      audioStatus: "ready",
      audioPath: "audio/comment.mp3",
      audioDuration: 3,
      audioCacheKey: "comment-cache",
      audioProcessingVersion: 2,
      conversation: {
        enabled: true,
        image: { relativePath: "assets/comments/a.png", originalName: "a.png", mimeType: "image/png", size: 5 },
        mode: "replace",
        revealMode: "scroll",
        speakerAVoiceId: "voice-a",
        speakerBVoiceId: "voice-b",
        messageGapSeconds: 0.1,
        dingEnabled: true,
        dingVolume: 0.25,
        dingLeadSeconds: 0.1,
        messages: [{
          id: "message-a", order: 1, speaker: "a", text: "Tin nhắn vẫn giữ",
          box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 }, confidence: 1,
          audioStatus: "ready", audioPath: "audio/message.mp3", audioDuration: 1,
          audioCacheKey: "message-cache", audioProcessingVersion: 2,
          revealStartSeconds: 0, voiceStartSeconds: 0.1
        }]
      }
    }];
    project.branding.watermark = { ...project.branding.watermark, enabled: true, text: "@kenh" };
    await store.save(project);

    const cleared = await store.clearProjectAudio(project.id);

    expect(cleared.comments[0]).toMatchObject({
      text: "Nội dung vẫn giữ",
      rate: 1.2,
      audioStatus: "missing",
      audioPath: undefined,
      audioDuration: undefined
    });
    expect(cleared.comments[0]!.conversation!.messages[0]).toMatchObject({
      text: "Tin nhắn vẫn giữ",
      audioStatus: "missing",
      audioPath: undefined,
      revealStartSeconds: undefined,
      voiceStartSeconds: undefined
    });
    expect(cleared.branding.watermark).toMatchObject({ enabled: true, text: "@kenh" });
    await expect(access(audioPath)).rejects.toThrow();
    await expect(access(messageAudioPath)).rejects.toThrow();
  });

  it("xóa một project hoặc toàn bộ project cùng thư mục video đã xuất", async () => {
    const first = await store.create("Project một");
    const second = await store.create("Project hai");
    const firstOutput = path.join(store.outputsRoot, first.id, "video.mp4");
    await mkdir(path.dirname(firstOutput), { recursive: true });
    await writeFile(firstOutput, "video");

    await store.deleteProject(first.id);

    await expect(access(store.projectDirectory(first.id))).rejects.toThrow();
    await expect(access(path.dirname(firstOutput))).rejects.toThrow();
    expect((await store.list()).map((project) => project.id)).toEqual([second.id]);
    await expect(store.clearProjects()).resolves.toBe(1);
    expect(await store.list()).toEqual([]);
  });

  it("giữ toàn bộ video đã quét nhưng chỉ tạo vài chục thumbnail để không quá nặng", async () => {
    const createVideoThumbnail = vi.fn(async (_input: string, output: string) => writeFile(output, "thumb"));
    store = new ProjectStore(dataRoot, {
      probeVideo: async () => ({ duration: 8, width: 720, height: 1280 }),
      createVideoThumbnail
    });
    await store.initialize();
    const project = await store.create("Thư viện lớn");
    const uploadRoot = path.join(dataRoot, "test-uploads");
    await mkdir(uploadRoot, { recursive: true });
    const files = await Promise.all(Array.from({ length: 55 }, async (_value, index) => {
      const filePath = path.join(uploadRoot, `clip-${index}.mp4`);
      await writeFile(filePath, `video-${index}`);
      return { path: filePath, originalname: `clip-${index}.mp4`, mimetype: "video/mp4", size: 8 };
    }));

    const result = await store.importIllustrationVideos(project.id, files);
    expect(result.project.illustrations.videos).toHaveLength(55);
    expect(result.project.illustrations.videos.filter((video) => video.thumbnailPath)).toHaveLength(MAX_ILLUSTRATION_THUMBNAILS);
    expect(createVideoThumbnail).toHaveBeenCalledTimes(MAX_ILLUSTRATION_THUMBNAILS);
  });

  it("gắn ảnh hội thoại và nội dung OCR vào đúng comment", async () => {
    store = new ProjectStore(dataRoot, { probeImage: async () => ({ width: 720, height: 1280 }) });
    await store.initialize();
    const project = await store.create("Hội thoại");
    const commentImage = path.join(dataRoot, "comment.png");
    await writeFile(commentImage, "comment");
    const imported = await store.importCommentImages(project.id, [{ path: commentImage, originalname: "comment.png", mimetype: "image/png", size: 7 }]);
    const chatImage = path.join(dataRoot, "chat.png");
    await writeFile(chatImage, "chat");
    const saved = await store.importConversationImage(imported.id, imported.comments[0]!.id, {
      path: chatImage, originalname: "đoạn chat.png", mimetype: "image/png", size: 4
    }, [{ id: "m1", order: 1, speaker: "a", text: "Xin chào", box: { x: 0.1, y: 0.2, width: 0.4, height: 0.08 }, confidence: 0.9, audioStatus: "missing" }], "vi-VT");
    expect(saved.comments[0]?.conversation).toMatchObject({ enabled: true, ocrLanguage: "vi-VT", dingEnabled: true });
    expect(saved.comments[0]?.conversation?.messages[0]?.text).toBe("Xin chào");
    expect(saved.comments[0]?.audioStatus).toBe("stale");
    const envelope = await store.getEnvelope(project.id);
    expect(envelope.missingFiles).toEqual([]);
  });

  it("gắn ảnh minh họa thường vào comment và kiểm tra file bị thiếu", async () => {
    store = new ProjectStore(dataRoot, { probeImage: async () => ({ width: 900, height: 1_200 }) });
    await store.initialize();
    const project = await store.create("Ảnh đính kèm Threads");
    const cardPath = path.join(dataRoot, "card.png");
    await writeFile(cardPath, "card");
    const imported = await store.importCommentImages(project.id, [{ path: cardPath, originalname: "card.png", mimetype: "image/png", size: 4 }]);
    const attachmentPath = path.join(dataRoot, "ảnh thường.png");
    await writeFile(attachmentPath, "attachment");
    const saved = await store.importCommentAttachment(project.id, imported.comments[0]!.id, {
      path: attachmentPath, originalname: "ảnh thường.png", mimetype: "image/png", size: 10
    });
    expect(saved.comments[0]?.attachment).toMatchObject({
      kind: "image",
      asset: { originalName: "ảnh thường.png", width: 900, height: 1_200 },
      mode: "auto",
      detectedType: "illustration",
      textBlocks: [],
      holdAfterSeconds: 2,
      clickEnabled: true
    });
    await rm(store.resolveProjectAsset(project.id, saved.comments[0]!.attachment!.asset.relativePath));
    expect((await store.getEnvelope(project.id)).missingFiles).toContain(saved.comments[0]!.attachment!.asset.relativePath);
  });

  it("báo rõ media bị thiếu khi mở project", async () => {
    const project = await store.create("Thiếu file");
    project.background = {
      relativePath: "assets/background/missing.mp4",
      originalName: "missing.mp4",
      mimeType: "video/mp4",
      size: 100
    };
    project.branding.logo = {
      ...project.branding.logo,
      enabled: true,
      asset: { relativePath: "assets/branding/missing.png", originalName: "missing.png", mimeType: "image/png", size: 100 }
    };
    await store.save(project);
    const envelope = await store.getEnvelope(project.id);
    expect(envelope.missingFiles).toEqual(["assets/background/missing.mp4", "assets/branding/missing.png"]);
  });

  it("không cho đường dẫn thoát khỏi thư mục project", async () => {
    const project = await store.create("An toàn");
    expect(() => store.resolveProjectAsset(project.id, "../../secret.txt")).toThrow("không hợp lệ");
  });
});
