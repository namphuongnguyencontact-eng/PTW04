import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { RenderQueue } from "./render.js";
import type { TtsService } from "./tts.js";
import type { ProjectData } from "@comment-video-studio/shared";

let dataRoot: string;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-studio-test-"));
});

afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

describe("API ứng dụng", () => {
  it("trả trạng thái sẵn sàng bằng tiếng Việt-compatible JSON", async () => {
    const response = await request(createApp({ dataRoot })).get("/api/health").expect(200);
    expect(response.body).toEqual({ ok: true, app: "COMMENT VIDEO STUDIO" });
  });

  it("liệt kê, kiểm tra và lưu đúng hồ sơ Chrome thật cho TikTok", async () => {
    const profile = { directory: "Profile 2", name: "Kenh Demo" };
    const preflight = vi.fn(async () => ({
      profile,
      chromeOpened: true,
      appleEventsReady: true,
      accessibilityReady: true,
      message: "Chrome đã sẵn sàng"
    }));
    const tiktokPublishing = {
      listProfiles: vi.fn(async () => [profile]),
      preflight,
      openAccessibilitySettings: vi.fn(async () => undefined),
      list: vi.fn(() => []),
      enqueue: vi.fn(),
      cancel: vi.fn(),
      cancelProject: vi.fn(() => []),
      retry: vi.fn()
    };
    const closeBrowser = vi.fn(async () => undefined);
    const app = createApp({
      dataRoot,
      tiktokPublishing,
      threadsImportService: { closeBrowser } as never
    });

    expect((await request(app).get("/api/tiktok/chrome-profiles").expect(200)).body).toEqual([profile]);
    const checked = await request(app).post("/api/tiktok/preflight").send({ profileDirectory: "Profile 2" }).expect(200);
    expect(checked.body).toMatchObject({ appleEventsReady: true, accessibilityReady: true });
    expect(closeBrowser).toHaveBeenCalledBefore(preflight);
    expect(preflight).toHaveBeenCalledWith("Profile 2");
    await request(app).post("/api/tiktok/accessibility-settings").expect(204);
    expect(tiktokPublishing.openAccessibilitySettings).toHaveBeenCalledOnce();
  });

  it("chỉ nối tác vụ TikTok sau khi người dùng xác nhận và render hoàn tất", async () => {
    let settled: ((job: { id: string; projectId: string; status: string; outputPath?: string }) => void | Promise<void>) | undefined;
    const renderJob = {
      id: "render-tiktok",
      projectId: "",
      status: "queued" as const,
      progress: 0,
      createdAt: new Date().toISOString()
    };
    const renderQueue = {
      onSettled: vi.fn((listener) => { settled = listener; return () => undefined; }),
      enqueue: vi.fn((projectId: string) => ({ ...renderJob, projectId })),
      list: vi.fn(() => []),
      cancel: vi.fn(),
      cancelProject: vi.fn(() => []),
      retry: vi.fn()
    } as unknown as RenderQueue;
    const enqueue = vi.fn();
    const tiktokPublishing = {
      listProfiles: vi.fn(async () => [{ directory: "Profile 2", name: "Kenh Demo" }]),
      preflight: vi.fn(),
      openAccessibilitySettings: vi.fn(async () => undefined),
      list: vi.fn(() => []),
      enqueue,
      cancel: vi.fn(),
      cancelProject: vi.fn(() => []),
      retry: vi.fn()
    };
    const app = createApp({ dataRoot, renderQueue, tiktokPublishing });
    const created = await request(app).post("/api/projects").send({ name: "Đăng TikTok" }).expect(201);
    created.body.settings.tiktok = {
      enabled: true,
      chromeProfileDirectory: "Profile 2",
      chromeProfileName: "Kenh Demo",
      caption: "Caption #viral",
      mode: "now"
    };
    await request(app).put(`/api/projects/${created.body.id}`).send(created.body).expect(200);

    await request(app).post("/api/render-jobs").send({ projectId: created.body.id, publishToTikTok: true }).expect(400);
    await request(app).post("/api/render-jobs").send({ projectId: created.body.id, publishToTikTok: true, publishConfirmed: true }).expect(202);
    expect(enqueue).not.toHaveBeenCalled();
    await settled?.({ id: "render-tiktok", projectId: created.body.id, status: "completed", outputPath: "outputs/video.mp4" });
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledOnce());
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      projectId: created.body.id,
      renderJobId: "render-tiktok",
      settings: expect.objectContaining({ chromeProfileDirectory: "Profile 2", caption: "Caption #viral" })
    }));
  });

  it("chuyển cờ bắt buộc tạo mới từ nút tạo lại xuống dịch vụ TTS", async () => {
    const generateComment = vi.fn(async () => ({ id: "project-tts" } as ProjectData));
    const app = createApp({
      dataRoot,
      ttsService: { generateComment } as unknown as TtsService
    });

    await request(app)
      .post("/api/projects/project-tts/comments/comment-tts/tts?forceRegenerate=true")
      .expect(200);

    expect(generateComment).toHaveBeenCalledWith("project-tts", "comment-tts", true);
  });

  it("dừng TTS trước khi xóa toàn bộ giọng đọc của project", async () => {
    const cancelProject = vi.fn(async () => undefined);
    const app = createApp({
      dataRoot,
      ttsService: { cancelProject } as unknown as TtsService
    });
    const created = await request(app).post("/api/projects").send({ name: "Xóa giọng đọc" }).expect(201);

    const response = await request(app).delete(`/api/projects/${created.body.id}/tts`).expect(200);

    expect(cancelProject).toHaveBeenCalledWith(created.body.id);
    expect(response.body).toMatchObject({ id: created.body.id, comments: [] });
  });

  it("xóa project riêng hoặc xóa toàn bộ project sau khi dừng TTS", async () => {
    const cancelProject = vi.fn(async () => undefined);
    const app = createApp({
      dataRoot,
      ttsService: { cancelProject } as unknown as TtsService
    });
    const first = await request(app).post("/api/projects").send({ name: "Project một" }).expect(201);
    const second = await request(app).post("/api/projects").send({ name: "Project hai" }).expect(201);

    await request(app).delete(`/api/projects/${first.body.id}`).expect(204);
    expect((await request(app).get("/api/projects").expect(200)).body.map((item: ProjectData) => item.id)).toEqual([second.body.id]);

    const cleared = await request(app).delete("/api/projects").expect(200);
    expect(cleared.body).toEqual({ deleted: 1 });
    expect((await request(app).get("/api/projects").expect(200)).body).toEqual([]);
    expect(cancelProject).toHaveBeenCalledWith(first.body.id);
    expect(cancelProject).toHaveBeenCalledWith(second.body.id);
  });

  it("phục vụ giao diện production và hỗ trợ đường dẫn SPA", async () => {
    const frontendDist = path.join(dataRoot, "frontend", "dist");
    await mkdir(frontendDist, { recursive: true });
    await writeFile(path.join(frontendDist, "index.html"), "<!doctype html><title>COMMENT VIDEO STUDIO</title>");
    const app = createApp({ dataRoot: path.join(dataRoot, "data"), projectRoot: dataRoot });
    const response = await request(app).get("/project/demo").expect(200);
    expect(response.text).toContain("COMMENT VIDEO STUDIO");
  });

  it("nhận thư mục project từ launcher production", async () => {
    const previousProjectRoot = process.env.CVS_PROJECT_ROOT;
    const frontendDist = path.join(dataRoot, "frontend", "dist");
    await mkdir(frontendDist, { recursive: true });
    await writeFile(path.join(frontendDist, "index.html"), "<!doctype html><title>Launcher production</title>");
    process.env.CVS_PROJECT_ROOT = dataRoot;
    try {
      const response = await request(createApp({ dataRoot: path.join(dataRoot, "data") })).get("/").expect(200);
      expect(response.text).toContain("Launcher production");
    } finally {
      if (previousProjectRoot === undefined) delete process.env.CVS_PROJECT_ROOT;
      else process.env.CVS_PROJECT_ROOT = previousProjectRoot;
    }
  });

  it("bundle server theo CommonJS để tương thích dependency Node dùng require động", async () => {
    const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["bundle:server"]).toContain("--format=cjs");
    expect(packageJson.scripts.start).toContain("server.cjs");
  });

  it("launcher chờ đủ lâu khi filesystem macOS nạp dependency chậm", async () => {
    const launcherPath = fileURLToPath(new URL("../../start.command", import.meta.url));
    const launcher = await readFile(launcherPath, "utf8");
    expect(launcher).toContain("for attempt in {1..1200}");
    expect(launcher).toContain("có thể mất tới vài phút");
  });

  it("tạo, lưu và mở lại project bằng JSON", async () => {
    const app = createApp({ dataRoot });
    const created = await request(app).post("/api/projects").send({ name: "Video tiếng Việt" }).expect(201);
    expect(created.body.name).toBe("Video tiếng Việt");

    created.body.name = "Video đã đổi tên";
    await request(app).put(`/api/projects/${created.body.id}`).send(created.body).expect(200);
    const opened = await request(app).get(`/api/projects/${created.body.id}`).expect(200);
    expect(opened.body.project.name).toBe("Video đã đổi tên");
    expect(opened.body.missingFiles).toEqual([]);

    const stored = JSON.parse(await readFile(path.join(dataRoot, "projects", created.body.id, "project.json"), "utf8"));
    expect(stored.name).toBe("Video đã đổi tên");
  });

  it("gọi bộ tự chọn MyInstants cho một comment", async () => {
    const autoAssign = vi.fn(async () => ({ project: { id: "demo" } as ProjectData, assigned: 1, skipped: [] }));
    const app = createApp({ dataRoot, soundEffectService: { autoAssign } });
    const projectId = "72bd343e-6da7-4f66-9f35-d77aefaa4889";
    const commentId = "0aeff257-9c63-4ff0-90ec-433ac406da3f";
    const response = await request(app)
      .post(`/api/projects/${projectId}/sound-effects/auto`)
      .send({ commentId, force: true })
      .expect(200);
    expect(response.body.assigned).toBe(1);
    expect(autoAssign).toHaveBeenCalledWith(projectId, commentId, true);
  });

  it("tải hai âm xuất hiện comment cố định qua API", async () => {
    const autoAssign = vi.fn(async () => ({ project: { id: "demo" } as ProjectData, assigned: 0, skipped: [] }));
    const ensureCommentAppearanceSounds = vi.fn(async () => ({ id: "project-sfx" } as ProjectData));
    const app = createApp({ dataRoot, soundEffectService: { autoAssign, ensureCommentAppearanceSounds } });
    const projectId = "72bd343e-6da7-4f66-9f35-d77aefaa4889";
    const response = await request(app).post(`/api/projects/${projectId}/sound-effects/appearance`).expect(200);
    expect(response.body.id).toBe("project-sfx");
    expect(ensureCommentAppearanceSounds).toHaveBeenCalledWith(projectId);
  });

  it("phân tích link Threads và nhập danh sách comment đã chọn", async () => {
    const openBrowser = vi.fn(async (url?: string) => ({ open: true, url: url ?? "https://www.threads.com/", message: "Chrome local đã mở" }));
    const analyze = vi.fn(async (url: string) => ({ analysisId: "c2843ea9-7c56-42a7-b365-84a0e05f0a2e", analysis: { sourceUrl: url, comments: [] } }));
    const importSelection = vi.fn(async (projectId: string) => ({ id: projectId, comments: [{ id: "threads-comment" }] } as unknown as ProjectData));
    const app = createApp({ dataRoot, threadsImportService: { openBrowser, analyze, importSelection } as never });
    const created = await request(app).post("/api/projects").send({ name: "Nhập Threads" }).expect(201);
    const url = "https://www.threads.net/@kenh/post/ABC123";
    const opened = await request(app)
      .post(`/api/projects/${created.body.id}/threads/browser/open`)
      .send({ url })
      .expect(200);
    expect(opened.body).toMatchObject({ open: true, url });
    expect(openBrowser).toHaveBeenCalledWith(url);

    const analyzed = await request(app)
      .post(`/api/projects/${created.body.id}/threads/analyze`)
      .send({ url })
      .expect(200);
    expect(analyzed.body.analysisId).toBe("c2843ea9-7c56-42a7-b365-84a0e05f0a2e");
    expect(analyze).toHaveBeenCalledWith(url);

    const imported = await request(app)
      .post(`/api/projects/${created.body.id}/threads/import`)
      .send({ analysisId: analyzed.body.analysisId, selectedIds: ["comment-cha", "reply-1"] })
      .expect(200);
    expect(imported.body.comments[0].id).toBe("threads-comment");
    expect(importSelection).toHaveBeenCalledWith(created.body.id, analyzed.body.analysisId, ["comment-cha", "reply-1"]);
  });

  it("import nhiều ảnh theo đúng thứ tự và giữ tên gốc có dấu", async () => {
    const app = createApp({ dataRoot, mediaInspector: { probeImage: async () => ({ width: 900, height: 500 }) } });
    const created = await request(app).post("/api/projects").send({ name: "Ảnh comment" }).expect(201);
    const response = await request(app)
      .post(`/api/projects/${created.body.id}/comments/images`)
      .attach("images", Buffer.from("png-one"), { filename: "bình luận một.png", contentType: "image/png" })
      .attach("images", Buffer.from("png-two"), { filename: "bình luận hai.png", contentType: "image/png" })
      .expect(200);

    expect(response.body.comments).toHaveLength(2);
    expect(response.body.comments.map((comment: { order: number }) => comment.order)).toEqual([1, 2]);
    expect(response.body.comments[0].image.originalName).toBe("bình luận một.png");
    expect(response.body.comments[0].image).toMatchObject({ width: 900, height: 500 });

    const reply = await request(app)
      .post(`/api/projects/${created.body.id}/comments/${response.body.comments[0].id}/replies/images`)
      .attach("images", Buffer.from("png-reply"), { filename: "phản hồi 1.1.png", contentType: "image/png" })
      .expect(200);
    expect(reply.body.comments.map((comment: { parentCommentId?: string }) => comment.parentCommentId ?? "cha")).toEqual(["cha", response.body.comments[0].id, "cha"]);
    expect(reply.body.comments.map((comment: { order: number }) => comment.order)).toEqual([1, 2, 3]);
    expect(reply.body.settings.smartLayout).toMatchObject({ enabled: true, mode: "auto" });

    const cleared = await request(app).delete(`/api/projects/${created.body.id}/comments`).expect(200);
    expect(cleared.body.comments).toEqual([]);
    expect(cleared.body.settings.smartLayout).toMatchObject({ enabled: true, mode: "auto" });
  });

  it("OCR ảnh hội thoại và lưu text có thể chỉnh sửa theo từng tin", async () => {
    const conversationOcr = {
      recognize: vi.fn(async () => ({
        language: "vi-VT",
        supportedLanguages: ["vi-VT"],
        observations: [
          { text: "c ơi", confidence: 0.98, x: 0.15, y: 0.25, width: 0.2, height: 0.04 },
          { text: "em còn đúng 127k", confidence: 0.96, x: 0.58, y: 0.45, width: 0.3, height: 0.04 }
        ]
      }))
    };
    const app = createApp({ dataRoot, conversationOcr, mediaInspector: { probeImage: async () => ({ width: 720, height: 1280 }) } });
    const created = await request(app).post("/api/projects").send({ name: "Chat OCR" }).expect(201);
    const comment = await request(app)
      .post(`/api/projects/${created.body.id}/comments/images`)
      .attach("images", Buffer.from("comment"), { filename: "comment.png", contentType: "image/png" })
      .expect(200);
    const response = await request(app)
      .post(`/api/projects/${created.body.id}/comments/${comment.body.comments[0].id}/conversation/image`)
      .attach("image", Buffer.from("conversation"), { filename: "hội thoại.png", contentType: "image/png" })
      .expect(200);
    expect(conversationOcr.recognize).toHaveBeenCalledOnce();
    expect(response.body.comments[0].conversation).toMatchObject({ ocrLanguage: "vi-VT", dingEnabled: true });
    expect(response.body.comments[0].conversation.messages.map((item: { text: string; speaker: string }) => [item.text, item.speaker])).toEqual([
      ["c ơi", "a"], ["em còn đúng 127k", "b"]
    ]);
  });

  it("tự phân loại ảnh chữ thường, giữ OCR gốc và chuẩn hóa bản đọc", async () => {
    const conversationOcr = {
      recognize: vi.fn(async () => ({
        language: "vi-VN",
        supportedLanguages: ["vi-VN"],
        observations: [
          { text: "1. nma hs ko bít", confidence: 0.98, x: 0.1, y: 0.22, width: 0.7, height: 0.04 },
          { text: "2. Dòng tiếp theo", confidence: 0.97, x: 0.1, y: 0.3, width: 0.65, height: 0.04 }
        ]
      }))
    };
    const app = createApp({ dataRoot, conversationOcr, mediaInspector: { probeImage: async () => ({ width: 720, height: 1280 }) } });
    const created = await request(app).post("/api/projects").send({ name: "Ảnh chữ" }).expect(201);
    const comment = await request(app)
      .post(`/api/projects/${created.body.id}/comments/images`)
      .attach("images", Buffer.from("comment"), { filename: "comment.png", contentType: "image/png" })
      .expect(200);
    const response = await request(app)
      .post(`/api/projects/${created.body.id}/comments/${comment.body.comments[0].id}/content-image`)
      .attach("image", Buffer.from("content"), { filename: "danh sách.png", contentType: "image/png" })
      .expect(200);
    expect(response.body.comments[0].conversation).toBeUndefined();
    expect(response.body.comments[0].attachment).toMatchObject({ detectedType: "text", holdAfterSeconds: 2, clickEnabled: true });
    expect(response.body.comments[0].attachment.textBlocks[0]).toMatchObject({
      text: "1. nma hs ko bít",
      speechText: "1. nhưng mà học sinh không biết"
    });
  });

  it("quét thư mục video minh họa, bỏ qua file lỗi và quản lý nhạc nền", async () => {
    const mediaInspector = {
      probeVideo: async () => ({ duration: 8, width: 720, height: 1280 }),
      probeAudio: async () => ({ duration: 12 }),
      probeImage: async () => ({ width: 512, height: 256 }),
      createVideoThumbnail: async (_input: string, output: string) => writeFile(output, "thumbnail")
    };
    const app = createApp({ dataRoot, mediaInspector });
    const created = await request(app).post("/api/projects").send({ name: "Media bổ sung" }).expect(201);
    const videos = await request(app)
      .post(`/api/projects/${created.body.id}/illustrations/videos`)
      .attach("videos", Buffer.from("video"), { filename: "thư mục/clip một.mp4", contentType: "video/mp4" })
      .attach("videos", Buffer.from("text"), { filename: "thư mục/ghi chú.txt", contentType: "text/plain" })
      .expect(200);
    expect(videos.body.project.illustrations.videos).toHaveLength(1);
    expect(videos.body.project.illustrations.videos[0]).toMatchObject({ duration: 8, width: 720, height: 1280 });
    expect(videos.body.skipped).toHaveLength(1);

    const maximized = await request(app)
      .post(`/api/projects/${created.body.id}/illustrations/maximize-variety`)
      .expect(200);
    expect(maximized.body.illustrations).toMatchObject({ enabled: true, mode: "multi" });

    const music = await request(app)
      .post(`/api/projects/${created.body.id}/music`)
      .attach("music", Buffer.from("music"), { filename: "nhạc nền.mp3", contentType: "audio/mpeg" })
      .expect(200);
    expect(music.body.music).toMatchObject({ enabled: true, duration: 12, volume: 0.1 });

    const removed = await request(app).delete(`/api/projects/${created.body.id}/music`).expect(200);
    expect(removed.body.music.enabled).toBe(false);
    expect(removed.body.music.asset).toBeUndefined();

    const logo = await request(app)
      .post(`/api/projects/${created.body.id}/branding/logo`)
      .attach("logo", Buffer.from("logo"), { filename: "logo kênh.png", contentType: "image/png" })
      .expect(200);
    expect(logo.body.branding.logo).toMatchObject({ enabled: true, opacity: 0.9 });
    expect(logo.body.branding.logo.asset).toMatchObject({ originalName: "logo kênh.png", width: 512, height: 256 });

    const logoRemoved = await request(app).delete(`/api/projects/${created.body.id}/branding/logo`).expect(200);
    expect(logoRemoved.body.branding.logo.enabled).toBe(false);
    expect(logoRemoved.body.branding.logo.asset).toBeUndefined();
  });

  it("nhập hơn 500 B-roll trong một lần mà không báo Too many files", async () => {
    const mediaInspector = {
      probeVideo: async () => ({ duration: 2, width: 720, height: 1280 }),
      createVideoThumbnail: async (_input: string, output: string) => writeFile(output, "thumbnail")
    };
    const app = createApp({ dataRoot, mediaInspector });
    const created = await request(app).post("/api/projects").send({ name: "Thư viện B-roll lớn" }).expect(201);
    let uploadRequest = request(app).post(`/api/projects/${created.body.id}/illustrations/videos`);
    for (let index = 0; index < 520; index += 1) {
      uploadRequest = uploadRequest.attach("videos", Buffer.from("v"), {
        filename: `b-roll/clip-${String(index + 1).padStart(4, "0")}.mp4`,
        contentType: "video/mp4"
      });
    }
    const response = await uploadRequest.expect(200);
    expect(response.body.skipped).toEqual([]);
    expect(response.body.project.illustrations.videos).toHaveLength(520);
    expect(response.body.project.illustrations.videos.filter((video: { thumbnailPath?: string }) => video.thumbnailPath)).toHaveLength(48);
  }, 30_000);

  it("từ chối file không phải ảnh", async () => {
    const app = createApp({ dataRoot });
    const created = await request(app).post("/api/projects").send({ name: "Sai định dạng" }).expect(201);
    const response = await request(app)
      .post(`/api/projects/${created.body.id}/comments/images`)
      .attach("images", Buffer.from("not-image"), { filename: "ghi chú.txt", contentType: "text/plain" })
      .expect(400);
    expect(response.body.error).toContain("PNG, JPEG hoặc WebP");
  });

  it("phục vụ media range mà không gửi lại header khi trình duyệt tua audio", async () => {
    const mediaPath = path.join(dataRoot, "projects", "demo", "audio", "voice.mp3");
    await mkdir(path.dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, Buffer.from("0123456789"));
    const response = await request(createApp({ dataRoot }))
      .get("/media/projects/demo/audio/voice.mp3")
      .set("Range", "bytes=2-5")
      .expect(206);
    expect(response.headers["content-range"]).toBe("bytes 2-5/10");
    expect(response.body).toEqual(Buffer.from("2345"));
  });

  it("chặn truy cập /media vào cookie, log, project.json và các thư mục ngoài projects/assets, projects/audio, outputs", async () => {
    await mkdir(path.join(dataRoot, "cache", "threads-browser", "Default"), { recursive: true });
    await writeFile(path.join(dataRoot, "cache", "threads-browser", "Default", "Cookies"), "secret-cookie");
    await writeFile(path.join(dataRoot, "app.log"), "secret-log");
    await mkdir(path.join(dataRoot, "projects", "demo"), { recursive: true });
    await writeFile(path.join(dataRoot, "projects", "demo", "project.json"), '{"id":"demo"}');
    await mkdir(path.join(dataRoot, "outputs", "demo"), { recursive: true });
    await writeFile(path.join(dataRoot, "outputs", "demo", "final.mp4"), "video-bytes");

    const app = createApp({ dataRoot });
    await request(app).get("/media/cache/threads-browser/Default/Cookies").expect(403);
    await request(app).get("/media/app.log").expect(403);
    await request(app).get("/media/projects/demo/project.json").expect(403);
    await request(app).get("/media/projects/demo/.DS_Store").expect(403);
    const allowedOutput = await request(app).get("/media/outputs/demo/final.mp4").expect(200);
    expect(allowedOutput.body).toEqual(Buffer.from("video-bytes"));
  });

  it("chặn Host/Origin bên ngoài (DNS rebinding & CSRF) và gắn header bảo mật cơ bản", async () => {
    const app = createApp({ dataRoot });
    const ok = await request(app).get("/api/health").expect(200);
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(ok.headers["x-frame-options"]).toBe("DENY");

    await request(app).get("/api/health").set("Host", "evil.example:43123").expect(403);
    await request(app).post("/api/projects").set("Origin", "https://evil.example").send({ name: "CSRF" }).expect(403);
    await request(app).delete("/api/projects").set("Sec-Fetch-Site", "cross-site").expect(403);
    await request(app).post("/api/projects").set("Origin", "http://127.0.0.1:43124").send({ name: "Local Dev" }).expect(201);
  });

  it("từ chối dữ liệu độc hại trong PUT /api/projects/:projectId", async () => {
    const app = createApp({ dataRoot });
    const created = await request(app).post("/api/projects").send({ name: "Kiểm tra schema" }).expect(201);

    const badOutputDir = structuredClone(created.body);
    badOutputDir.settings.export.outputDirectory = "../../outside";
    await request(app).put(`/api/projects/${created.body.id}`).send(badOutputDir).expect(400);

    const badEncoder = structuredClone(created.body);
    badEncoder.settings.export.encoder = "copy";
    await request(app).put(`/api/projects/${created.body.id}`).send(badEncoder).expect(400);

    const badSourceUrl = structuredClone(created.body);
    badSourceUrl.soundEffects.assets = [{
      id: "sfx-1",
      provider: "myinstants",
      title: "Bad",
      sourcePageUrl: "javascript:alert(1)",
      relativePath: "assets/sound-effects/a.mp3",
      originalName: "a.mp3",
      mimeType: "audio/mpeg",
      size: 10,
      duration: 1
    }];
    await request(app).put(`/api/projects/${created.body.id}`).send(badSourceUrl).expect(400);
  });
});
