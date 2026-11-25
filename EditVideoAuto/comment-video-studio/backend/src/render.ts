import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  buildTimeline,
  calculateSmartLayout,
  calculateThreadedSmartLayout,
  resolveCommentAppearanceAssetId,
  conversationViewport,
  syncBrollSegments,
  type LayoutRect,
  type ProjectData,
  type RenderJob,
  type Timeline
} from "@comment-video-studio/shared";
import { runCommand, type CommandOptions, type CommandResult } from "./command.js";
import { ProjectStore } from "./storage.js";

export type CommandRunner = (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>;

export interface RenderEngineOptions {
  run?: CommandRunner;
  now?: () => Date;
}

export interface RenderProgress {
  phase: "preparing" | "audio" | "video";
  percent: number;
}

function seconds(value: number) {
  return value.toFixed(6);
}

function resolution(project: ProjectData) {
  return project.settings.export.resolution === "720x1280"
    ? { width: 720, height: 1280 }
    : { width: 1080, height: 1920 };
}

function outputSlug(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || "video";
}

const BROLL_PRECOMPOSE_SEGMENT_THRESHOLD = 12;
const BROLL_PRECOMPOSE_INPUT_LIMIT = 6;

export interface BuildVideoArgsOptions {
  brollPrecomposed?: boolean;
}

function buildLayoutByComment(
  project: ProjectData,
  comments: ProjectData["comments"],
  width: number,
  height: number,
  overlayWidth: number,
  overlayHeight: number,
  illustrationEnabled: boolean
) {
  const layoutByComment = new Map<string, { comment: LayoutRect; broll?: LayoutRect }>();
  if (!project.settings.smartLayout.enabled || project.settings.smartLayout.mode !== "auto") return layoutByComment;
  const { widthPercent } = project.settings.overlay;
  for (const comment of comments) {
    if (comment.parentCommentId || layoutByComment.has(comment.id)) continue;
    const primaryImage = comment.conversation?.enabled
      ? {
          width: comment.conversation.image.width ?? overlayWidth,
          height: Math.min(comment.conversation.image.height ?? overlayHeight, (comment.conversation.image.width ?? overlayWidth) * 1.25)
        }
      : comment.image;
    const replies = comments.filter((candidate) => candidate.parentCommentId === comment.id);
    const visualAsset = comment.attachment?.asset ?? replies.find((reply) => reply.attachment?.asset)?.attachment?.asset;
    const visualAspect = visualAsset?.width && visualAsset?.height ? visualAsset.width / visualAsset.height : 16 / 9;
    if (replies.length) {
      const tallestReply = replies.reduce((tallest, candidate) => {
        const candidateRatio = (candidate.image.height ?? 1114) / Math.max(1, candidate.image.width ?? 918);
        const tallestRatio = (tallest.image.height ?? 1114) / Math.max(1, tallest.image.width ?? 918);
        return candidateRatio > tallestRatio ? candidate : tallest;
      }, replies[0]!);
      const threadLayout = calculateThreadedSmartLayout(
        width,
        height,
        primaryImage.width ?? overlayWidth,
        primaryImage.height ?? overlayHeight,
        tallestReply.image.width ?? overlayWidth,
        tallestReply.image.height ?? overlayHeight,
        visualAspect,
        project.settings.smartLayout,
        widthPercent,
        project.illustrations.layout.widthPercent,
        illustrationEnabled || Boolean(visualAsset)
      );
      layoutByComment.set(comment.id, { comment: threadLayout.parent, broll: threadLayout.broll });
      replies.forEach((reply) => layoutByComment.set(reply.id, { comment: threadLayout.reply, broll: threadLayout.broll }));
    } else {
      const layout = calculateSmartLayout(
        width,
        height,
        primaryImage.width ?? overlayWidth,
        primaryImage.height ?? overlayHeight,
        visualAspect,
        project.settings.smartLayout,
        widthPercent,
        project.illustrations.layout.widthPercent,
        illustrationEnabled || Boolean(visualAsset)
      );
      layoutByComment.set(comment.id, layout);
    }
  }
  return layoutByComment;
}

export function buildNarrationArgs(project: ProjectData, timeline: Timeline, outputPath: string) {
  const comments = project.comments.slice().sort((left, right) => left.order - right.order);
  const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const comment of comments) {
    if (!comment.audioPath) throw new Error(`Comment ${comment.order} chưa có file audio.`);
    args.push("-i", comment.audioPath);
  }
  const filters = comments.map((comment, index) => {
    const segment = timeline.segments[index]!;
    const segmentDuration = segment.durationFrames / timeline.fps;
    const silenceDuration = Math.max(comment.pauseAfter, segmentDuration - (comment.audioDuration ?? 0));
    return `[${index}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,apad=pad_dur=${seconds(silenceDuration)},atrim=duration=${seconds(segmentDuration)}[a${index}]`;
  });
  filters.push(`${comments.map((_comment, index) => `[a${index}]`).join("")}concat=n=${comments.length}:v=0:a=1[narration]`);
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[narration]",
    "-ar", "48000",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    outputPath
  );
  return args;
}

