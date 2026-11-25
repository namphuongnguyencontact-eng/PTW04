export type TtsProviderId = "edge" | "elevenlabs" | "macos" | "voicestudio" | "test";
export type AudioStatus = "missing" | "stale" | "generating" | "ready" | "error";
export type RenderStatus = "queued" | "rendering" | "completed" | "failed" | "cancelled";

export interface MediaAsset {
  relativePath: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface IllustrationVideoAsset extends MediaAsset {
  id: string;
  duration: number;
  width: number;
  height: number;
  thumbnailPath?: string;
}

export interface CommentItem {
  id: string;
  order: number;
  parentCommentId?: string;
  image: MediaAsset;
  text: string;
  speechText?: string;
  provider?: TtsProviderId;
  voiceId?: string;
  rate: number;
  pitch: number;
  audioPath?: string;
  audioCacheKey?: string;
  audioProcessingVersion?: number;
  audioDuration?: number;
  pauseAfter: number;
  audioStatus: AudioStatus;
  error?: string;
  illustrationVideoId?: string;
  illustrationStartSeconds?: number;
  illustrationLocked?: boolean;
  attachment?: CommentAttachment;
  source?: CommentSource;
  conversation?: ConversationSettings;
}

const VIETNAMESE_TEENCODE: Record<string, string> = {
  k: "không",
  ko: "không",
  kh: "không",
  hok: "không",
  dc: "được",
  đc: "được",
  cx: "cũng",
  vs: "với",
  mik: "mình",
  mk: "mình",
  mn: "mọi người",
  ntn: "như thế nào",
  nx: "nữa",
  r: "rồi",
  j: "gì",
  v: "vậy",
  ib: "nhắn riêng",
  rep: "trả lời",
  bt: "biết",
  đg: "đang",
  dg: "đang",
  trl: "trả lời",
  hnay: "hôm nay",
  hqua: "hôm qua",
  hs: "học sinh",
  sv: "sinh viên",
  ny: "người yêu",
  vk: "vợ",
  ck: "chồng",
  bsi: "bác sĩ",
  bs: "bác sĩ",
  bn: "bạn",
  mng: "mọi người",
  nta: "người ta",
  nma: "nhưng mà",
  rùi: "rồi",
  z: "vậy",
  zậy: "vậy",
  bít: "biết",
  hum: "hôm",
  lun: "luôn",
  iu: "yêu",
  thui: "thôi"
};

const VIETNAMESE_COMMON_TYPOS: Record<string, string> = {
  khônng: "không",
  khong: "không",
  đươc: "được",
  duoc: "được",
  mìn: "mình",
  chuyen: "chuyện",
  nhung: "nhưng",
  cung: "cũng",
  nguoi: "người",
  phai: "phải",
  roi: "rồi",
  vay: "vậy"
};

const PLATFORM_SAFE_SPEECH_REWRITES: Array<[string, string]> = [
  ["giết thời gian", "tiêu thời gian"],
  ["giết thì giờ", "tiêu thời gian"],
  ["đe dọa giết", "đe dọa làm hại"],
  ["dọa giết", "dọa làm hại"],
  ["đánh chết", "gây thương tích nghiêm trọng"],
  ["chém chết", "gây thương tích nghiêm trọng"],
  ["giết chết", "làm hại"],
  ["giết", "làm hại"],
  ["tự tử", "tự làm hại bản thân"],
  ["tự sát", "tự làm hại bản thân"],
  ["hiếp dâm", "xâm hại tình dục"],
  ["ma túy", "chất cấm"]
];

const PLATFORM_SAFE_BLEEP_WORDS = [
  "vãi lồn",
  "địt mẹ",
  "đụ mẹ",
  "con đĩ",
  "địt",
  "đụ",
  "đéo",
  "lồn",
  "cặc",
  "buồi",
  "đĩ",
  "vcl",
  "đmm",
  "đm",
  "clm"
];

function replaceStandaloneToken(value: string, token: string, replacement: string) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "giu"), (_match, prefix: string) => `${prefix}${replacement}`);
}

/**
 * Làm dịu nội dung đọc theo các nhóm rủi ro công khai của nền tảng. Hàm này
 * không chèn ký tự ẩn hay cố qua mặt kiểm duyệt: từ tục được đọc thành “bíp”,
 * còn cụm nhạy cảm được đổi sang cách nói trung tính nhưng vẫn giữ ý chính.
 */
export function sanitizePlatformSpeechText(input: string) {
  let output = input;
  for (const [phrase, replacement] of PLATFORM_SAFE_SPEECH_REWRITES) {
    output = replaceStandaloneToken(output, phrase, replacement);
  }
  for (const phrase of PLATFORM_SAFE_BLEEP_WORDS) {
    output = replaceStandaloneToken(output, phrase, "bíp");
  }
  return output.replace(/(?:\bbíp\b[\s,.;!?]*){2,}/giu, "bíp ").trim();
}

