import { createHash, randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDefaultIllustrationSettings,
  createDefaultBrandingSettings,
  createDefaultMusicSettings,
  createDefaultSoundEffectSettings,
  defaultProjectSettings,
  maximizeBrollVariety,
  migrateProjectData,
  syncBrollSegments,
  type AttachmentDetectedType,
  type AttachmentMode,
  type AttachmentTextBlock,
  type CommentItem,
  type ConversationMessage,
  type IllustrationVideoAsset,
  type MediaAsset,
  type ProjectData,
  type ProjectEnvelope,
  type ProjectSummary,
  type SoundEffectAsset
} from "@comment-video-studio/shared";
import { defaultMediaInspector, type MediaInspector } from "./media.js";

export interface UploadedFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface IllustrationImportResult {
  project: ProjectData;
  skipped: Array<{ name: string; error: string }>;
}

const projectIdPattern = /^[a-zA-Z0-9-]+$/;
export const MAX_ILLUSTRATION_THUMBNAILS = 48;

function cloneDefaults() {
  return structuredClone(defaultProjectSettings);
}

function safeExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

function decodeUploadName(fileName: string) {
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  return (decoded.includes("�") ? fileName : decoded).normalize("NFC");
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class ProjectStore {
  readonly projectsRoot: string;
  readonly tempRoot: string;
  readonly audioCacheRoot: string;
  readonly soundEffectCacheRoot: string;
  readonly nativeCacheRoot: string;
  readonly outputsRoot: string;
  readonly rendersTempRoot: string;

  private readonly mediaInspector: MediaInspector;

  constructor(readonly dataRoot: string, mediaInspector: Partial<MediaInspector> = defaultMediaInspector) {
    this.mediaInspector = { ...defaultMediaInspector, ...mediaInspector };
    this.projectsRoot = path.join(dataRoot, "projects");
    this.tempRoot = path.join(dataRoot, "tmp", "uploads");
    this.audioCacheRoot = path.join(dataRoot, "cache", "audio");
    this.soundEffectCacheRoot = path.join(dataRoot, "cache", "sound-effects");
    this.nativeCacheRoot = path.join(dataRoot, "cache", "native");
    this.outputsRoot = path.join(dataRoot, "outputs");
    this.rendersTempRoot = path.join(dataRoot, "tmp", "renders");
  }

  async initialize() {
    await Promise.all([
      mkdir(this.projectsRoot, { recursive: true }),
      mkdir(this.tempRoot, { recursive: true }),
      mkdir(this.audioCacheRoot, { recursive: true }),
      mkdir(this.soundEffectCacheRoot, { recursive: true }),
      mkdir(this.nativeCacheRoot, { recursive: true }),
      mkdir(this.outputsRoot, { recursive: true }),
      mkdir(this.rendersTempRoot, { recursive: true })
    ]);
  }

  async attachAudio(projectId: string, cacheFile: string, cacheKey: string) {
    const relativePath = path.posix.join("audio", `${cacheKey}.mp3`);
    const destination = this.resolveProjectAsset(projectId, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    if (!(await exists(destination))) await copyFile(cacheFile, destination);
    return relativePath;
  }

  projectDirectory(projectId: string) {
    this.assertProjectId(projectId);
    return path.join(this.projectsRoot, projectId);
  }

  projectFile(projectId: string) {
    return path.join(this.projectDirectory(projectId), "project.json");
  }

  resolveProjectAsset(projectId: string, relativePath: string) {
    const projectDirectory = this.projectDirectory(projectId);
    const resolved = path.resolve(projectDirectory, relativePath);
    if (resolved !== projectDirectory && !resolved.startsWith(`${projectDirectory}${path.sep}`)) {
      throw new Error("Đường dẫn media không hợp lệ.");
    }
    return resolved;
  }

  async create(name: string): Promise<ProjectData> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Tên project không được để trống.");
    const id = randomUUID();
    const now = new Date().toISOString();
    const project: ProjectData = {
      id,
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      comments: [],
      settings: cloneDefaults(),
      illustrations: createDefaultIllustrationSettings(),
      music: createDefaultMusicSettings(),
      soundEffects: createDefaultSoundEffectSettings(),
      branding: createDefaultBrandingSettings()
    };
    await mkdir(path.join(this.projectDirectory(id), "assets", "comments"), { recursive: true });
    await this.save(project);
    return project;
  }

  async list(): Promise<ProjectSummary[]> {
    await this.initialize();
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(this.projectsRoot, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && projectIdPattern.test(entry.name))
        .map(async (entry) => {
          try {
            const project = await this.get(entry.name);
            return {
              id: project.id,
              name: project.name,
              updatedAt: project.updatedAt,
              commentCount: project.comments.length,
              hasBackground: Boolean(project.background)
            } satisfies ProjectSummary;
          } catch {
            return undefined;
          }
        })
    );
    return projects
      .filter((project): project is ProjectSummary => Boolean(project))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async deleteProject(projectId: string): Promise<void> {
    const projectDirectory = this.projectDirectory(projectId);
    await access(this.projectFile(projectId));
    await Promise.all([
      rm(projectDirectory, { recursive: true, force: true }),
      rm(path.join(this.outputsRoot, projectId), { recursive: true, force: true })
    ]);
  }

  async clearProjects(): Promise<number> {
    const projects = await this.list();
    await Promise.all(projects.map((project) => this.deleteProject(project.id)));
    return projects.length;
  }

  async get(projectId: string): Promise<ProjectData> {
    const content = await readFile(this.projectFile(projectId), "utf8");
    const project = migrateProjectData(JSON.parse(content) as ProjectData);
    for (const comment of project.comments) {
      if (comment.image.width && comment.image.height) continue;
      const imagePath = this.resolveProjectAsset(projectId, comment.image.relativePath);
      if (await exists(imagePath)) {
        const dimensions = await this.mediaInspector.probeImage(imagePath).catch(() => undefined);
        if (dimensions) Object.assign(comment.image, dimensions);
      }
    }
    return syncBrollSegments(project);
  }

  async getEnvelope(projectId: string): Promise<ProjectEnvelope> {
    const project = await this.get(projectId);
    const paths = [
      project.background?.relativePath,
      project.music.asset?.relativePath,
      ...project.soundEffects.assets.map((asset) => asset.relativePath),
      project.branding.logo.asset?.relativePath,
      ...project.illustrations.videos.flatMap((video) => [video.relativePath, video.thumbnailPath]),
      ...project.comments.flatMap((comment) => [
        comment.image.relativePath,
        comment.attachment?.asset.relativePath,
        ...comment.attachment?.textBlocks.flatMap((block) => [block.audioPath]) ?? [],
        comment.audioPath,
        comment.conversation?.image.relativePath,
        ...comment.conversation?.messages.flatMap((message) => [message.audioPath]) ?? []
      ])
    ].filter((candidate): candidate is string => Boolean(candidate));
    const missingFiles: string[] = [];
    for (const relativePath of paths) {
      if (!(await exists(this.resolveProjectAsset(projectId, relativePath)))) missingFiles.push(relativePath);
    }
    return { project, missingFiles };
  }

  async save(project: ProjectData): Promise<ProjectData> {
    this.assertProjectId(project.id);
    const projectDirectory = this.projectDirectory(project.id);
    await mkdir(projectDirectory, { recursive: true });
    const normalized: ProjectData = syncBrollSegments({
      ...migrateProjectData(project),
      name: project.name.trim(),
      updatedAt: new Date().toISOString(),
      comments: project.comments
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((comment, index) => ({ ...comment, order: index + 1 }))
    });
    if (!normalized.name) throw new Error("Tên project không được để trống.");
    const target = this.projectFile(project.id);
    const backup = `${target}.backup-before-smart-layout`;
    if (await exists(target) && !(await exists(backup))) {
      const stored = JSON.parse(await readFile(target, "utf8")) as Partial<ProjectData>;
      if (!stored.settings?.smartLayout || !stored.illustrations?.segments) await copyFile(target, backup);
    }
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporary, target);
    return normalized;
  }

  async clearComments(projectId: string): Promise<ProjectData> {
    const project = await this.get(projectId);
    const commentAssetPaths = new Set(project.comments.flatMap((comment) => [
      comment.image.relativePath,
      comment.audioPath,
      comment.attachment?.asset.relativePath,
      ...comment.attachment?.textBlocks.flatMap((block) => [block.audioPath]) ?? [],
      comment.conversation?.image.relativePath,
      ...comment.conversation?.messages.flatMap((message) => [message.audioPath]) ?? []
    ].filter((candidate): candidate is string => Boolean(candidate))));
    project.comments = [];
    project.illustrations.segments = [];
    project.soundEffects.events = [];
    const saved = await this.save(project);
    await Promise.all([...commentAssetPaths].map((relativePath) => (
      unlink(this.resolveProjectAsset(projectId, relativePath)).catch(() => undefined)
    )));
    return saved;
  }

  async clearProjectAudio(projectId: string): Promise<ProjectData> {
    const project = await this.get(projectId);
    for (const comment of project.comments) {
      comment.audioStatus = "missing";
      comment.audioPath = undefined;
      comment.audioDuration = undefined;
      comment.audioCacheKey = undefined;
      comment.audioProcessingVersion = undefined;
      comment.error = undefined;
      if (comment.attachment) {
        comment.attachment.revealStartSeconds = undefined;
        comment.attachment.voiceStartSeconds = undefined;
        comment.attachment.audioDuration = undefined;
        for (const block of comment.attachment.textBlocks) {
          block.audioStatus = "missing";
          block.audioPath = undefined;
          block.audioDuration = undefined;
          block.audioCacheKey = undefined;
          block.audioProcessingVersion = undefined;
          block.error = undefined;
        }
      }
      if (comment.conversation) {
        for (const message of comment.conversation.messages) {
          message.audioStatus = "missing";
          message.audioPath = undefined;
          message.audioDuration = undefined;
          message.audioCacheKey = undefined;
          message.audioProcessingVersion = undefined;
          message.revealStartSeconds = undefined;
          message.voiceStartSeconds = undefined;
          message.error = undefined;
        }
      }
    }
    const saved = await this.save(project);
    await rm(path.join(this.projectDirectory(projectId), "audio"), { recursive: true, force: true });
    return saved;
  }

  async importBackground(projectId: string, file: UploadedFile): Promise<ProjectData> {
    this.assertBackground(file);
    const project = await this.get(projectId);
    const relativePath = path.posix.join("assets", "background", `${randomUUID()}${safeExtension(decodeUploadName(file.originalname))}`);
    const destination = this.resolveProjectAsset(projectId, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.path, destination);
    if (project.background?.relativePath) {
      const previous = this.resolveProjectAsset(projectId, project.background.relativePath);
      if (previous !== destination) await unlink(previous).catch(() => undefined);
    }
    project.background = await this.toAsset(file, relativePath, destination);
    return this.save(project);
  }

  async importCommentImages(projectId: string, files: UploadedFile[], parentCommentId?: string): Promise<ProjectData> {
    if (!files.length) throw new Error("Bạn chưa chọn ảnh comment.");
    const project = await this.get(projectId);
    const requestedParent = parentCommentId
      ? project.comments.find((comment) => comment.id === parentCommentId)
      : undefined;
    if (parentCommentId && !requestedParent) throw new Error("Không tìm thấy comment cha.");
    const rootParentId = requestedParent?.parentCommentId ?? requestedParent?.id;
    const added: CommentItem[] = [];
    for (const file of files) {
      this.assertImage(file);
      const id = randomUUID();
      const relativePath = path.posix.join("assets", "comments", `${id}${safeExtension(decodeUploadName(file.originalname))}`);
      const destination = this.resolveProjectAsset(projectId, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(file.path, destination);
      added.push({
        id,
        order: project.comments.length + added.length + 1,
        ...(rootParentId ? { parentCommentId: rootParentId } : {}),
        image: { ...await this.toAsset(file, relativePath, destination), ...await this.mediaInspector.probeImage(destination) },
        text: "",
        rate: project.settings.defaultRate,
        pitch: project.settings.defaultPitch,
        pauseAfter: project.settings.defaultPauseAfter,
        audioStatus: "missing"
      });
    }
    if (rootParentId) {
      const lastThreadIndex = project.comments.reduce((lastIndex, comment, index) => (
        comment.id === rootParentId || comment.parentCommentId === rootParentId ? index : lastIndex
      ), -1);
      project.comments.splice(lastThreadIndex + 1, 0, ...added);
      project.settings.smartLayout = { ...project.settings.smartLayout, enabled: true, mode: "auto" };
    } else {
      project.comments.push(...added);
    }
    project.comments.forEach((comment, index) => { comment.order = index + 1; });
    return this.save(project);
  }

  async importConversationImage(
    projectId: string,
    commentId: string,
    file: UploadedFile,
    messages: ConversationMessage[],
    ocrLanguage: string,
    mode?: "replace" | "after-comment"
  ): Promise<ProjectData> {
    this.assertImage(file);
    const project = await this.get(projectId);
    const comment = project.comments.find((candidate) => candidate.id === commentId);
    if (!comment) throw new Error("Không tìm thấy comment cần thêm ảnh hội thoại.");
    const originalName = decodeUploadName(file.originalname);
    const relativePath = path.posix.join("assets", "conversations", `${randomUUID()}${safeExtension(originalName)}`);
    const destination = this.resolveProjectAsset(projectId, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.path, destination);
    const previousPath = comment.conversation?.image.relativePath;
    const previousAttachmentPath = comment.attachment?.asset.relativePath;
    comment.attachment = undefined;
    comment.conversation = {
      enabled: true,
      image: { ...await this.toAsset(file, relativePath, destination), ...await this.mediaInspector.probeImage(destination) },
      mode: mode ?? comment.conversation?.mode ?? "replace",
      revealMode: comment.conversation?.revealMode ?? "scroll",
      speakerAVoiceId: comment.conversation?.speakerAVoiceId ?? "vi-VN-HoaiMyNeural",
      speakerBVoiceId: comment.conversation?.speakerBVoiceId ?? "vi-VN-NamMinhNeural",
      messageGapSeconds: comment.conversation?.messageGapSeconds ?? 0.08,
      dingEnabled: comment.conversation?.dingEnabled ?? true,
      dingVolume: comment.conversation?.dingVolume ?? 0.25,
      dingLeadSeconds: comment.conversation?.dingLeadSeconds ?? 0.1,
      dingAssetId: comment.conversation?.dingAssetId,
      ocrLanguage,
      messages
    };
    comment.audioStatus = "stale";
    comment.audioDuration = undefined;
    comment.audioCacheKey = undefined;
    const saved = await this.save(project);
    if (previousPath && previousPath !== relativePath) {
      await unlink(this.resolveProjectAsset(projectId, previousPath)).catch(() => undefined);
    }
    if (previousAttachmentPath) {
      await unlink(this.resolveProjectAsset(projectId, previousAttachmentPath)).catch(() => undefined);
    }
    return saved;
  }

  async importCommentAttachment(
    projectId: string,
    commentId: string,
    file: UploadedFile,
    options: {
      mode?: AttachmentMode;
      detectedType?: AttachmentDetectedType;
      classificationConfidence?: number;
      textBlocks?: AttachmentTextBlock[];
    } = {}
  ): Promise<ProjectData> {
    this.assertImage(file);
    const project = await this.get(projectId);
    const comment = project.comments.find((candidate) => candidate.id === commentId);
    if (!comment) throw new Error("Không tìm thấy comment cần thêm ảnh đính kèm.");
    const originalName = decodeUploadName(file.originalname);
    const relativePath = path.posix.join("assets", "attachments", `${randomUUID()}${safeExtension(originalName)}`);
    const destination = this.resolveProjectAsset(projectId, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.path, destination);
    const previousPath = comment.attachment?.asset.relativePath;
    const previousConversationPath = comment.conversation?.image.relativePath;
    comment.conversation = undefined;
    comment.attachment = {
      kind: "image",
      asset: { ...await this.toAsset(file, relativePath, destination), ...await this.mediaInspector.probeImage(destination) },
      mode: options.mode ?? "auto",
      detectedType: options.detectedType ?? "illustration",
      classificationConfidence: options.classificationConfidence ?? 0,
      textBlocks: options.textBlocks ?? [],
      holdAfterSeconds: comment.attachment?.holdAfterSeconds ?? 2,
      clickEnabled: comment.attachment?.clickEnabled ?? true
    };
    comment.audioStatus = comment.audioStatus === "ready" ? "stale" : comment.audioStatus;
    comment.audioDuration = undefined;
    comment.audioCacheKey = undefined;
    const saved = await this.save(project);
    if (previousPath && previousPath !== relativePath) {
      await unlink(this.resolveProjectAsset(projectId, previousPath)).catch(() => undefined);
    }
    if (previousConversationPath) {
      await unlink(this.resolveProjectAsset(projectId, previousConversationPath)).catch(() => undefined);
    }
    return saved;
  }

  async removeConversationImage(projectId: string, commentId: string): Promise<ProjectData> {
    const project = await this.get(projectId);
    const comment = project.comments.find((candidate) => candidate.id === commentId);
    if (!comment) throw new Error("Không tìm thấy comment.");
    const relativePath = comment.conversation?.image.relativePath;
    comment.conversation = undefined;
    comment.audioStatus = comment.text.trim() ? "stale" : "missing";
    comment.audioDuration = undefined;
    comment.audioCacheKey = undefined;
    const saved = await this.save(project);
    if (relativePath) await unlink(this.resolveProjectAsset(projectId, relativePath)).catch(() => undefined);
    return saved;
  }

  async importIllustrationVideos(projectId: string, files: UploadedFile[]): Promise<IllustrationImportResult> {
    if (!files.length) throw new Error("Bạn chưa chọn thư mục video minh họa.");
    const project = await this.get(projectId);
    const imported: IllustrationVideoAsset[] = [];
    const skipped: Array<{ name: string; error: string }> = [];

    for (const file of files) {
      const originalName = decodeUploadName(file.originalname);
      try {
        this.assertIllustrationVideo(file);
        const metadata = await this.mediaInspector.probeVideo(file.path);
        const id = randomUUID();
        const relativePath = path.posix.join("assets", "illustrations", `${id}${safeExtension(originalName)}`);
        const shouldCreateThumbnail = imported.length < MAX_ILLUSTRATION_THUMBNAILS;
        const thumbnailPath = shouldCreateThumbnail
          ? path.posix.join("assets", "illustration-thumbnails", `${id}.jpg`)
          : undefined;
        const destination = this.resolveProjectAsset(projectId, relativePath);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(file.path, destination);
        if (thumbnailPath) {
          const thumbnailDestination = this.resolveProjectAsset(projectId, thumbnailPath);
          await mkdir(path.dirname(thumbnailDestination), { recursive: true });
          await this.mediaInspector.createVideoThumbnail(destination, thumbnailDestination, metadata.duration);
        }
        imported.push({
          id,
          ...await this.toAsset(file, relativePath, destination),
          ...metadata,
          ...(thumbnailPath ? { thumbnailPath } : {})
        });
      } catch (error) {
        skipped.push({ name: originalName, error: error instanceof Error ? error.message : "File không hợp lệ." });
      }
    }

    if (imported.length === 0) return { project, skipped };
    const previousFiles = project.illustrations.videos.flatMap((video) => [video.relativePath, video.thumbnailPath]);
    project.illustrations = { ...project.illustrations, enabled: true, videos: imported };
    const nextSeed = (project.illustrations.randomSeed + 1) >>> 0;
    const assigned = project.illustrations.mode === "multi"
      ? maximizeBrollVariety(project, { seed: nextSeed })
      : syncBrollSegments(project, { seed: nextSeed, randomizeAll: true });
    const saved = await this.save(assigned);
    await Promise.all(previousFiles
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((relativePath) => unlink(this.resolveProjectAsset(projectId, relativePath)).catch(() => undefined)));
    return { project: saved, skipped };
  }

  async randomizeIllustrations(projectId: string, commentId?: string): Promise<ProjectData> {
    const project = await this.get(projectId);
    if (project.illustrations.videos.length === 0) throw new Error("Thư viện chưa có video minh họa.");
    return this.save(syncBrollSegments(project, {
      seed: (project.illustrations.randomSeed + 1) >>> 0,
      ...(commentId ? { randomizeCommentId: commentId } : { randomizeAll: true })
    }));
  }

  async maximizeIllustrationVariety(projectId: string): Promise<ProjectData> {
    const project = await this.get(projectId);
    if (project.illustrations.videos.length === 0) throw new Error("Thư viện chưa có video minh họa.");
    return this.save(maximizeBrollVariety(project, {
      seed: (project.illustrations.randomSeed + 1) >>> 0
    }));
  }

  async importMusic(projectId: string, file: UploadedFile): Promise<ProjectData> {
    this.assertMusic(file);
    const project = await this.get(projectId);
    const metadata = await this.mediaInspector.probeAudio(file.path);
    const originalName = decodeUploadName(file.originalname);
    const relativePath = path.posix.join("assets", "music", `${randomUUID()}${safeExtension(originalName)}`);
    const destination = this.resolveProjectAsset(projectId, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.path, destination);
    const previousPath = project.music.asset?.relativePath;
    project.music = {
      ...project.music,
      enabled: true,
      asset: await this.toAsset(file, relativePath, destination),
      duration: metadata.duration
    };
    const saved = await this.save(project);
    if (previousPath && previousPath !== relativePath) {
      await unlink(this.resolveProjectAsset(projectId, previousPath)).catch(() => undefined);
    }
    return saved;
  }

  async attachDownloadedSoundEffect(projectId: string, input: {
    title: string;
    sourcePageUrl: string;
    audioUrl: string;
    content: Uint8Array;
  }): Promise<SoundEffectAsset> {
    const cacheKey = createHash("sha256").update(input.audioUrl).digest("hex");
    const cachedPath = path.join(this.soundEffectCacheRoot, `${cacheKey}.mp3`);
    await mkdir(this.soundEffectCacheRoot, { recursive: true });
    if (!(await exists(cachedPath))) await writeFile(cachedPath, input.content);
    const relativePath = path.posix.join("assets", "sound-effects", `${cacheKey}.mp3`);
    const destination = this.resolveProjectAsset(projectId, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    if (!(await exists(destination))) await copyFile(cachedPath, destination);
    const metadata = await this.mediaInspector.probeAudio(destination);
    const fileStat = await stat(destination);
    return {
      id: cacheKey,
      provider: "myinstants",
      title: input.title.normalize("NFC").slice(0, 160),
      sourcePageUrl: input.sourcePageUrl,
      relativePath,
      originalName: `${input.title.normalize("NFC").slice(0, 120) || "sound-effect"}.mp3`,
      mimeType: "audio/mpeg",
      size: fileStat.size,
      duration: metadata.duration
    };
  }

  async removeMusic(projectId: string): Promise<ProjectData> {
    const project = await this.get(projectId);
    const previousPath = project.music.asset?.relativePath;
    project.music = { ...project.music, enabled: false, asset: undefined, duration: undefined };
    const saved = await this.save(project);
    if (previousPath) await unlink(this.resolveProjectAsset(projectId, previousPath)).catch(() => undefined);
    return saved;
  }

  async importChannelLogo(projectId: string, file: UploadedFile): Promise<ProjectData> {
    this.assertImage(file);
    const project = await this.get(projectId);
    const originalName = decodeUploadName(file.originalname);
    const relativePath = path.posix.join("assets", "branding", `${randomUUID()}${safeExtension(originalName)}`);
    const destination = this.resolveProjectAsset(projectId, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.path, destination);
    const previousPath = project.branding.logo.asset?.relativePath;
    project.branding.logo = {
      ...project.branding.logo,
      enabled: true,
      asset: { ...await this.toAsset(file, relativePath, destination), ...await this.mediaInspector.probeImage(destination) }
    };
    const saved = await this.save(project);
    if (previousPath && previousPath !== relativePath) {
      await unlink(this.resolveProjectAsset(projectId, previousPath)).catch(() => undefined);
    }
    return saved;
  }

  async removeChannelLogo(projectId: string): Promise<ProjectData> {
    const project = await this.get(projectId);
    const previousPath = project.branding.logo.asset?.relativePath;
    project.branding.logo = { ...project.branding.logo, enabled: false, asset: undefined };
    const saved = await this.save(project);
    if (previousPath) await unlink(this.resolveProjectAsset(projectId, previousPath)).catch(() => undefined);
    return saved;
  }

  private async toAsset(file: UploadedFile, relativePath: string, destination: string): Promise<MediaAsset> {
    const fileStat = await stat(destination);
    return {
      relativePath,
      originalName: decodeUploadName(file.originalname),
      mimeType: file.mimetype,
      size: fileStat.size
    };
  }

  private assertProjectId(projectId: string) {
    if (!projectIdPattern.test(projectId)) throw new Error("ID project không hợp lệ.");
  }

  private assertBackground(file: UploadedFile) {
    const allowed = new Set([".mp4", ".mov", ".m4v", ".webm"]);
    if (!file.mimetype.startsWith("video/") || !allowed.has(safeExtension(decodeUploadName(file.originalname)))) {
      throw new Error("Video nền phải là MP4, MOV, M4V hoặc WebM.");
    }
    if (file.size > 2 * 1024 * 1024 * 1024) throw new Error("Video nền vượt quá giới hạn 2 GB.");
  }

  private assertImage(file: UploadedFile) {
    const allowedMime = new Set(["image/png", "image/jpeg", "image/webp"]);
    const allowedExtension = new Set([".png", ".jpg", ".jpeg", ".webp"]);
    const originalName = decodeUploadName(file.originalname);
    if (!allowedMime.has(file.mimetype) || !allowedExtension.has(safeExtension(originalName))) {
      throw new Error(`Ảnh ${originalName} phải là PNG, JPEG hoặc WebP.`);
    }
    if (file.size > 30 * 1024 * 1024) throw new Error(`Ảnh ${originalName} vượt quá giới hạn 30 MB.`);
  }

  private assertIllustrationVideo(file: UploadedFile) {
    const allowed = new Set([".mp4", ".mov", ".m4v", ".webm"]);
    const originalName = decodeUploadName(file.originalname);
    if (!allowed.has(safeExtension(originalName))) {
      throw new Error(`Video ${originalName} phải là MP4, MOV, M4V hoặc WebM.`);
    }
    if (file.size > 2 * 1024 * 1024 * 1024) throw new Error(`Video ${originalName} vượt quá giới hạn 2 GB.`);
  }

  private assertMusic(file: UploadedFile) {
    const allowed = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
    const originalName = decodeUploadName(file.originalname);
    if (!allowed.has(safeExtension(originalName))) {
      throw new Error("Nhạc nền phải là MP3, WAV, M4A, AAC, FLAC hoặc OGG.");
    }
    if (file.size > 500 * 1024 * 1024) throw new Error("Nhạc nền vượt quá giới hạn 500 MB.");
  }
}