export function buildBrollSceneArgs(
  project: ProjectData,
  timeline: Timeline,
  scene: Timeline["segments"][number],
  outputPath: string,
  backgroundOffsetSeconds = 0,
  brollSegments?: ProjectData["illustrations"]["segments"]
) {
  if (!project.background) throw new Error("Project chưa có video nền.");
  const comments = project.comments.slice().sort((left, right) => left.order - right.order);
  const { width, height } = resolution(project);
  const { widthPercent, maxHeightPercent } = project.settings.overlay;
  const overlayWidth = Math.round(width * widthPercent / 100);
  const overlayHeight = Math.round(height * maxHeightPercent / 100);
  const layoutByComment = buildLayoutByComment(project, comments, width, height, overlayWidth, overlayHeight, true);
  const sceneDuration = scene.durationFrames / timeline.fps;
  const sceneSegments = (brollSegments ?? project.illustrations.segments.filter((segment) => segment.commentId === scene.commentId))
    .slice()
    .sort((left, right) => left.startSeconds - right.startSeconds);
  const videosById = new Map(project.illustrations.videos.map((video) => [video.id, video]));
  const args: string[] = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-stream_loop", "-1",
    "-ss", seconds(Math.max(0, backgroundOffsetSeconds)),
    "-t", seconds(sceneDuration),
    "-i", project.background.relativePath
  ];
  for (const segment of sceneSegments) {
    const video = videosById.get(segment.videoAssetId);
    if (!video) throw new Error("Timeline B-roll tham chiếu video không tồn tại.");
    args.push(
      "-stream_loop", "-1",
      "-ss", seconds(Math.max(0, segment.sourceStartSeconds)),
      "-t", seconds(segment.durationSeconds),
      "-i", video.relativePath
    );
  }

  const filters = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${timeline.fps},setsar=1[bg]`
  ];
  let videoInput = "bg";
  const layout = project.illustrations.layout;
  const manualWidth = Math.round(width * layout.widthPercent / 100);
  const manualHeight = Math.round(height * layout.heightPercent / 100);
  const manualX = `${Math.round(width * layout.xPercent / 100)}-overlay_w/2`;
  const manualY = Math.round(height * layout.topPercent / 100);
  sceneSegments.forEach((segment, index) => {
    const smart = layoutByComment.get(segment.commentId)?.broll;
    const illustrationWidth = smart ? Math.round(smart.width) : manualWidth;
    const illustrationHeight = smart ? Math.round(smart.height) : manualHeight;
    const illustrationX = smart ? String(Math.round(smart.x)) : manualX;
    const illustrationY = smart ? Math.round(smart.y) : manualY;
    const fitFilter = layout.fit === "contain"
      ? `scale=${illustrationWidth}:${illustrationHeight}:force_original_aspect_ratio=decrease,pad=${illustrationWidth}:${illustrationHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`
      : `scale=${illustrationWidth}:${illustrationHeight}:force_original_aspect_ratio=increase,crop=${illustrationWidth}:${illustrationHeight}`;
    const localStartFrame = Math.max(0, Math.round(segment.startSeconds * timeline.fps) - scene.startFrame);
    const localEndFrame = Math.min(
      scene.durationFrames - 1,
      Math.round((segment.startSeconds + segment.durationSeconds) * timeline.fps) - scene.startFrame - 1
    );
    filters.push(
      `[${index + 1}:v]${fitFilter},fps=${timeline.fps},setsar=1,setpts=PTS-STARTPTS+${seconds(localStartFrame / timeline.fps)}/TB[ill${index}]`
    );
    const output = `iv${index}`;
    filters.push(
      `[${videoInput}][ill${index}]overlay=x='${illustrationX}':y=${illustrationY}:enable='between(n,${localStartFrame},${localEndFrame})':eof_action=pass:repeatlast=1[${output}]`
    );
    videoInput = output;
  });

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", `[${videoInput}]`,
    "-an",
    "-frames:v", String(scene.durationFrames),
    "-r", String(timeline.fps),
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-g", String(timeline.fps * 2),
    "-keyint_min", String(timeline.fps * 2),
    "-sc_threshold", "0",
    "-movflags", "+faststart",
    outputPath
  );
  return args;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function renderWatermarkImage(text: string, fontSize: number, outputPath: string) {
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error("Nội dung watermark không được để trống.");
  const safeFontSize = Math.max(16, Math.min(160, Math.round(fontSize)));
  const width = Math.max(160, Math.min(16000, Math.ceil(Array.from(normalizedText).length * safeFontSize * 1.1 + safeFontSize)));
  const height = Math.ceil(safeFontSize * 1.8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${safeFontSize / 2}" y="${safeFontSize * 1.25}" font-family="Arial, Helvetica, sans-serif" font-size="${safeFontSize}" font-weight="600" fill="white">${escapeXml(normalizedText)}</text></svg>`;
  await sharp(Buffer.from(svg)).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outputPath);
}

