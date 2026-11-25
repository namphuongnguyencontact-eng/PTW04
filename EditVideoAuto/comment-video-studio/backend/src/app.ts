import { access, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { ProjectData } from "@comment-video-studio/shared";
import type { TtsProviderId } from "@comment-video-studio/shared";
import { ProjectStore } from "./storage.js";
import { ElevenLabsTtsProvider, TtsService } from "./tts.js";
import { RenderEngine, RenderQueue } from "./render.js";
import { runCommand } from "./command.js";
import type { MediaInspector } from "./media.js";
import { SoundEffectService } from "./sound-effects.js";
import { AppleVisionOcr, classifyImageContent, groupChatObservations, type ConversationOcr } from "./conversation.js";
import { ThreadsBrowserSource, ThreadsImportService, type ThreadsSource } from "./threads.js";
import { TikTokPublishQueue } from "./tiktok.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_MEDIA_PATH = /^(?:projects\/[a-zA-Z0-9-]+\/(?:assets|audio)\/.+|outputs\/.+)$/;

function isLoopbackHostHeader(hostHeader?: string) {
  if (!hostHeader) return true;
  const trimmed = hostHeader.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]");
    if (closing < 0) return false;
    return LOOPBACK_HOSTS.has(trimmed.slice(0, closing + 1));
  }
  const hostname = trimmed.split(":")[0] ?? "";
  return LOOPBACK_HOSTS.has(hostname);
}

function isLoopbackOriginUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const safeRelativePathSchema = z.string().min(1).max(500).refine((value) => {
  if (value.includes("\0") || value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:/.test(value)) return false;
  const segments = value.split(/[\\/]+/);
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}, "Đường dẫn tài nguyên không hợp lệ.");

const safeHttpsUrlSchema = z.string().url().max(2_000).refine((value) => /^https:\/\//i.test(value), "URL phải dùng HTTPS.");

const mediaAssetSchema = z.object({
  relativePath: safeRelativePathSchema,
  originalName: z.string().max(500),
  mimeType: z.string().max(120),
  size: z.number().finite().nonnegative(),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional()
}).passthrough();

const projectUpdateSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  createdAt: z.string().max(64).optional(),
  updatedAt: z.string().max(64).optional(),
  background: mediaAssetSchema.optional(),
  comments: z.array(z.object({
    id: z.string().min(1).max(128),
    order: z.number().finite(),
    parentCommentId: z.string().min(1).max(128).optional(),
    image: mediaAssetSchema,
    text: z.string().max(50_000),
    speechText: z.string().max(50_000).optional(),
    provider: z.enum(["edge", "elevenlabs", "macos", "voicestudio", "test"]).optional(),
    voiceId: z.string().max(200).optional(),
    rate: z.number().finite().min(0.25).max(4),
    pitch: z.number().finite().min(-200).max(200),
    audioPath: safeRelativePathSchema.optional(),
    audioCacheKey: z.string().max(128).optional(),
    audioProcessingVersion: z.number().finite().optional(),
    audioDuration: z.number().finite().nonnegative().optional(),
    pauseAfter: z.number().finite().min(0).max(30),
    audioStatus: z.enum(["missing", "stale", "generating", "ready", "error"]),
    error: z.string().max(2_000).optional(),
    attachment: z.object({
      asset: mediaAssetSchema,
      textBlocks: z.array(z.object({
        audioPath: safeRelativePathSchema.optional()
      }).passthrough()).optional()
    }).passthrough().optional(),
    conversation: z.object({
      image: mediaAssetSchema,
      messages: z.array(z.object({
        audioPath: safeRelativePathSchema.optional()
      }).passthrough())
    }).passthrough().optional()
  }).passthrough()).max(1_000),
  settings: z.object({
    defaultProvider: z.enum(["edge", "elevenlabs", "macos", "voicestudio", "test"]).optional(),
    defaultVoiceId: z.string().max(200).optional(),
    defaultRate: z.number().finite().min(0.25).max(4).optional(),
    defaultPitch: z.number().finite().min(-200).max(200).optional(),
    defaultPauseAfter: z.number().finite().min(0).max(30).optional(),
    export: z.object({
      resolution: z.enum(["1080x1920", "720x1280"]).optional(),
      fps: z.literal(30).optional(),
      encoder: z.enum(["libx264", "h264_videotoolbox"]).optional(),
      outputDirectory: safeRelativePathSchema.optional()
    }).passthrough().optional(),
    tiktok: z.object({
      enabled: z.boolean().optional(),
      chromeProfileDirectory: z.string().max(120).refine((value) => !/[\\/\0]|\.\./.test(value), "Thư mục hồ sơ Chrome không hợp lệ.").optional(),
      chromeProfileName: z.string().max(200).optional(),
      caption: z.string().max(4_000).optional(),
      mode: z.enum(["now", "schedule"]).optional(),
      scheduledAt: z.string().max(64).optional()
    }).passthrough().optional()
  }).passthrough(),
  illustrations: z.object({
    videos: z.array(mediaAssetSchema.extend({
      thumbnailPath: safeRelativePathSchema.optional()
    })).optional()
  }).passthrough().optional(),
  music: z.object({
    asset: mediaAssetSchema.optional()
  }).passthrough().optional(),
  soundEffects: z.object({
    assets: z.array(mediaAssetSchema.extend({
      sourcePageUrl: safeHttpsUrlSchema
    })).optional()
  }).passthrough().optional(),
  branding: z.object({
    watermark: z.object({
      text: z.string().max(200).optional(),
      opacity: z.number().finite().min(0).max(1).optional(),
      fontSize: z.number().finite().min(8).max(240).optional(),
      xPercent: z.number().finite().min(0).max(100).optional(),
      yPercent: z.number().finite().min(0).max(100).optional()
    }).passthrough().optional(),
    logo: z.object({
      asset: mediaAssetSchema.optional(),
      opacity: z.number().finite().min(0).max(1).optional(),
      widthPercent: z.number().finite().min(1).max(100).optional(),
      xPercent: z.number().finite().min(0).max(100).optional(),
      yPercent: z.number().finite().min(0).max(100).optional()
    }).passthrough().optional()
  }).passthrough().optional()
}).passthrough();