export function normalizeSpeechText(input: string) {
  let output = input
    .normalize("NFC")
    .replace(/\[(?:sticker|gif|icon|emoji)\]/giu, " ")
    .replace(/\b(?:sticker|gif)\b/giu, " ")
    .replace(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu, " ")
    .replace(/[\u200B-\u200D\u2060\uFE0E\uFE0F]/g, " ")
    .replace(/(?:=+|:+|;+|x+)[()DdpP]+|<3|\^\^+/giu, " ");
  for (const [token, replacement] of Object.entries(VIETNAMESE_TEENCODE)) {
    output = replaceStandaloneToken(output, token, replacement);
  }
  for (const [token, replacement] of Object.entries(VIETNAMESE_COMMON_TYPOS)) {
    output = replaceStandaloneToken(output, token, replacement);
  }
  return sanitizePlatformSpeechText(output)
    .replace(/={2,}/g, " ")
    .replace(/[()]{3,}/g, " ")
    .replace(/\b(?:ha){3,}\b/giu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, ". ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([,.;!?]){2,}/g, "$1")
    .trim();
}

export function narrationText(comment: Pick<CommentItem, "text" | "speechText">) {
  return normalizeSpeechText(comment.speechText ?? comment.text);
}

export type AttachmentMode = "auto" | "illustration" | "text";
export type AttachmentDetectedType = "illustration" | "text";

export interface AttachmentTextBlock {
  id: string;
  order: number;
  text: string;
  speechText: string;
  box: ConversationBox;
  confidence: number;
  audioPath?: string;
  audioCacheKey?: string;
  audioProcessingVersion?: number;
  audioDuration?: number;
  audioStatus: AudioStatus;
  error?: string;
}

export interface CommentAttachment {
  kind: "image";
  asset: MediaAsset;
  mode: AttachmentMode;
  detectedType: AttachmentDetectedType;
  classificationConfidence: number;
  textBlocks: AttachmentTextBlock[];
  revealStartSeconds?: number;
  voiceStartSeconds?: number;
  audioDuration?: number;
  holdAfterSeconds: number;
  clickEnabled: boolean;
}

export function attachmentContentType(attachment?: CommentAttachment): AttachmentDetectedType | undefined {
  if (!attachment) return undefined;
  return attachment.mode === "auto" ? attachment.detectedType : attachment.mode;
}

export interface CommentSource {
  provider: "threads";
  sourceId: string;
  permalink: string;
  username: string;
  likeCount: number;
}

export type ConversationSpeaker = "a" | "b" | "system";

export interface ConversationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConversationMessage {
  id: string;
  order: number;
  speaker: ConversationSpeaker;
  text: string;
  box: ConversationBox;
  confidence: number;
  voiceId?: string;
  audioPath?: string;
  audioCacheKey?: string;
  audioProcessingVersion?: number;
  audioDuration?: number;
  audioStatus: AudioStatus;
  error?: string;
  revealStartSeconds?: number;
  voiceStartSeconds?: number;
}

export interface ConversationSettings {
  enabled: boolean;
  image: MediaAsset;
  mode: "replace" | "after-comment";
  revealMode: "step" | "scroll";
  speakerAVoiceId: string;
  speakerBVoiceId: string;
  messageGapSeconds: number;
  dingEnabled: boolean;
  dingVolume: number;
  dingLeadSeconds: number;
  dingAssetId?: string;
  ocrLanguage?: string;
  messages: ConversationMessage[];
}

export interface OverlaySettings {
  widthPercent: number;
  xPercent: number;
  topPercent: number;
  maxHeightPercent: number;
}

export interface ExportSettings {
  resolution: "1080x1920" | "720x1280";
  fps: 30;
  encoder: "libx264" | "h264_videotoolbox";
  outputDirectory?: string;
}

export type TikTokPublishMode = "now" | "schedule";

export interface TikTokPublishingSettings {
  enabled: boolean;
  chromeProfileDirectory?: string;
  chromeProfileName?: string;
  caption: string;
  mode: TikTokPublishMode;
  scheduledAt?: string;
}

export interface ChromeProfileInfo {
  directory: string;
  name: string;
}

export type TikTokPublishStatus =
  | "waiting-for-render"
  | "queued"
  | "opening-chrome"
  | "uploading"
  | "configuring"
  | "submitting"
  | "completed"
  | "failed"
  | "cancelled";

export interface TikTokPublishJob {
  id: string;
  projectId: string;
  renderJobId: string;
  status: TikTokPublishStatus;
  progress: number;
  message: string;
  chromeProfileName: string;
  mode: TikTokPublishMode;
  scheduledAt?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TikTokPreflightResult {
  profile: ChromeProfileInfo;
  chromeOpened: boolean;
  appleEventsReady: boolean;
  accessibilityReady: boolean;
  message: string;
}

export interface IllustrationLayoutSettings {
  widthPercent: number;
  heightPercent: number;
  xPercent: number;
  topPercent: number;
  gapPercent: number;
  fit: "cover" | "contain";
}

export interface IllustrationSettings {
  enabled: boolean;
  randomSeed: number;
  mode: "per-comment" | "multi";
  timingMode: "fixed" | "source-duration";
  intervalSeconds: number;
  videos: IllustrationVideoAsset[];
  segments: BrollSegment[];
  layout: IllustrationLayoutSettings;
}

export interface BrollSegment {
  id: string;
  commentId: string;
  videoAssetId: string;
  startSeconds: number;
  durationSeconds: number;
  sourceStartSeconds: number;
  locked: boolean;
}

export interface SmartLayoutSettings {
  enabled: boolean;
  mode: "auto" | "manual";
  gapPixels: number;
  safeTopPercent: number;
  safeBottomPercent: number;
}

export interface MusicSettings {
  enabled: boolean;
  asset?: MediaAsset;
  duration?: number;
  volume: number;
  ducking: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface SoundEffectAsset extends MediaAsset {
  id: string;
  provider: "myinstants";
  title: string;
  sourcePageUrl: string;
  duration: number;
}

export interface SoundEffectEvent {
  id: string;
  commentId: string;
  assetId: string;
  offsetSeconds: number;
  volume: number;
  locked: boolean;
  query: string;
  reason: string;
}

export interface SoundEffectSettings {
  enabled: boolean;
  volume: number;
  assets: SoundEffectAsset[];
  events: SoundEffectEvent[];
  appearance: CommentAppearanceSoundSettings;
}

export interface CommentAppearanceSoundSettings {
  enabled: boolean;
  volume: number;
  leadSeconds: number;
  introAssetId?: string;
  nextAssetId?: string;
}

export function resolveCommentAppearanceAssetId(
  comments: Pick<CommentItem, "id" | "order" | "conversation">[],
  commentId: string | undefined,
  appearance: Pick<CommentAppearanceSoundSettings, "introAssetId" | "nextAssetId">
): string | undefined {
  if (!commentId) return undefined;
  const ordered = comments.slice().sort((left, right) => left.order - right.order);
  const index = ordered.findIndex((comment) => comment.id === commentId);
  if (index < 0 || ordered[index]?.conversation?.enabled) return undefined;
  return index === 0 ? appearance.introAssetId : appearance.nextAssetId;
}

export interface ThreadsMediaCandidate {
  url: string;
  type: "image";
  alt?: string;
}

export interface ThreadsCommentCandidate {
  id: string;
  parentId?: string;
  depth: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  text: string;
  permalink: string;
  timestampLabel?: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  media: ThreadsMediaCandidate[];
  score: number;
  reasons: string[];
  suggested: boolean;
}

export interface ThreadsAnalysis {
  sourceUrl: string;
  post: ThreadsCommentCandidate;
  comments: ThreadsCommentCandidate[];
  fetchedAt: string;
  warning?: string;
}

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  opacity: number;
  xPercent: number;
  yPercent: number;
  fontSize: number;
}

export interface ChannelLogoSettings {
  enabled: boolean;
  asset?: MediaAsset;
  opacity: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
}

export interface BrandingSettings {
  watermark: WatermarkSettings;
  logo: ChannelLogoSettings;
}

export interface ProjectSettings {
  defaultProvider: TtsProviderId;
  defaultVoiceId: string;
  defaultRate: number;
  defaultPitch: number;
  defaultPauseAfter: number;
  smartLayout: SmartLayoutSettings;
  overlay: OverlaySettings;
  export: ExportSettings;
  tiktok: TikTokPublishingSettings;
}

export interface ProjectData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  background?: MediaAsset;
  comments: CommentItem[];
  settings: ProjectSettings;
  illustrations: IllustrationSettings;
  music: MusicSettings;
  soundEffects: SoundEffectSettings;
  branding: BrandingSettings;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  commentCount: number;
  hasBackground: boolean;
}

export interface ProjectEnvelope {
  project: ProjectData;
  missingFiles: string[];
}

export interface TimelineSegment {
  commentId: string;
  order: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  startSeconds: number;
  endSeconds: number;
  audioDuration: number;
  pauseAfter: number;
}

export interface Timeline {
  fps: number;
  durationFrames: number;
  durationSeconds: number;
  segments: TimelineSegment[];
}

export interface RenderJob {
  id: string;
  projectId: string;
  status: RenderStatus;
  progress: number;
  outputPath?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
  locale: string;
  gender?: string;
  provider: TtsProviderId;
}

export interface TtsProviderInfo {
  id: TtsProviderId;
  name: string;
  available: boolean;
  configured: boolean;
  online: boolean;
  supportsPitch: boolean;
  notice: string;
  error?: string;
}

export const defaultProjectSettings: ProjectSettings = {
  defaultProvider: "edge",
  defaultVoiceId: "vi-VN-HoaiMyNeural",
  defaultRate: 1.2,
  defaultPitch: 0,
  defaultPauseAfter: 0.1,
  smartLayout: {
    enabled: true,
    mode: "auto",
    gapPixels: 40,
    safeTopPercent: 8,
    safeBottomPercent: 12
  },
  overlay: {
    widthPercent: 85,
    xPercent: 50,
    topPercent: 13,
    maxHeightPercent: 58
  },
  export: {
    resolution: "1080x1920",
    fps: 30,
    encoder: "libx264"
  },
  tiktok: {
    enabled: false,
    caption: "",
    mode: "now"
  }
};

export function createDefaultIllustrationSettings(): IllustrationSettings {
  return {
    enabled: false,
    randomSeed: 0x6d2b79f5,
    mode: "multi",
    timingMode: "fixed",
    intervalSeconds: 4,
    videos: [],
    segments: [],
    layout: {
      widthPercent: 90,
      heightPercent: 30,
      xPercent: 50,
      topPercent: 58,
      gapPercent: 3,
      fit: "cover"
    }
  };
}

export function createDefaultMusicSettings(): MusicSettings {
  return {
    enabled: false,
    volume: 0.1,
    ducking: true,
    fadeIn: 0.5,
    fadeOut: 1.5
  };
}

export function createDefaultSoundEffectSettings(): SoundEffectSettings {
  return {
    enabled: true,
    volume: 0.2,
    assets: [],
    events: [],
    appearance: {
      enabled: true,
      volume: 0.35,
      leadSeconds: 0.08
    }
  };
}

export function createDefaultBrandingSettings(): BrandingSettings {
  return {
    watermark: {
      enabled: false,
      text: "",
      opacity: 0.35,
      xPercent: 50,
      yPercent: 92,
      fontSize: 42
    },
    logo: {
      enabled: false,
      opacity: 0.9,
      xPercent: 88,
      yPercent: 12,
      widthPercent: 16
    }
  };
}

export function migrateProjectData(project: ProjectData): ProjectData {
  const input = project as ProjectData & {
    illustrations?: Partial<IllustrationSettings> & { layout?: Partial<IllustrationLayoutSettings> };
    music?: Partial<MusicSettings>;
    soundEffects?: Partial<SoundEffectSettings>;
    branding?: Partial<BrandingSettings> & {
      watermark?: Partial<WatermarkSettings>;
      logo?: Partial<ChannelLogoSettings>;
    };
  };
  const illustrationDefaults = createDefaultIllustrationSettings();
  const musicDefaults = createDefaultMusicSettings();
  const soundEffectDefaults = createDefaultSoundEffectSettings();
  const brandingDefaults = createDefaultBrandingSettings();
  const incomingSettings = input.settings as ProjectSettings & {
    smartLayout?: Partial<SmartLayoutSettings>;
    tiktok?: Partial<TikTokPublishingSettings>;
  };
  const hasStoredSmartLayout = Boolean(incomingSettings?.smartLayout);
  const migratedMode = (input.illustrations as { mode?: string } | undefined)?.mode === "interval"
    ? "multi"
    : input.illustrations?.mode;
  const commentIds = new Set((input.comments ?? []).map((comment) => comment.id));
  const migratedComments: CommentItem[] = (input.comments ?? []).map((comment, index): CommentItem => ({
    ...comment,
    speechText: comment.speechText ?? normalizeSpeechText(comment.text),
    order: Number.isFinite(comment.order) ? comment.order : index + 1,
    rate: Number.isFinite(comment.rate) ? comment.rate : 1,
    pitch: Number.isFinite(comment.pitch) ? comment.pitch : 0,
    pauseAfter: Number.isFinite(comment.pauseAfter)
      ? comment.pauseAfter
      : defaultProjectSettings.defaultPauseAfter,
    illustrationLocked: comment.illustrationLocked ?? false,
    attachment: comment.attachment
      ? {
          ...comment.attachment,
          mode: comment.attachment.mode ?? "auto",
          detectedType: comment.attachment.detectedType ?? "illustration",
          classificationConfidence: Number.isFinite(comment.attachment.classificationConfidence)
            ? comment.attachment.classificationConfidence
            : 0,
          textBlocks: (comment.attachment.textBlocks ?? []).map((block, blockIndex) => ({
            ...block,
            order: Number.isFinite(block.order) ? block.order : blockIndex + 1,
            speechText: block.speechText ?? normalizeSpeechText(block.text),
            confidence: Number.isFinite(block.confidence) ? block.confidence : 1,
            audioStatus: block.audioStatus ?? "missing"
          })),
          holdAfterSeconds: Number.isFinite(comment.attachment.holdAfterSeconds)
            ? comment.attachment.holdAfterSeconds
            : 2,
          clickEnabled: comment.attachment.clickEnabled ?? true
        }
      : undefined,
    parentCommentId: comment.parentCommentId && comment.parentCommentId !== comment.id && commentIds.has(comment.parentCommentId)
      ? comment.parentCommentId
      : undefined,
    conversation: comment.conversation
      ? {
          ...comment.conversation,
          enabled: comment.conversation.enabled ?? true,
          mode: comment.conversation.mode ?? "replace",
          revealMode: comment.conversation.revealMode ?? "scroll",
          speakerAVoiceId: comment.conversation.speakerAVoiceId || "vi-VN-HoaiMyNeural",
          speakerBVoiceId: comment.conversation.speakerBVoiceId || "vi-VN-NamMinhNeural",
          messageGapSeconds: Number.isFinite(comment.conversation.messageGapSeconds) ? comment.conversation.messageGapSeconds : 0.08,
          dingEnabled: comment.conversation.dingEnabled ?? true,
          dingVolume: Number.isFinite(comment.conversation.dingVolume) ? comment.conversation.dingVolume : 0.25,
          dingLeadSeconds: Number.isFinite(comment.conversation.dingLeadSeconds) ? comment.conversation.dingLeadSeconds : 0.1,
          messages: (comment.conversation.messages ?? []).map((message, messageIndex) => ({
            ...message,
            order: Number.isFinite(message.order) ? message.order : messageIndex + 1,
            confidence: Number.isFinite(message.confidence) ? message.confidence : 1,
            audioStatus: message.audioStatus ?? "missing"
          }))
        }
      : undefined
  }));

  return {
    ...input,
    settings: {
      ...defaultProjectSettings,
      ...input.settings,
      smartLayout: hasStoredSmartLayout
        ? { ...defaultProjectSettings.smartLayout, ...incomingSettings.smartLayout }
        : { ...defaultProjectSettings.smartLayout, enabled: false, mode: "manual" },
      overlay: { ...defaultProjectSettings.overlay, ...input.settings?.overlay },
      export: { ...defaultProjectSettings.export, ...input.settings?.export },
      tiktok: { ...defaultProjectSettings.tiktok, ...incomingSettings?.tiktok }
    },
    comments: migratedComments,
    illustrations: {
      ...illustrationDefaults,
      ...input.illustrations,
      mode: migratedMode ?? illustrationDefaults.mode,
      videos: input.illustrations?.videos ?? [],
      segments: input.illustrations?.segments ?? [],
      layout: {
        ...illustrationDefaults.layout,
        ...input.illustrations?.layout
      }
    },
    music: {
      ...musicDefaults,
      ...input.music
    },
    soundEffects: {
      ...soundEffectDefaults,
      ...input.soundEffects,
      assets: input.soundEffects?.assets ?? [],
      events: (input.soundEffects?.events ?? []).filter((event) => commentIds.has(event.commentId)),
      appearance: {
        ...soundEffectDefaults.appearance,
        ...input.soundEffects?.appearance
      }
    },
    branding: {
      ...brandingDefaults,
      ...input.branding,
      watermark: {
        ...brandingDefaults.watermark,
        ...input.branding?.watermark
      },
      logo: {
        ...brandingDefaults.logo,
        ...input.branding?.logo
      }
    }
  };
}

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartLayoutResult {
  comment: LayoutRect;
  broll?: LayoutRect;
  gap: number;
  safeTop: number;
  safeBottom: number;
  commentScaleWarning: boolean;
}

export interface ThreadedSmartLayoutResult {
  parent: LayoutRect;
  reply: LayoutRect;
  broll?: LayoutRect;
  gap: number;
  safeTop: number;
  safeBottom: number;
  commentScaleWarning: boolean;
}

export function calculateSmartLayout(
  canvasWidth: number,
  canvasHeight: number,
  commentImageWidth: number,
  commentImageHeight: number,
  brollAspectRatio: number,
  settings: SmartLayoutSettings,
  commentWidthPercent = 90,
  brollWidthPercent = 90,
  hasBroll = true
): SmartLayoutResult {
  const safeTop = canvasHeight * settings.safeTopPercent / 100;
  const safeBottom = canvasHeight * settings.safeBottomPercent / 100;
  const safeHeight = Math.max(1, canvasHeight - safeTop - safeBottom);
  const imageWidth = Math.max(1, commentImageWidth);
  const imageHeight = Math.max(1, commentImageHeight);
  const maxCommentWidth = canvasWidth * commentWidthPercent / 100;
  let commentWidth = maxCommentWidth;
  let commentHeight = commentWidth * imageHeight / imageWidth;

  if (!hasBroll) {
    if (commentHeight > safeHeight) {
      const scale = safeHeight / commentHeight;
      commentWidth *= scale;
      commentHeight = safeHeight;
    }
    return {
      comment: { x: (canvasWidth - commentWidth) / 2, y: safeTop + (safeHeight - commentHeight) / 2, width: commentWidth, height: commentHeight },
      gap: 0,
      safeTop,
      safeBottom,
      commentScaleWarning: commentWidth < maxCommentWidth * 0.68
    };
  }

  const desiredGap = settings.gapPixels * canvasWidth / 1080;
  let gap = desiredGap;
  const maxBrollWidth = canvasWidth * brollWidthPercent / 100;
  const safeAspect = Number.isFinite(brollAspectRatio) && brollAspectRatio > 0 ? brollAspectRatio : 16 / 9;
  let brollWidth = maxBrollWidth;
  let brollHeight = brollWidth / safeAspect;
  const minBrollHeight = canvasHeight * 0.15;

  if (commentHeight + gap + brollHeight > safeHeight) {
    brollHeight = Math.max(minBrollHeight, safeHeight - commentHeight - gap);
    brollWidth = Math.min(maxBrollWidth, brollHeight * safeAspect);
  }
  if (commentHeight + gap + brollHeight > safeHeight) {
    commentHeight = Math.max(1, safeHeight - gap - brollHeight);
    commentWidth = Math.min(maxCommentWidth, commentHeight * imageWidth / imageHeight);
  }
  if (commentHeight + gap + brollHeight > safeHeight) {
    gap = Math.max(0, safeHeight - commentHeight - brollHeight);
  }

  const totalHeight = commentHeight + gap + brollHeight;
  const groupY = safeTop + Math.max(0, (safeHeight - totalHeight) / 2);
  return {
    comment: { x: (canvasWidth - commentWidth) / 2, y: groupY, width: commentWidth, height: commentHeight },
    broll: { x: (canvasWidth - brollWidth) / 2, y: groupY + commentHeight + gap, width: brollWidth, height: brollHeight },
    gap,
    safeTop,
    safeBottom,
    commentScaleWarning: commentWidth < maxCommentWidth * 0.68
  };
}

export function calculateThreadedSmartLayout(
  canvasWidth: number,
  canvasHeight: number,
  parentImageWidth: number,
  parentImageHeight: number,
  replyImageWidth: number,
  replyImageHeight: number,
  brollAspectRatio: number,
  settings: SmartLayoutSettings,
  commentWidthPercent = 90,
  brollWidthPercent = 90,
  hasBroll = true
): ThreadedSmartLayoutResult {
  const safeTop = canvasHeight * settings.safeTopPercent / 100;
  const safeBottom = canvasHeight * settings.safeBottomPercent / 100;
  const safeHeight = Math.max(1, canvasHeight - safeTop - safeBottom);
  const maxCommentWidth = canvasWidth * commentWidthPercent / 100;
  const desiredGap = settings.gapPixels * canvasWidth / 1080;
  const gapCount = hasBroll ? 2 : 1;
  const gap = Math.min(desiredGap, safeHeight / 10);

  const parentRatio = Math.max(1, parentImageHeight) / Math.max(1, parentImageWidth);
  const replyRatio = Math.max(1, replyImageHeight) / Math.max(1, replyImageWidth);
  let parentWidth = maxCommentWidth;
  let parentHeight = parentWidth * parentRatio;
  let replyWidth = maxCommentWidth;
  let replyHeight = replyWidth * replyRatio;
  const safeBrollAspect = Number.isFinite(brollAspectRatio) && brollAspectRatio > 0 ? brollAspectRatio : 16 / 9;
  let brollWidth = hasBroll ? canvasWidth * brollWidthPercent / 100 : 0;
  let brollHeight = hasBroll ? brollWidth / safeBrollAspect : 0;

  const mediaHeight = parentHeight + replyHeight + brollHeight;
  const availableMediaHeight = Math.max(1, safeHeight - gap * gapCount);
  const scale = Math.min(1, availableMediaHeight / Math.max(1, mediaHeight));
  parentWidth *= scale;
  parentHeight *= scale;
  replyWidth *= scale;
  replyHeight *= scale;
  brollWidth *= scale;
  brollHeight *= scale;

  const totalHeight = parentHeight + replyHeight + brollHeight + gap * gapCount;
  let cursorY = safeTop + Math.max(0, (safeHeight - totalHeight) / 2);
  const parent = { x: (canvasWidth - parentWidth) / 2, y: cursorY, width: parentWidth, height: parentHeight };
  cursorY += parentHeight + gap;
  const reply = { x: (canvasWidth - replyWidth) / 2, y: cursorY, width: replyWidth, height: replyHeight };
  cursorY += replyHeight + (hasBroll ? gap : 0);

  return {
    parent,
    reply,
    ...(hasBroll ? { broll: { x: (canvasWidth - brollWidth) / 2, y: cursorY, width: brollWidth, height: brollHeight } } : {}),
    gap,
    safeTop,
    safeBottom,
    commentScaleWarning: parentWidth < maxCommentWidth * 0.68 || replyWidth < maxCommentWidth * 0.68
  };
}

export function buildCommentLabels(comments: CommentItem[]): Map<string, string> {
  const sorted = comments.slice().sort((left, right) => left.order - right.order);
  const labels = new Map<string, string>();
  const parentNumbers = new Map<string, number>();
  let parentNumber = 0;
  for (const comment of sorted) {
    if (!comment.parentCommentId) {
      parentNumber += 1;
      parentNumbers.set(comment.id, parentNumber);
      labels.set(comment.id, String(parentNumber));
      continue;
    }
    const rootNumber = parentNumbers.get(comment.parentCommentId);
    if (!rootNumber) {
      parentNumber += 1;
      parentNumbers.set(comment.id, parentNumber);
      labels.set(comment.id, String(parentNumber));
      continue;
    }
    const siblingIndex = sorted
      .filter((candidate) => candidate.parentCommentId === comment.parentCommentId && candidate.order <= comment.order)
      .length;
    labels.set(comment.id, `${rootNumber}.${siblingIndex}`);
  }
  return labels;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledVideoIds(videoIds: string[], random: () => number): string[] {
  const result = [...videoIds];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export interface SyncBrollOptions {
  seed?: number;
  randomizeAll?: boolean;
  randomizeCommentId?: string;
}

export const MAX_BROLL_VARIETY_TARGET = 80;
export const MIN_BROLL_INTERVAL_SECONDS = 2;
export const MAX_BROLL_INTERVAL_SECONDS = 10;

function countBrollSegments(project: ProjectData, intervalSeconds: number): number {
  const fps = project.settings.export.fps;
  const intervalFrames = Math.max(1, Math.round(intervalSeconds * fps));
  return project.comments.reduce((total, comment) => {
    if (!comment.audioDuration || comment.audioDuration <= 0) return total;
    const durationFrames = Math.max(1, Math.ceil((comment.audioDuration + comment.pauseAfter) * fps - 1e-9));
    return total + Math.ceil(durationFrames / intervalFrames);
  }, 0);
}

export function syncBrollSegments(project: ProjectData, options: SyncBrollOptions = {}): ProjectData {
  const migrated = migrateProjectData(project);
  const videos = migrated.illustrations.videos;
  const seed = (options.seed ?? migrated.illustrations.randomSeed) >>> 0;
  if (!videos.length) {
    return { ...migrated, illustrations: { ...migrated.illustrations, randomSeed: seed, segments: [] } };
  }

  const fps = migrated.settings.export.fps;
  const intervalFrames = Math.max(1, Math.round(migrated.illustrations.intervalSeconds * fps));
  const existingByKey = new Map<string, BrollSegment>();
  const existingGrouped = new Map<string, BrollSegment[]>();
  for (const segment of migrated.illustrations.segments) {
    const list = existingGrouped.get(segment.commentId) ?? [];
    list.push(segment);
    existingGrouped.set(segment.commentId, list);
  }
  for (const [commentId, segments] of existingGrouped) {
    segments.sort((left, right) => left.startSeconds - right.startSeconds);
    segments.forEach((segment, index) => existingByKey.set(`${commentId}:${index}`, segment));
  }

  const random = createSeededRandom(seed);
  const videoIds = videos.map((video) => video.id);
  const videosById = new Map(videos.map((video) => [video.id, video]));
  let bag: string[] = [];
  let previousVideoId: string | undefined;
  const usedInCycle = new Set<string>();
  const takeNext = () => {
    const unusedIds = videoIds.filter((id) => !usedInCycle.has(id));
    if (unusedIds.length) {
      bag = bag.filter((id) => !usedInCycle.has(id));
      if (!bag.length) bag = shuffledVideoIds(unusedIds, random);
    } else {
      usedInCycle.clear();
      bag = shuffledVideoIds(videoIds, random);
    }
    if (bag.length > 1 && bag[0] === previousVideoId) {
      const nextDifferent = bag.findIndex((id) => id !== previousVideoId);
      if (nextDifferent > 0) [bag[0], bag[nextDifferent]] = [bag[nextDifferent]!, bag[0]!];
    }
    const next = bag.shift()!;
    usedInCycle.add(next);
    return next;
  };

  let timelineCursorFrame = 0;
  let sourceContinuation: { videoAssetId: string; sourceStartSeconds: number } | undefined;
  const nextSegments: BrollSegment[] = [];
  const sortedComments = migrated.comments.slice().sort((left, right) => left.order - right.order);
  for (const comment of sortedComments) {
    if (!comment.audioDuration || comment.audioDuration <= 0) {
      const preserved = existingGrouped.get(comment.id) ?? [];
      nextSegments.push(...preserved);
      if (preserved.length) {
        timelineCursorFrame = Math.max(timelineCursorFrame, Math.round(Math.max(...preserved.map((segment) => segment.startSeconds + segment.durationSeconds)) * fps));
      }
      continue;
    }
    const durationFrames = Math.max(1, Math.ceil((comment.audioDuration + comment.pauseAfter) * fps - 1e-9));
    let relativeStartFrame = 0;
    let index = 0;
    while (relativeStartFrame < durationFrames) {
      const existing = existingByKey.get(`${comment.id}:${index}`);
      const randomizeThis = options.randomizeAll || options.randomizeCommentId === comment.id;
      const mayKeep = existing
        && videosById.has(existing.videoAssetId)
        && (existing.locked || !randomizeThis);
      const preferredLegacyId = index === 0 && videosById.has(comment.illustrationVideoId ?? "")
        ? comment.illustrationVideoId
        : undefined;
      const legacyLocked = Boolean(index === 0 && comment.illustrationLocked && preferredLegacyId);
      const useContinuation = migrated.illustrations.mode === "multi"
        && migrated.illustrations.timingMode === "source-duration"
        && sourceContinuation
        && !existing?.locked;
      const videoAssetId = useContinuation
        ? sourceContinuation!.videoAssetId
        : mayKeep
          ? existing.videoAssetId
          : preferredLegacyId && (!randomizeThis || legacyLocked)
            ? preferredLegacyId
            : takeNext();
      if (mayKeep || legacyLocked) usedInCycle.add(videoAssetId);
      const video = videosById.get(videoAssetId)!;
      const sourceDurationTiming = migrated.illustrations.mode === "multi" && migrated.illustrations.timingMode === "source-duration";
      let sourceStartSeconds: number;
      let segmentFrames: number;
      if (sourceDurationTiming) {
        sourceStartSeconds = useContinuation
          ? sourceContinuation!.sourceStartSeconds
          : existing?.locked
            ? Math.max(0, Math.min(video.duration, existing.sourceStartSeconds))
            : legacyLocked
              ? Math.max(0, Math.min(video.duration, comment.illustrationStartSeconds ?? 0))
              : 0;
        const availableSourceFrames = Math.max(1, Math.round(Math.max(0, video.duration - sourceStartSeconds) * fps));
        segmentFrames = Math.min(durationFrames - relativeStartFrame, availableSourceFrames);
      } else {
        segmentFrames = migrated.illustrations.mode === "multi"
          ? Math.min(intervalFrames, durationFrames - relativeStartFrame)
          : durationFrames;
        const durationSeconds = segmentFrames / fps;
        const maxSourceStart = Math.max(0, video.duration - durationSeconds);
        sourceStartSeconds = mayKeep
          ? Math.min(maxSourceStart, Math.max(0, existing.sourceStartSeconds))
          : preferredLegacyId && index === 0 && (!randomizeThis || legacyLocked)
            ? Math.min(maxSourceStart, Math.max(0, comment.illustrationStartSeconds ?? 0))
            : maxSourceStart > 0 ? random() * maxSourceStart : 0;
      }
      const durationSeconds = segmentFrames / fps;
      const startSeconds = (timelineCursorFrame + relativeStartFrame) / fps;
      nextSegments.push({
        id: mayKeep && !useContinuation ? existing.id : `${comment.id}-${index}-${seed.toString(16)}`,
        commentId: comment.id,
        videoAssetId,
        startSeconds,
        durationSeconds,
        sourceStartSeconds,
        locked: mayKeep ? existing.locked : legacyLocked
      });
      previousVideoId = videoAssetId;
      relativeStartFrame += segmentFrames;
      index += 1;
      if (sourceDurationTiming) {
        const nextSourceStart = sourceStartSeconds + durationSeconds;
        sourceContinuation = nextSourceStart < video.duration - 1 / fps
          ? { videoAssetId, sourceStartSeconds: nextSourceStart }
          : undefined;
      } else {
        sourceContinuation = undefined;
      }
      if (migrated.illustrations.mode !== "multi") break;
    }
    timelineCursorFrame += durationFrames;
  }

  return {
    ...migrated,
    comments: migrated.comments.map((comment) => {
      const first = nextSegments.find((segment) => segment.commentId === comment.id);
      return first ? {
        ...comment,
        illustrationVideoId: first.videoAssetId,
        illustrationStartSeconds: first.sourceStartSeconds,
        illustrationLocked: first.locked
      } : comment;
    }),
    illustrations: { ...migrated.illustrations, randomSeed: seed, segments: nextSegments }
  };
}

export interface MaximizeBrollVarietyOptions {
  seed?: number;
  maxUniqueVideos?: number;
}

/**
 * Chọn nhịp cắt chậm nhất vẫn dùng được nhiều video khác nhau nhất có thể.
 * Toàn bộ thư viện vẫn được giữ trong project; ngưỡng chỉ áp dụng cho mục tiêu
 * số video khác nhau để tránh ép timeline tạo hàng trăm đoạn FFmpeg quá ngắn.
 */
export function maximizeBrollVariety(
  project: ProjectData,
  options: MaximizeBrollVarietyOptions = {}
): ProjectData {
  const migrated = migrateProjectData(project);
  if (!migrated.illustrations.videos.length) return migrated;

  const maxUniqueVideos = Math.max(1, Math.floor(options.maxUniqueVideos ?? MAX_BROLL_VARIETY_TARGET));
  const targetUniqueVideos = Math.min(migrated.illustrations.videos.length, maxUniqueVideos);
  const hasTimedComments = countBrollSegments(migrated, MIN_BROLL_INTERVAL_SECONDS) > 0;
  let intervalSeconds = migrated.illustrations.intervalSeconds;
  if (hasTimedComments && migrated.illustrations.timingMode === "fixed") {
    intervalSeconds = MIN_BROLL_INTERVAL_SECONDS;
    for (
      let candidate = MAX_BROLL_INTERVAL_SECONDS;
      candidate >= MIN_BROLL_INTERVAL_SECONDS;
      candidate -= 0.5
    ) {
      if (countBrollSegments(migrated, candidate) >= targetUniqueVideos) {
        intervalSeconds = candidate;
        break;
      }
    }
  }

  const prepared: ProjectData = {
    ...migrated,
    illustrations: {
      ...migrated.illustrations,
      enabled: true,
      mode: "multi",
      intervalSeconds
    }
  };
  return syncBrollSegments(prepared, {
    seed: (options.seed ?? prepared.illustrations.randomSeed + 1) >>> 0,
    randomizeAll: true
  });
}

export function assignIllustrationVideos(project: ProjectData, seed: number): ProjectData {
  const migrated = migrateProjectData(project);
  migrated.illustrations.mode = "per-comment";
  return syncBrollSegments(migrated, { seed, randomizeAll: true });
}

export interface VoiceSettingsSelection {
  rate: boolean;
  pitch: boolean;
  pauseAfter: boolean;
}

export function applyVoiceToAll(
  project: ProjectData,
  providerId: TtsProviderId,
  voiceId: string
): ProjectData {
  const migrated = migrateProjectData(project);
  migrated.settings.defaultProvider = providerId;
  migrated.settings.defaultVoiceId = voiceId;
  migrated.comments = migrated.comments.map((comment) => {
    const conversation = comment.conversation
      ? {
        ...comment.conversation,
        speakerAVoiceId: voiceId,
        speakerBVoiceId: voiceId,
        messages: comment.conversation.messages.map((message) => ({
          ...message,
          voiceId,
          audioStatus: normalizeSpeechText(message.text) ? "stale" as const : "missing" as const,
          audioDuration: undefined,
          audioCacheKey: undefined,
          error: undefined
        }))
      }
      : undefined;
    const attachment = comment.attachment
      ? {
        ...comment.attachment,
        textBlocks: comment.attachment.textBlocks.map((block) => ({
          ...block,
          audioStatus: normalizeSpeechText(block.speechText || block.text) ? "stale" as const : "missing" as const,
          audioDuration: undefined,
          audioCacheKey: undefined,
          error: undefined
        }))
      }
      : undefined;
    const hasNarration = Boolean(
      narrationText(comment)
      || conversation?.messages.some((message) => normalizeSpeechText(message.text))
      || attachment?.textBlocks.some((block) => normalizeSpeechText(block.speechText || block.text))
    );
    return {
      ...comment,
      provider: providerId,
      voiceId,
      audioStatus: hasNarration ? "stale" as const : "missing" as const,
      audioDuration: undefined,
      audioCacheKey: undefined,
      error: undefined,
      conversation,
      attachment
    };
  });
  return syncBrollSegments(migrated);
}

export function applyVoiceSettingsToAll(
  project: ProjectData,
  values: { rate: number; pitch: number; pauseAfter: number },
  selection: VoiceSettingsSelection,
  supportsPitch: (provider: TtsProviderId) => boolean = () => true
): ProjectData {
  const migrated = migrateProjectData(project);
  if (selection.rate) migrated.settings.defaultRate = values.rate;
  if (selection.pitch) migrated.settings.defaultPitch = values.pitch;
  if (selection.pauseAfter) migrated.settings.defaultPauseAfter = values.pauseAfter;
  migrated.comments = migrated.comments.map((comment) => {
    const provider = comment.provider ?? migrated.settings.defaultProvider;
    const nextRate = selection.rate ? values.rate : comment.rate;
    const nextPitch = selection.pitch && supportsPitch(provider) ? values.pitch : comment.pitch;
    const ttsChanged = nextRate !== comment.rate || nextPitch !== comment.pitch;
    return {
      ...comment,
      rate: nextRate,
      pitch: nextPitch,
      pauseAfter: selection.pauseAfter ? values.pauseAfter : comment.pauseAfter,
      ...(ttsChanged ? {
        audioStatus: comment.text.trim() ? "stale" as const : "missing" as const,
        audioDuration: undefined,
        audioCacheKey: undefined,
        error: undefined
      } : {})
    };
  });
  return syncBrollSegments(migrated);
}

export function mediaUrl(projectId: string, relativePath?: string): string | undefined {
  if (!relativePath) return undefined;
  return `/media/projects/${encodeURIComponent(projectId)}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

export interface ConversationViewport {
  top: number;
  bottom: number;
}

export function conversationViewport(messages: ConversationMessage[], activeMessageId: string, maxVisibleRatio = 0.62): ConversationViewport {
  const ordered = messages.slice().sort((left, right) => left.order - right.order);
  const activeIndex = Math.max(0, ordered.findIndex((message) => message.id === activeMessageId));
  const active = ordered[activeIndex];
  if (!active) return { top: 0, bottom: 1 };
  const bottom = Math.min(1, Math.max(0.08, active.box.y + active.box.height + 0.025));
  const top = Math.max(0, bottom - Math.max(0.2, Math.min(1, maxVisibleRatio)));
  return { top, bottom };
}

export function activeConversationMessage(comment: CommentItem, localSeconds: number): ConversationMessage | undefined {
  const messages = comment.conversation?.messages
    .filter((message) => message.revealStartSeconds !== undefined)
    .slice()
    .sort((left, right) => (left.revealStartSeconds ?? 0) - (right.revealStartSeconds ?? 0));
  if (!messages?.length) return undefined;
  return messages.findLast((message) => localSeconds >= (message.revealStartSeconds ?? Number.POSITIVE_INFINITY));
}

export function buildTimeline(comments: CommentItem[], fps = 30): Timeline {
  let cursor = 0;
  const segments = [...comments]
    .sort((left, right) => left.order - right.order)
    .map((comment) => {
      if (!comment.audioDuration || comment.audioDuration <= 0) {
        throw new Error(`Comment ${comment.id} chưa có thời lượng audio hợp lệ.`);
      }
      const attachmentHold = comment.attachment ? Math.max(0, comment.attachment.holdAfterSeconds) : 0;
      const rawFrames = (comment.audioDuration + attachmentHold + comment.pauseAfter) * fps;
      const durationFrames = Math.max(1, Math.ceil(rawFrames - 1e-9));
      const startFrame = cursor;
      const endFrame = startFrame + durationFrames;
      cursor = endFrame;
      return {
        commentId: comment.id,
        order: comment.order,
        startFrame,
        endFrame,
        durationFrames,
        startSeconds: startFrame / fps,
        endSeconds: endFrame / fps,
        audioDuration: comment.audioDuration,
        pauseAfter: comment.pauseAfter
      };
    });

  return {
    fps,
    durationFrames: cursor,
    durationSeconds: cursor / fps,
    segments
  };
}