export function buildVideoArgs(
  project: ProjectData,
  timeline: Timeline,
  narrationPath: string,
  outputPath: string,
  watermarkImagePath?: string,
  options: BuildVideoArgsOptions = {}
) {
  if (!project.background) throw new Error("Project chưa có video nền.");
  if (!options.brollPrecomposed) project = syncBrollSegments(project);
  const comments = project.comments.slice().sort((left, right) => left.order - right.order);
  const { width, height } = resolution(project);
  const { widthPercent, xPercent, topPercent, maxHeightPercent } = project.settings.overlay;
  const illustrationLayoutEnabled = project.illustrations.enabled && project.illustrations.videos.length > 0;
  const illustrationEnabled = illustrationLayoutEnabled && !options.brollPrecomposed;
  const overlayWidth = Math.round(width * widthPercent / 100);
  const overlayHeight = Math.round(height * maxHeightPercent / 100);
  const manualCommentX = `${Math.round(width * xPercent / 100)}-overlay_w/2`;
  const manualCommentY = Math.round(height * topPercent / 100);
  const layoutByComment = buildLayoutByComment(project, comments, width, height, overlayWidth, overlayHeight, illustrationLayoutEnabled);
  const renderDuration = seconds(timeline.durationSeconds);
  const args: string[] = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-stream_loop", "-1", "-t", renderDuration, "-i", project.background!.relativePath
  ];
  for (const comment of comments) args.push("-loop", "1", "-t", renderDuration, "-i", comment.image.relativePath);
  const attachmentInputs = new Map<string, number>();
  for (const comment of comments) {
    if (!comment.attachment?.asset) continue;
    const inputIndex = args.filter((value) => value === "-i").length;
    args.push("-loop", "1", "-t", renderDuration, "-i", comment.attachment.asset.relativePath);
    attachmentInputs.set(comment.id, inputIndex);
  }
  const conversationInputs = new Map<string, number>();
  for (const comment of comments) {
    if (!comment.conversation?.enabled) continue;
    for (const message of comment.conversation.messages.filter((item) => item.revealStartSeconds !== undefined)) {
      const inputIndex = args.filter((value) => value === "-i").length;
      args.push("-loop", "1", "-t", renderDuration, "-i", comment.conversation.image.relativePath);
      conversationInputs.set(message.id, inputIndex);
    }
  }
  const narrationInput = args.filter((value) => value === "-i").length;
  args.push("-i", narrationPath);
  const videosById = new Map(project.illustrations.videos.map((video) => [video.id, video]));
  const illustrationInputs = new Map<string, number>();
  if (illustrationEnabled) {
    project.illustrations.segments.forEach((segment) => {
      const video = videosById.get(segment.videoAssetId);
      if (!video) throw new Error("Timeline B-roll tham chiếu video không tồn tại.");
      const inputIndex = args.filter((value) => value === "-i").length;
      args.push(
        "-stream_loop", "-1",
        "-ss", seconds(Math.max(0, segment.sourceStartSeconds)),
        "-t", seconds(segment.durationSeconds),
        "-i", video.relativePath
      );
      illustrationInputs.set(segment.id, inputIndex);
    });
  }
  const watermarkInput = project.branding.watermark.enabled && project.branding.watermark.text.trim() && watermarkImagePath
    ? args.filter((value) => value === "-i").length
    : undefined;
  if (watermarkInput !== undefined) args.push("-loop", "1", "-t", renderDuration, "-i", watermarkImagePath!);
  const logoInput = project.branding.logo.enabled && project.branding.logo.asset
    ? args.filter((value) => value === "-i").length
    : undefined;
  if (logoInput !== undefined) args.push("-loop", "1", "-t", renderDuration, "-i", project.branding.logo.asset!.relativePath);
  const musicInput = project.music.enabled && project.music.asset
    ? args.filter((value) => value === "-i").length
    : undefined;
  if (musicInput !== undefined) args.push("-stream_loop", "-1", "-t", renderDuration, "-i", project.music.asset!.relativePath);
  const soundAssetsById = new Map(project.soundEffects.assets.map((asset) => [asset.id, asset]));
  const activeSoundEffects = project.soundEffects.enabled
    ? project.soundEffects.events.filter((event) => soundAssetsById.has(event.assetId) && timeline.segments.some((segment) => segment.commentId === event.commentId))
    : [];
  const renderSoundEffects = activeSoundEffects.map((event) => {
    const segment = timeline.segments.find((item) => item.commentId === event.commentId)!;
    const asset = soundAssetsById.get(event.assetId)!;
    const offset = Math.max(0, Math.min(event.offsetSeconds, Math.max(0, segment.endSeconds - segment.startSeconds - 0.01)));
    const start = segment.startSeconds + offset;
    return { id: event.id, asset, start, duration: Math.max(0.01, Math.min(asset.duration, segment.endSeconds - start)), volume: project.soundEffects.volume * event.volume };
  });
  const appearance = project.soundEffects.appearance;
  if (project.soundEffects.enabled && appearance.enabled) {
    comments.forEach((comment) => {
      const assetId = resolveCommentAppearanceAssetId(comments, comment.id, appearance);
      const asset = assetId ? soundAssetsById.get(assetId) : undefined;
      const segment = timeline.segments.find((item) => item.commentId === comment.id);
      if (!asset || !segment) return;
      renderSoundEffects.push({
        id: `appearance-${comment.id}`,
        asset,
        start: segment.startSeconds,
        duration: Math.max(0.01, Math.min(asset.duration, segment.endSeconds - segment.startSeconds)),
        volume: appearance.volume
      });
    });
    comments.forEach((comment) => {
      const reveal = comment.attachment?.revealStartSeconds;
      if (!comment.attachment?.clickEnabled || reveal === undefined) return;
      const asset = appearance.nextAssetId ? soundAssetsById.get(appearance.nextAssetId) : undefined;
      const segment = timeline.segments.find((item) => item.commentId === comment.id);
      if (!asset || !segment || reveal >= segment.endSeconds - segment.startSeconds) return;
      renderSoundEffects.push({
        id: `attachment-click-${comment.id}`,
        asset,
        start: segment.startSeconds + reveal,
        duration: Math.max(0.01, Math.min(asset.duration, segment.endSeconds - segment.startSeconds - reveal)),
        volume: appearance.volume
      });
    });
  }
  for (const comment of comments) {
    const conversation = comment.conversation;
    if (!conversation?.enabled || !conversation.dingEnabled || !conversation.dingAssetId) continue;
    const asset = soundAssetsById.get(conversation.dingAssetId);
    const segment = timeline.segments.find((item) => item.commentId === comment.id);
    if (!asset || !segment) continue;
    for (const message of conversation.messages) {
      if (message.revealStartSeconds === undefined) continue;
      renderSoundEffects.push({
        id: `ding-${comment.id}-${message.id}`,
        asset,
        start: segment.startSeconds + message.revealStartSeconds,
        duration: Math.max(0.01, Math.min(asset.duration, segment.endSeconds - segment.startSeconds - message.revealStartSeconds)),
        volume: conversation.dingVolume
      });
    }
  }
  const soundEffectInputs = new Map<string, number>();
  for (const event of renderSoundEffects) {
    const inputIndex = args.filter((value) => value === "-i").length;
    args.push("-i", event.asset.relativePath);
    soundEffectInputs.set(event.id, inputIndex);
  }

  const filters = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${timeline.fps},setsar=1[bg]`
  ];
  comments.forEach((comment, index) => {
    const smart = layoutByComment.get(comment.id)?.comment;
    const targetWidth = smart ? Math.round(smart.width) : overlayWidth;
    const targetHeight = smart ? Math.round(smart.height) : overlayHeight;
    filters.push(`[${index + 1}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[img${index}]`);
  });
  let videoInput = "bg";
  if (illustrationEnabled) {
    const layout = project.illustrations.layout;
    const manualWidth = Math.round(width * layout.widthPercent / 100);
    const manualHeight = Math.round(height * layout.heightPercent / 100);
    const manualX = `${Math.round(width * layout.xPercent / 100)}-overlay_w/2`;
    const manualY = Math.round(height * layout.topPercent / 100);
    project.illustrations.segments.forEach((segment, index) => {
      const inputIndex = illustrationInputs.get(segment.id)!;
      const smart = layoutByComment.get(segment.commentId)?.broll;
      const illustrationWidth = smart ? Math.round(smart.width) : manualWidth;
      const illustrationHeight = smart ? Math.round(smart.height) : manualHeight;
      const illustrationX = smart ? String(Math.round(smart.x)) : manualX;
      const illustrationY = smart ? Math.round(smart.y) : manualY;
      const fitFilter = layout.fit === "contain"
        ? `scale=${illustrationWidth}:${illustrationHeight}:force_original_aspect_ratio=decrease,pad=${illustrationWidth}:${illustrationHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`
        : `scale=${illustrationWidth}:${illustrationHeight}:force_original_aspect_ratio=increase,crop=${illustrationWidth}:${illustrationHeight}`;
      filters.push(`[${inputIndex}:v]${fitFilter},fps=${timeline.fps},setsar=1,setpts=PTS-STARTPTS+${seconds(segment.startSeconds)}/TB[ill${index}]`);
      const output = `iv${index}`;
      const startFrame = Math.round(segment.startSeconds * timeline.fps);
      const endFrame = Math.round((segment.startSeconds + segment.durationSeconds) * timeline.fps) - 1;
      filters.push(
        `[${videoInput}][ill${index}]overlay=x='${illustrationX}':y=${illustrationY}:enable='between(n,${startFrame},${endFrame})':eof_action=pass:repeatlast=1[${output}]`
      );
      videoInput = output;
    });
  }
  for (const comment of comments) {
    const inputIndex = attachmentInputs.get(comment.id);
    const segment = timeline.segments.find((item) => item.commentId === comment.id);
    if (inputIndex === undefined || !segment) continue;
    const smart = layoutByComment.get(comment.id)?.broll;
    const layout = project.illustrations.layout;
    const targetWidth = smart ? Math.round(smart.width) : Math.round(width * layout.widthPercent / 100);
    const targetHeight = smart ? Math.round(smart.height) : Math.round(height * layout.heightPercent / 100);
    const targetX = smart ? String(Math.round(smart.x)) : `${Math.round(width * layout.xPercent / 100)}-overlay_w/2`;
    const targetY = smart ? Math.round(smart.y) : Math.round(height * layout.topPercent / 100);
    const label = `attachment${comment.order}`;
    const output = `attachmentv${comment.order}`;
    const attachmentStartFrame = segment.startFrame + Math.max(0, Math.round((comment.attachment?.revealStartSeconds ?? 0) * timeline.fps));
    const attachmentEndFrame = segment.endFrame;
    filters.push(`[${inputIndex}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,setsar=1[${label}]`);
    filters.push(`[${videoInput}][${label}]overlay=x='${targetX}':y=${targetY}:enable='between(n,${attachmentStartFrame},${attachmentEndFrame - 1})':eof_action=pass:repeatlast=1[${output}]`);
    videoInput = output;
  }
  comments.forEach((comment, index) => {
    const segment = timeline.segments[index]!;
    const output = `v${index}`;
    const smart = layoutByComment.get(comment.id)?.comment;
    const commentX = smart ? String(Math.round(smart.x)) : manualCommentX;
    const commentY = smart ? Math.round(smart.y) : manualCommentY;
    const replySegments = comment.parentCommentId
      ? []
      : comments
          .filter((candidate) => candidate.parentCommentId === comment.id)
          .map((candidate) => timeline.segments[comments.findIndex((item) => item.id === candidate.id)]!)
          .filter(Boolean);
    const visualEndFrame = comment.parentCommentId
      ? Math.min(segment.endFrame, segment.startFrame + Math.max(1, Math.ceil((comment.audioDuration ?? 0) * timeline.fps)))
      : replySegments.length
        ? Math.max(segment.endFrame, ...replySegments.map((replySegment) => replySegment.endFrame))
        : segment.endFrame;
    const firstConversationStart = comment.conversation?.enabled
      ? comment.conversation.messages
          .map((message) => message.revealStartSeconds)
          .filter((value): value is number => value !== undefined)
          .sort((left, right) => left - right)[0]
      : undefined;
    const attachmentStart = comment.attachment?.revealStartSeconds;
    const firstSecondaryStart = [firstConversationStart, attachmentStart]
      .filter((value): value is number => value !== undefined)
      .sort((left, right) => left - right)[0];
    const originalEndFrame = firstSecondaryStart === undefined
      ? visualEndFrame
      : Math.min(visualEndFrame, segment.startFrame + Math.round(firstSecondaryStart * timeline.fps));
    if (originalEndFrame > segment.startFrame) {
      filters.push(
        `[${videoInput}][img${index}]overlay=x='${commentX}':y=${commentY}:enable='between(n,${segment.startFrame},${originalEndFrame - 1})':eof_action=pass:repeatlast=1[${output}]`
      );
      videoInput = output;
    } else {
      filters.push(`[img${index}]nullsink`);
    }
  });
  let conversationStateIndex = 0;
  for (const comment of comments) {
    const conversation = comment.conversation;
    const segment = timeline.segments[comments.findIndex((item) => item.id === comment.id)]!;
    if (!conversation?.enabled) continue;
    const orderedMessages = conversation.messages
      .filter((message) => message.revealStartSeconds !== undefined && conversationInputs.has(message.id))
      .slice()
      .sort((left, right) => (left.revealStartSeconds ?? 0) - (right.revealStartSeconds ?? 0));
    const smart = layoutByComment.get(comment.id)?.comment;
    const targetWidth = smart ? Math.round(smart.width) : overlayWidth;
    const targetHeight = smart ? Math.round(smart.height) : overlayHeight;
    const imageWidth = conversation.image.width ?? 1080;
    const imageHeight = conversation.image.height ?? 1920;
    const maxVisibleRatio = Math.min(1, targetHeight / Math.max(1, targetWidth * imageHeight / imageWidth));
    const x = smart ? String(Math.round(smart.x)) : manualCommentX;
    const baseY = smart ? Math.round(smart.y) : manualCommentY;
    orderedMessages.forEach((message, messageIndex) => {
      const inputIndex = conversationInputs.get(message.id)!;
      const viewport = conversationViewport(orderedMessages, message.id, maxVisibleRatio);
      const ratio = Math.max(0.01, viewport.bottom - viewport.top);
      const startFrame = segment.startFrame + Math.round((message.revealStartSeconds ?? 0) * timeline.fps);
      const nextStart = orderedMessages[messageIndex + 1]?.revealStartSeconds;
      const transitionFrames = conversation.revealMode === "scroll" ? Math.round(0.22 * timeline.fps) : 0;
      const endFrame = nextStart === undefined
        ? segment.endFrame - 1
        : Math.min(segment.endFrame - 1, segment.startFrame + Math.round(nextStart * timeline.fps) + transitionFrames);
      const startSeconds = startFrame / timeline.fps;
      const label = `chat${conversationStateIndex}`;
      const output = `chatv${conversationStateIndex}`;
      const fade = conversation.revealMode === "scroll" ? `,fade=t=in:st=${seconds(startSeconds)}:d=0.22:alpha=1` : "";
      filters.push(
        `[${inputIndex}:v]crop=iw:ih*${ratio.toFixed(6)}:0:ih*${viewport.top.toFixed(6)},scale=${targetWidth}:-1,format=rgba,setpts=PTS-STARTPTS+${seconds(startSeconds)}/TB${fade}[${label}]`
      );
      const y = conversation.revealMode === "scroll"
        ? `'${baseY}+18*(1-min(max((t-${seconds(startSeconds)})/0.22,0),1))'`
        : String(baseY);
      filters.push(`[${videoInput}][${label}]overlay=x='${x}':y=${y}:enable='between(n,${startFrame},${endFrame})':eof_action=pass:repeatlast=1[${output}]`);
      videoInput = output;
      conversationStateIndex += 1;
    });
  }
  if (watermarkInput !== undefined) {
    const watermark = project.branding.watermark;
    const output = "watermarked";
    const scale = width / 1080;
    filters.push(`[${watermarkInput}:v]scale=iw*${scale.toFixed(6)}:-1,format=rgba,colorchannelmixer=aa=${watermark.opacity.toFixed(4)},setsar=1[watermark]`);
    filters.push(`[${videoInput}][watermark]overlay=x='main_w*${(watermark.xPercent / 100).toFixed(6)}-overlay_w/2':y='main_h*${(watermark.yPercent / 100).toFixed(6)}-overlay_h/2':eof_action=pass:repeatlast=1[${output}]`);
    videoInput = output;
  }
  if (logoInput !== undefined) {
    const logo = project.branding.logo;
    const logoWidth = Math.max(1, Math.round(width * logo.widthPercent / 100));
    const output = "branded";
    filters.push(`[${logoInput}:v]scale=${logoWidth}:-1,format=rgba,colorchannelmixer=aa=${logo.opacity.toFixed(4)},setsar=1[logo]`);
    filters.push(`[${videoInput}][logo]overlay=x='main_w*${(logo.xPercent / 100).toFixed(6)}-overlay_w/2':y='main_h*${(logo.yPercent / 100).toFixed(6)}-overlay_h/2':eof_action=pass:repeatlast=1[${output}]`);
    videoInput = output;
  }

  let audioMap = `${narrationInput}:a:0`;
  if (musicInput !== undefined || renderSoundEffects.length) {
    const total = timeline.durationSeconds;
    filters.push(`[${narrationInput}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=${seconds(total)},asetpts=PTS-STARTPTS[narrationraw]`);
    let baseAudio = "narrationraw";
    if (musicInput !== undefined) {
      const fadeIn = Math.min(Math.max(0, project.music.fadeIn), total);
      const fadeOut = Math.min(Math.max(0, project.music.fadeOut), total);
      const musicFilters = [
        `[${musicInput}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=${seconds(total)},asetpts=PTS-STARTPTS,volume=${project.music.volume.toFixed(4)}`
      ];
      if (fadeIn > 0) musicFilters.push(`afade=t=in:st=0:d=${seconds(fadeIn)}`);
      if (fadeOut > 0) musicFilters.push(`afade=t=out:st=${seconds(Math.max(0, total - fadeOut))}:d=${seconds(fadeOut)}`);
      filters.push(`${musicFilters.join(",")}[music]`);
      if (project.music.ducking) {
        filters.push("[narrationraw]asplit=2[narrationmix][narrationside]");
        filters.push("[music][narrationside]sidechaincompress=threshold=0.025:ratio=8:attack=20:release=300[ducked]");
        filters.push("[narrationmix][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[baseaudio]");
      } else {
        filters.push("[narrationraw][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[baseaudio]");
      }
      baseAudio = "baseaudio";
    }
    const soundLabels: string[] = [];
    renderSoundEffects.forEach((event, index) => {
      const { start, duration } = event;
      const fadeOut = Math.min(0.08, duration / 2);
      const label = `sfx${index}`;
      const volume = Math.max(0, Math.min(2, event.volume));
      filters.push(
        `[${soundEffectInputs.get(event.id)}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=${seconds(duration)},asetpts=PTS-STARTPTS,volume=${volume.toFixed(4)},afade=t=out:st=${seconds(Math.max(0, duration - fadeOut))}:d=${seconds(fadeOut)},adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[${label}]`
      );
      soundLabels.push(label);
    });
    if (soundLabels.length) {
      filters.push(`[${baseAudio}]${soundLabels.map((label) => `[${label}]`).join("")}amix=inputs=${soundLabels.length + 1}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[audio]`);
      audioMap = "[audio]";
    } else if (baseAudio !== "narrationraw") {
      filters.push(`[${baseAudio}]alimiter=limit=0.95[audio]`);
      audioMap = "[audio]";
    } else {
      audioMap = "[narrationraw]";
    }
  }
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", `[${videoInput}]`,
    "-map", audioMap,
    "-t", renderDuration,
    "-r", String(timeline.fps),
    "-pix_fmt", "yuv420p",
    "-c:v", project.settings.export.encoder
  );
  if (project.settings.export.encoder === "libx264") {
    args.push("-preset", "medium", "-crf", "20");
  } else {
    args.push("-b:v", project.settings.export.resolution === "720x1280" ? "5M" : "9M", "-allow_sw", "1");
  }
  args.push(
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats",
    outputPath
  );
  return args;
}

function parseProgress(chunk: string, totalSeconds: number) {
  const matches = [...chunk.matchAll(/out_time_us=(\d+)/g)];
  const last = matches.at(-1);
  if (!last) return undefined;
  const secondsComplete = Number(last[1]) / 1_000_000;
  return Math.max(0, Math.min(100, secondsComplete / totalSeconds * 100));
}

export class RenderEngine {
  private readonly run: CommandRunner;
  private readonly now: () => Date;

  constructor(private readonly store: ProjectStore, options: RenderEngineOptions = {}) {
    this.run = options.run ?? runCommand;
    this.now = options.now ?? (() => new Date());
  }

  private async probeMediaDuration(filePath: string, signal: AbortSignal) {
    const probe = await this.run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath
    ], { signal, timeoutMs: 30_000 });
    const duration = Number.parseFloat(probe.stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  }

  private async precomposeBrollBackground(
    project: ProjectData,
    timeline: Timeline,
    tempDirectory: string,
    onProgress: (progress: RenderProgress) => void,
    signal: AbortSignal
  ) {
    const backgroundDuration = await this.probeMediaDuration(project.background!.relativePath, signal);
    const spans: Array<{ scene: Timeline["segments"][number]; segments: ProjectData["illustrations"]["segments"] }> = [];
    for (const scene of timeline.segments) {
      const sceneSegments = project.illustrations.segments
        .filter((segment) => segment.commentId === scene.commentId)
        .slice()
        .sort((left, right) => left.startSeconds - right.startSeconds);
      if (!sceneSegments.length) {
        spans.push({ scene, segments: [] });
        continue;
      }
      for (let index = 0; index < sceneSegments.length; index += BROLL_PRECOMPOSE_INPUT_LIMIT) {
        const segments = sceneSegments.slice(index, index + BROLL_PRECOMPOSE_INPUT_LIMIT);
        const startFrame = Math.round(segments[0]!.startSeconds * timeline.fps);
        const endFrame = Math.round((segments.at(-1)!.startSeconds + segments.at(-1)!.durationSeconds) * timeline.fps);
        spans.push({
          scene: {
            ...scene,
            startFrame,
            endFrame,
            durationFrames: endFrame - startFrame,
            startSeconds: startFrame / timeline.fps,
            endSeconds: endFrame / timeline.fps
          },
          segments
        });
      }
    }
    const scenePaths: string[] = [];
    for (let index = 0; index < spans.length; index += 1) {
      const { scene, segments } = spans[index]!;
      const scenePath = path.join(tempDirectory, `broll-scene-${String(index).padStart(4, "0")}.mp4`);
      const backgroundOffset = backgroundDuration ? scene.startSeconds % backgroundDuration : 0;
      await this.run("ffmpeg", buildBrollSceneArgs(project, timeline, scene, scenePath, backgroundOffset, segments), {
        signal,
        timeoutMs: 30 * 60_000
      });
      scenePaths.push(scenePath);
      onProgress({ phase: "preparing", percent: 7 + (index + 1) / spans.length * 7 });
    }
    const concatPath = path.join(tempDirectory, "broll-scenes.ffconcat");
    const concatBody = ["ffconcat version 1.0", ...scenePaths.map((scenePath) => `file '${scenePath.replaceAll("'", "'\\''")}'`)].join("\n");
    await writeFile(concatPath, `${concatBody}\n`, "utf8");
    const outputPath = path.join(tempDirectory, "broll-background.mp4");
    await this.run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", concatPath,
      "-c", "copy",
      "-movflags", "+faststart",
      outputPath
    ], { signal, timeoutMs: 30 * 60_000 });
    return outputPath;
  }

  async render(projectId: string, onProgress: (progress: RenderProgress) => void, signal: AbortSignal) {
    const project = await this.store.get(projectId);
    if (!project.background) throw new Error("Hãy chọn video nền trước khi xuất.");
    if (!project.comments.length) throw new Error("Project chưa có comment nào.");
    const notReady = project.comments.find((comment) => comment.audioStatus !== "ready" || !comment.audioPath || !comment.audioDuration);
    if (notReady) throw new Error(`Comment ${notReady.order} chưa có audio hợp lệ.`);
    const envelope = await this.store.getEnvelope(projectId);
    if (envelope.missingFiles.length) throw new Error(`Thiếu file: ${envelope.missingFiles.join(", ")}`);
    const timeline = buildTimeline(project.comments, project.settings.export.fps);
    const tempDirectory = path.join(this.store.rendersTempRoot, randomUUID());
    const narrationPath = path.join(tempDirectory, "narration.wav");
    const watermarkPath = path.join(tempDirectory, "watermark.png");
    if (project.settings.export.encoder !== "libx264" && project.settings.export.encoder !== "h264_videotoolbox") {
      throw new Error("Bộ mã hóa video không hợp lệ.");
    }
    const outputsRoot = path.resolve(this.store.outputsRoot);
    const outputDirectory = project.settings.export.outputDirectory
      ? path.resolve(outputsRoot, project.settings.export.outputDirectory)
      : path.join(outputsRoot, project.id);
    if (outputDirectory !== outputsRoot && !outputDirectory.startsWith(`${outputsRoot}${path.sep}`)) {
      throw new Error("Thư mục xuất video không hợp lệ.");
    }
    const stamp = this.now().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(outputDirectory, `${outputSlug(project.name)}-${stamp}-${randomUUID().slice(0, 8)}.mp4`);
    await Promise.all([mkdir(tempDirectory, { recursive: true }), mkdir(outputDirectory, { recursive: true })]);

    try {
      onProgress({ phase: "preparing", percent: 2 });
      let resolvedProject = structuredClone(project);
      resolvedProject.background!.relativePath = this.store.resolveProjectAsset(project.id, project.background.relativePath);
      for (const video of resolvedProject.illustrations.videos) {
        video.relativePath = this.store.resolveProjectAsset(project.id, video.relativePath);
      }
      if (resolvedProject.music.asset) {
        resolvedProject.music.asset.relativePath = this.store.resolveProjectAsset(project.id, resolvedProject.music.asset.relativePath);
      }
      for (const asset of resolvedProject.soundEffects.assets) {
        asset.relativePath = this.store.resolveProjectAsset(project.id, asset.relativePath);
      }
      for (const comment of resolvedProject.comments) {
        comment.image.relativePath = this.store.resolveProjectAsset(project.id, comment.image.relativePath);
        if (comment.attachment) {
          comment.attachment.asset.relativePath = this.store.resolveProjectAsset(project.id, comment.attachment.asset.relativePath);
        }
        comment.audioPath = this.store.resolveProjectAsset(project.id, comment.audioPath!);
        if (comment.conversation) {
          comment.conversation.image.relativePath = this.store.resolveProjectAsset(project.id, comment.conversation.image.relativePath);
          for (const message of comment.conversation.messages) {
            if (message.audioPath) message.audioPath = this.store.resolveProjectAsset(project.id, message.audioPath);
          }
        }
      }
      if (resolvedProject.branding.logo.asset) {
        resolvedProject.branding.logo.asset.relativePath = this.store.resolveProjectAsset(project.id, resolvedProject.branding.logo.asset.relativePath);
      }
      if (resolvedProject.branding.watermark.enabled && resolvedProject.branding.watermark.text.trim()) {
        await renderWatermarkImage(resolvedProject.branding.watermark.text, resolvedProject.branding.watermark.fontSize, watermarkPath);
      }
      resolvedProject = syncBrollSegments(resolvedProject);
      onProgress({ phase: "audio", percent: 5 });
      await this.run("ffmpeg", buildNarrationArgs(resolvedProject, timeline, narrationPath), { signal, timeoutMs: 30 * 60_000 });
      const shouldPrecomposeBroll = resolvedProject.illustrations.enabled
        && resolvedProject.illustrations.segments.length > BROLL_PRECOMPOSE_SEGMENT_THRESHOLD;
      if (shouldPrecomposeBroll) {
        onProgress({ phase: "preparing", percent: 7 });
        resolvedProject.background!.relativePath = await this.precomposeBrollBackground(
          resolvedProject,
          timeline,
          tempDirectory,
          onProgress,
          signal
        );
      }
      onProgress({ phase: "video", percent: 15 });
      let progressBuffer = "";
      await this.run("ffmpeg", buildVideoArgs(
        resolvedProject,
        timeline,
        narrationPath,
        outputPath,
        watermarkPath,
        { brollPrecomposed: shouldPrecomposeBroll }
      ), {
        signal,
        timeoutMs: 4 * 60 * 60_000,
        onStdout: (chunk) => {
          progressBuffer = `${progressBuffer}${chunk}`.slice(-4096);
          const percent = parseProgress(progressBuffer, timeline.durationSeconds);
          if (percent !== undefined) onProgress({ phase: "video", percent: 15 + percent * 0.84 });
        }
      });
      onProgress({ phase: "video", percent: 99.5 });
      const probe = await this.run("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        outputPath
      ], { signal, timeoutMs: 30_000 });
      const renderedDuration = Number.parseFloat(probe.stdout.trim());
      if (!Number.isFinite(renderedDuration) || Math.abs(renderedDuration - timeline.durationSeconds) > 1 / timeline.fps + 0.1) {
        throw new Error("File video đầu ra chưa hoàn tất hoặc sai thời lượng.");
      }
      onProgress({ phase: "video", percent: 100 });
      return path.relative(this.store.dataRoot, outputPath).split(path.sep).join("/");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }
}

export class RenderQueue {
  private readonly jobs = new Map<string, RenderJob>();
  private readonly pending: string[] = [];
  private readonly settledListeners = new Set<(job: RenderJob) => void | Promise<void>>();
  private active?: { jobId: string; controller: AbortController };

  constructor(private readonly engine: RenderEngine) {}

  list() {
    return [...this.jobs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  onSettled(listener: (job: RenderJob) => void | Promise<void>) {
    this.settledListeners.add(listener);
    return () => this.settledListeners.delete(listener);
  }

  enqueue(projectId: string) {
    const job: RenderJob = {
      id: randomUUID(),
      projectId,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString()
    };
    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    void this.processNext();
    return job;
  }

  cancel(jobId: string) {
    const job = this.requireJob(jobId);
    if (job.status === "queued") {
      const index = this.pending.indexOf(jobId);
      if (index >= 0) this.pending.splice(index, 1);
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
    } else if (job.status === "rendering") {
      this.active?.controller.abort();
    }
    return job;
  }

  cancelProject(projectId: string) {
    return this.list()
      .filter((job) => job.projectId === projectId && (job.status === "queued" || job.status === "rendering"))
      .map((job) => this.cancel(job.id));
  }

  retry(jobId: string) {
    const job = this.requireJob(jobId);
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new Error("Chỉ có thể chạy lại tác vụ lỗi hoặc đã hủy.");
    }
    return this.enqueue(job.projectId);
  }

  private async processNext(): Promise<void> {
    if (this.active) return;
    const jobId = this.pending.shift();
    if (!jobId) return;
    const job = this.requireJob(jobId);
    const controller = new AbortController();
    this.active = { jobId, controller };
    job.status = "rendering";
    job.startedAt = new Date().toISOString();
    try {
      job.outputPath = await this.engine.render(job.projectId, (progress) => {
        job.progress = Math.round(progress.percent * 10) / 10;
      }, controller.signal);
      job.status = "completed";
      job.progress = 100;
    } catch (error) {
      job.status = controller.signal.aborted ? "cancelled" : "failed";
      job.error = controller.signal.aborted
        ? "Đã hủy tác vụ render."
        : error instanceof Error ? error.message : "Render thất bại.";
    } finally {
      job.completedAt = new Date().toISOString();
      this.active = undefined;
      for (const listener of this.settledListeners) {
        void Promise.resolve(listener(job)).catch(() => undefined);
      }
      void this.processNext();
    }
  }

  private requireJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Không tìm thấy tác vụ render.");
    return job;
  }
}