type SoundEffectApi = Pick<SoundEffectService, "autoAssign"> & Partial<Pick<SoundEffectService, "ensureConversationDing" | "ensureCommentAppearanceSounds">>;
type ThreadsImportApi = Pick<ThreadsImportService, "openBrowser" | "analyze" | "importSelection"> & Partial<Pick<ThreadsImportService, "closeBrowser">>;
type TikTokPublishingApi = Pick<TikTokPublishQueue, "listProfiles" | "preflight" | "openAccessibilitySettings" | "list" | "enqueue" | "cancel" | "cancelProject" | "retry">;

export interface AppOptions {
  dataRoot?: string;
  projectRoot?: string;
  ttsService?: TtsService;
  renderQueue?: RenderQueue;
  serveFrontend?: boolean;
  mediaInspector?: Partial<MediaInspector>;
  soundEffectService?: SoundEffectApi;
  conversationOcr?: ConversationOcr;
  threadsSource?: ThreadsSource;
  threadsImportService?: ThreadsImportApi;
  tiktokPublishing?: TikTokPublishingApi;
}

const projectNameSchema = z.object({ name: z.string().trim().min(1).max(120) });

function projectIdFrom(request: Request) {
  const projectId = request.params.projectId;
  if (typeof projectId !== "string") throw new Error("ID project không hợp lệ.");
  return projectId;
}

export function createApp(options: AppOptions = {}) {
  const workingDirectory = process.cwd();
  const inferredProjectRoot = path.basename(workingDirectory) === "backend"
    ? path.dirname(workingDirectory)
    : workingDirectory;
  const projectRoot = path.resolve(
    options.projectRoot ?? process.env.CVS_PROJECT_ROOT ?? inferredProjectRoot
  );
  const dataRoot = path.resolve(options.dataRoot ?? process.env.CVS_DATA_ROOT ?? path.join(projectRoot, "data"));
  const store = new ProjectStore(dataRoot, options.mediaInspector);
  const tts = options.ttsService ?? new TtsService(store, projectRoot);
  const soundEffects = options.soundEffectService ?? new SoundEffectService(store);
  const conversationOcr = options.conversationOcr ?? new AppleVisionOcr(projectRoot, store.nativeCacheRoot);
  const threadsImporter = options.threadsImportService ?? new ThreadsImportService(
    store,
    options.threadsSource ?? new ThreadsBrowserSource(path.join(dataRoot, "cache", "threads-browser")),
    conversationOcr,
    {
      ensureConversationDing: (projectId, commentId) => {
        if (!soundEffects.ensureConversationDing) throw new Error("Bộ tải âm ding chưa sẵn sàng.");
        return soundEffects.ensureConversationDing(projectId, commentId);
      },
      ensureCommentAppearanceSounds: (projectId) => {
        if (!soundEffects.ensureCommentAppearanceSounds) throw new Error("Bộ tải âm xuất hiện comment chưa sẵn sàng.");
        return soundEffects.ensureCommentAppearanceSounds(projectId);
      }
    }
  );
  const renderQueue = options.renderQueue ?? new RenderQueue(new RenderEngine(store));
  const tiktokPublishing = options.tiktokPublishing ?? new TikTokPublishQueue();
  const pendingTikTokRenders = new Map<string, ProjectData["settings"]["tiktok"]>();
  renderQueue.onSettled(async (job) => {
    const settings = pendingTikTokRenders.get(job.id);
    if (!settings) return;
    if (job.status !== "completed" || !job.outputPath) return;
    pendingTikTokRenders.delete(job.id);
    const absoluteOutput = path.resolve(dataRoot, job.outputPath);
    if (!absoluteOutput.startsWith(`${dataRoot}${path.sep}`)) return;
    await threadsImporter.closeBrowser?.().catch(() => undefined);
    tiktokPublishing.enqueue({
      projectId: job.projectId,
      renderJobId: job.id,
      videoPath: absoluteOutput,
      settings
    });
  });
  void store.initialize();
  const app = express();
  const upload = multer({
    dest: store.tempRoot,
    preservePath: true,
    // Giới hạn số lượng được đặt riêng cho ảnh comment ở từng route. Thư viện
    // B-roll có thể chứa rất nhiều clip nên không áp một trần file toàn cục.
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }
  });
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "same-origin");

    if (!isLoopbackHostHeader(request.headers.host)) {
      response.status(403).json({ error: "Yêu cầu chỉ được phép truy cập từ máy local." });
      return;
    }

    const origin = request.headers.origin;
    if (origin !== undefined && !isLoopbackOriginUrl(origin)) {
      response.status(403).json({ error: "Nguồn truy cập không được phép." });
      return;
    }

    if (STATE_CHANGING_METHODS.has(request.method)) {
      const fetchSite = request.headers["sec-fetch-site"];
      if (typeof fetchSite === "string" && !new Set(["same-origin", "same-site", "none"]).has(fetchSite)) {
        response.status(403).json({ error: "Yêu cầu thay đổi dữ liệu từ trang bên ngoài bị chặn." });
        return;
      }
      const referer = request.headers.referer;
      if (origin === undefined && typeof referer === "string" && !isLoopbackOriginUrl(referer)) {
        response.status(403).json({ error: "Nguồn truy cập không được phép." });
        return;
      }
    }

    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, app: "COMMENT VIDEO STUDIO" });
  });

  app.get("/api/projects", async (_request, response, next) => {
    try {
      response.json(await store.list());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects", async (request, response, next) => {
    try {
      const { name } = projectNameSchema.parse(request.body);
      response.status(201).json(await store.create(name));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId", async (request, response, next) => {
    try {
      const projectId = projectIdFrom(request);
      await tts.cancelProject(projectId);
      renderQueue.cancelProject(projectId);
      tiktokPublishing.cancelProject(projectId);
      await store.deleteProject(projectId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects", async (_request, response, next) => {
    try {
      const projects = await store.list();
      await Promise.all(projects.map((project) => tts.cancelProject(project.id)));
      projects.forEach((project) => renderQueue.cancelProject(project.id));
      projects.forEach((project) => tiktokPublishing.cancelProject(project.id));
      await Promise.all(projects.map((project) => store.deleteProject(project.id)));
      response.json({ deleted: projects.length });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId", async (request, response, next) => {
    try {
      const envelope = await store.getEnvelope(projectIdFrom(request));
      if (tts.invalidateOutdatedAudio(envelope.project)) {
        envelope.project = await store.save(envelope.project);
      }
      response.json(envelope);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/projects/:projectId", async (request, response, next) => {
    try {
      let project = projectUpdateSchema.parse(request.body) as unknown as ProjectData;
      if (project.id !== projectIdFrom(request)) throw new Error("ID project không khớp.");
      project = tts.invalidateChangedAudio(await store.get(project.id), project);
      response.json(await store.save(project));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tts/providers", async (_request, response, next) => {
    try {
      response.json(await tts.providerInfo());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tts/voices", async (request, response, next) => {
    try {
      const provider = String(request.query.provider ?? "edge") as TtsProviderId;
      const language = typeof request.query.language === "string" ? request.query.language : undefined;
      response.json(await tts.listVoices(provider, language));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/comments/:commentId/tts", async (request, response, next) => {
    try {
      const commentId = request.params.commentId;
      if (typeof commentId !== "string") throw new Error("ID comment không hợp lệ.");
      response.json(await tts.generateComment(
        projectIdFrom(request),
        commentId,
        request.query.forceRegenerate === "true"
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/comments/:commentId/conversation/messages/:messageId/tts", async (request, response, next) => {
    try {
      response.json(await tts.generateConversation(
        projectIdFrom(request),
        String(request.params.commentId),
        String(request.params.messageId),
        request.query.forceRegenerate === "true"
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/tts/all", async (request, response, next) => {
    try {
      response.json(await tts.generateAll(projectIdFrom(request)));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId/tts", async (request, response, next) => {
    try {
      const projectId = projectIdFrom(request);
      await tts.cancelProject(projectId);
      response.json(await store.clearProjectAudio(projectId));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId/comments", async (request, response, next) => {
    try {
      response.json(await store.clearComments(projectIdFrom(request)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/sound-effects/auto", async (request, response, next) => {
    try {
      const { commentId, force } = z.object({
        commentId: z.string().uuid().optional(),
        force: z.boolean().optional()
      }).parse(request.body ?? {});
      response.json(await soundEffects.autoAssign(projectIdFrom(request), commentId, force ?? false));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/sound-effects/appearance", async (request, response, next) => {
    try {
      if (!soundEffects.ensureCommentAppearanceSounds) throw new Error("Bộ tải âm xuất hiện comment chưa sẵn sàng.");
      response.json(await soundEffects.ensureCommentAppearanceSounds(projectIdFrom(request)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/threads/analyze", async (request, response, next) => {
    try {
      const { url } = z.object({ url: z.string().trim().url().max(2_000) }).parse(request.body);
      await store.get(projectIdFrom(request));
      response.json(await threadsImporter.analyze(url));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/threads/browser/open", async (request, response, next) => {
    try {
      const { url } = z.object({ url: z.string().trim().url().max(2_000).optional() }).parse(request.body ?? {});
      await store.get(projectIdFrom(request));
      response.json(await threadsImporter.openBrowser(url));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/threads/import", async (request, response, next) => {
    try {
      const { analysisId, selectedIds } = z.object({
        analysisId: z.string().uuid(),
        selectedIds: z.array(z.string().min(1)).min(1).max(100)
      }).parse(request.body);
      response.json(await threadsImporter.importSelection(projectIdFrom(request), analysisId, selectedIds));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings/elevenlabs-key", async (request, response, next) => {
    try {
      const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(request.body);
      await new ElevenLabsTtsProvider().saveApiKey(apiKey);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/settings/elevenlabs-key", async (_request, response, next) => {
    try {
      await new ElevenLabsTtsProvider().deleteApiKey();
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/render-jobs", (_request, response) => {
    response.json(renderQueue.list());
  });

  app.post("/api/render-jobs", async (request, response, next) => {
    try {
      const { projectId, publishToTikTok, publishConfirmed } = z.object({
        projectId: z.string().uuid(),
        publishToTikTok: z.boolean().optional().default(false),
        publishConfirmed: z.boolean().optional().default(false)
      }).parse(request.body);
      const project = await store.get(projectId);
      if (publishToTikTok) {
        if (!publishConfirmed) throw new Error("Bạn cần xác nhận hồ sơ TikTok và thời điểm đăng trước khi xuất.");
        const settings = project.settings.tiktok;
        if (!settings.enabled) throw new Error("Project chưa bật tự đăng TikTok sau khi xuất.");
        if (!settings.chromeProfileDirectory) throw new Error("Project chưa chọn hồ sơ Chrome cho TikTok.");
        if (settings.caption.length > 4_000) throw new Error("Caption TikTok không được vượt quá 4.000 ký tự.");
        if (settings.mode === "schedule") {
          if (!settings.scheduledAt || Number.isNaN(Date.parse(settings.scheduledAt))) throw new Error("Ngày giờ lên lịch TikTok không hợp lệ.");
          if (Date.parse(settings.scheduledAt) <= Date.now()) throw new Error("Giờ lên lịch TikTok phải ở tương lai.");
        }
        const profiles = await tiktokPublishing.listProfiles();
        if (!profiles.some((profile) => profile.directory === settings.chromeProfileDirectory)) {
          throw new Error("Hồ sơ Chrome của project không còn tồn tại. Hãy chọn lại hồ sơ.");
        }
      }
      const job = renderQueue.enqueue(projectId);
      if (publishToTikTok) pendingTikTokRenders.set(job.id, structuredClone(project.settings.tiktok));
      response.status(202).json(job);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tiktok/chrome-profiles", async (_request, response, next) => {
    try {
      response.json(await tiktokPublishing.listProfiles());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tiktok/preflight", async (request, response, next) => {
    try {
      const { profileDirectory } = z.object({ profileDirectory: z.string().trim().min(1).max(120) }).parse(request.body);
      // Chrome local của Playwright dùng cùng bundle ID với Chrome thật. Nếu để
      // mở, AppleScript có thể điều khiển nhầm phiên Threads và báo sai quyền.
      await threadsImporter.closeBrowser?.();
      response.json(await tiktokPublishing.preflight(profileDirectory));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tiktok/accessibility-settings", async (_request, response, next) => {
    try {
      await tiktokPublishing.openAccessibilitySettings();
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tiktok/publish-jobs", (_request, response) => {
    response.json(tiktokPublishing.list());
  });

  app.post("/api/tiktok/publish-jobs/:jobId/cancel", (request, response, next) => {
    try {
      response.json(tiktokPublishing.cancel(String(request.params.jobId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tiktok/publish-jobs/:jobId/retry", (request, response, next) => {
    try {
      response.status(202).json(tiktokPublishing.retry(String(request.params.jobId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/render-jobs/:jobId/cancel", (request, response, next) => {
    try {
      response.json(renderQueue.cancel(String(request.params.jobId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/render-jobs/:jobId/retry", (request, response, next) => {
    try {
      const previousJobId = String(request.params.jobId);
      const retry = renderQueue.retry(previousJobId);
      const tiktokSettings = pendingTikTokRenders.get(previousJobId);
      if (tiktokSettings) {
        pendingTikTokRenders.delete(previousJobId);
        pendingTikTokRenders.set(retry.id, tiktokSettings);
      }
      response.status(202).json(retry);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/render-jobs/:jobId/open-folder", async (request, response, next) => {
    try {
      const job = renderQueue.list().find((candidate) => candidate.id === String(request.params.jobId));
      if (!job?.outputPath || job.status !== "completed") throw new Error("Tác vụ chưa có file đầu ra.");
      const absoluteOutput = path.resolve(dataRoot, job.outputPath);
      if (!absoluteOutput.startsWith(`${dataRoot}${path.sep}`)) throw new Error("Đường dẫn output không hợp lệ.");
      await runCommand("open", ["-R", absoluteOutput], { timeoutMs: 10_000 });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/background", upload.single("background"), async (request, response, next) => {
    try {
      if (!request.file) throw new Error("Bạn chưa chọn video nền.");
      response.json(await store.importBackground(projectIdFrom(request), request.file));
    } catch (error) {
      next(error);
    } finally {
      if (request.file) await unlink(request.file.path).catch(() => undefined);
    }
  });

  app.post("/api/projects/:projectId/comments/images", upload.array("images", 100), async (request, response, next) => {
    const files = (request.files as Express.Multer.File[] | undefined) ?? [];
    try {
      response.json(await store.importCommentImages(projectIdFrom(request), files));
    } catch (error) {
      next(error);
    } finally {
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
    }
  });

  app.post("/api/projects/:projectId/comments/:commentId/replies/images", upload.array("images", 50), async (request, response, next) => {
    const files = (request.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const commentId = request.params.commentId;
      if (typeof commentId !== "string") throw new Error("ID comment cha không hợp lệ.");
      response.json(await store.importCommentImages(projectIdFrom(request), files, commentId));
    } catch (error) {
      next(error);
    } finally {
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
    }
  });

  app.post("/api/projects/:projectId/comments/:commentId/conversation/image", upload.single("image"), async (request, response, next) => {
    try {
      if (!request.file) throw new Error("Bạn chưa chọn ảnh hội thoại.");
      const commentId = String(request.params.commentId);
      const result = await conversationOcr.recognize(request.file.path);
      const messages = groupChatObservations(result.observations);
      if (!messages.length) throw new Error("Không nhận dạng được tin nhắn. Hãy chọn ảnh rõ hơn hoặc thêm nội dung thủ công.");
      response.json(await store.importConversationImage(projectIdFrom(request), commentId, request.file, messages, result.language));
    } catch (error) {
      next(error);
    } finally {
      if (request.file) await unlink(request.file.path).catch(() => undefined);
    }
  });

  app.post("/api/projects/:projectId/comments/:commentId/content-image", upload.single("image"), async (request, response, next) => {
    try {
      if (!request.file) throw new Error("Bạn chưa chọn ảnh nội dung.");
      const projectId = projectIdFrom(request);
      const commentId = String(request.params.commentId);
      const result = await conversationOcr.recognize(request.file.path);
      const classification = classifyImageContent(result.observations);
      if (classification.type === "conversation") {
        let project = await store.importConversationImage(projectId, commentId, request.file, classification.messages, result.language, "after-comment");
        if (soundEffects.ensureConversationDing) project = await soundEffects.ensureConversationDing(projectId, commentId);
        response.json(project);
      } else {
        const project = await store.importCommentAttachment(projectId, commentId, request.file, {
          mode: "auto",
          detectedType: classification.type === "text" ? "text" : "illustration",
          classificationConfidence: classification.confidence,
          textBlocks: classification.textBlocks
        });
        response.json(project);
      }
    } catch (error) {
      next(error);
    } finally {
      if (request.file) await unlink(request.file.path).catch(() => undefined);
    }
  });

  app.delete("/api/projects/:projectId/comments/:commentId/conversation/image", async (request, response, next) => {
    try {
      response.json(await store.removeConversationImage(projectIdFrom(request), String(request.params.commentId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/comments/:commentId/conversation/ding", async (request, response, next) => {
    try {
      if (!soundEffects.ensureConversationDing) throw new Error("Bộ tải âm báo chưa sẵn sàng.");
      response.json(await soundEffects.ensureConversationDing(projectIdFrom(request), String(request.params.commentId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/illustrations/videos", upload.array("videos"), async (request, response, next) => {
    const files = (request.files as Express.Multer.File[] | undefined) ?? [];
    try {
      response.json(await store.importIllustrationVideos(projectIdFrom(request), files));
    } catch (error) {
      next(error);
    } finally {
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
    }
  });

  app.post("/api/projects/:projectId/illustrations/randomize", async (request, response, next) => {
    try {
      const parsed = z.object({ commentId: z.string().optional() }).parse(request.body ?? {});
      response.json(await store.randomizeIllustrations(projectIdFrom(request), parsed.commentId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/illustrations/maximize-variety", async (request, response, next) => {
    try {
      response.json(await store.maximizeIllustrationVariety(projectIdFrom(request)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/music", upload.single("music"), async (request, response, next) => {
    try {
      if (!request.file) throw new Error("Bạn chưa chọn file nhạc nền.");
      response.json(await store.importMusic(projectIdFrom(request), request.file));
    } catch (error) {
      next(error);
    } finally {
      if (request.file) await unlink(request.file.path).catch(() => undefined);
    }
  });

  app.delete("/api/projects/:projectId/music", async (request, response, next) => {
    try {
      response.json(await store.removeMusic(projectIdFrom(request)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/branding/logo", upload.single("logo"), async (request, response, next) => {
    try {
      if (!request.file) throw new Error("Bạn chưa chọn ảnh logo kênh.");
      response.json(await store.importChannelLogo(projectIdFrom(request), request.file));
    } catch (error) {
      next(error);
    } finally {
      if (request.file) await unlink(request.file.path).catch(() => undefined);
    }
  });

  app.delete("/api/projects/:projectId/branding/logo", async (request, response, next) => {
    try {
      response.json(await store.removeChannelLogo(projectIdFrom(request)));
    } catch (error) {
      next(error);
    }
  });

  app.use("/media", async (request, response, next) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.status(405).json({ error: "Phương thức không được phép." });
        return;
      }
      const relativePath = decodeURIComponent(request.path).replace(/^\/+/, "");
      const segments = relativePath.split("/");
      if (
        !relativePath
        || relativePath.includes("\0")
        || relativePath.includes("\\")
        || segments.some((segment) => !segment || segment.startsWith("."))
        || !ALLOWED_MEDIA_PATH.test(relativePath)
      ) {
        response.status(403).json({ error: "Đường dẫn media không được phép truy cập." });
        return;
      }
      const resolved = path.resolve(dataRoot, relativePath);
      if (!resolved.startsWith(`${dataRoot}${path.sep}`)) {
        response.status(403).json({ error: "Đường dẫn media không hợp lệ." });
        return;
      }
      const [realDataRoot, realTarget] = await Promise.all([realpath(dataRoot), realpath(resolved)]);
      const realRelative = path.relative(realDataRoot, realTarget).split(path.sep).join("/");
      if (
        !realTarget.startsWith(`${realDataRoot}${path.sep}`)
        || !ALLOWED_MEDIA_PATH.test(realRelative)
      ) {
        response.status(403).json({ error: "Đường dẫn media không được phép truy cập." });
        return;
      }
      response.sendFile(realTarget, { dotfiles: "deny" }, (error) => (error ? next(error) : undefined));
    } catch (error) {
      next(error);
    }
  });

  if (options.serveFrontend !== false) {
    const frontendDist = path.join(projectRoot, "frontend", "dist");
    app.use(express.static(frontendDist, { index: false }));
    app.get(/^(?!\/api(?:\/|$)|\/media(?:\/|$)).*/, async (_request, response, next) => {
      try {
        const indexFile = path.join(frontendDist, "index.html");
        await access(indexFile);
        response.sendFile(indexFile, (sendError) => (sendError ? next(sendError) : undefined));
      } catch (frontendError) {
        next(frontendError);
      }
    });
  }

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const status = error instanceof z.ZodError ? 400 : (error as NodeJS.ErrnoException)?.code === "ENOENT" ? 404 : 400;
    const message = error instanceof z.ZodError
      ? "Dữ liệu gửi lên không hợp lệ."
      : error instanceof Error
        ? error.message
        : "Đã xảy ra lỗi không xác định.";
    response.status(status).json({ error: message });
  });

  return app;
}
