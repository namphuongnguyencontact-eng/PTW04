import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  applyVoiceToAll,
  applyVoiceSettingsToAll,
  activeConversationMessage,
  buildCommentLabels,
  buildTimeline,
  calculateSmartLayout,
  calculateThreadedSmartLayout,
  conversationViewport,
  attachmentContentType,
  mediaUrl,
  normalizeSpeechText,
  resolveCommentAppearanceAssetId,
  syncBrollSegments,
  type ChromeProfileInfo,
  type CommentItem,
  type ProjectData,
  type ProjectEnvelope,
  type ProjectSummary,
  type RenderJob,
  type ThreadsAnalysis,
  type TikTokPreflightResult,
  type TikTokPublishJob,
  type TtsProviderId,
  type TtsProviderInfo,
  type VoiceInfo
} from "@comment-video-studio/shared";
import { schedulePreviewOneShot } from "./preview-audio.js";
import {
  AutoWorkspaceSummary,
  ThreadsAutoImportPanel,
  WorkspaceNavigation,
  type StudioWorkspace
} from "./WorkspaceNavigation.js";

const statusText = {
  missing: "Chưa có audio",
  stale: "Cần tạo lại",
  generating: "Đang tạo…",
  ready: "Sẵn sàng",
  error: "Có lỗi"
} as const;

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Yêu cầu thất bại (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function fetchTikTokPreflight(profileDirectory: string, signal?: AbortSignal) {
  return api<TikTokPreflightResult>("/api/tiktok/preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileDirectory }),
    signal
  });
}

function formatTime(value?: number) {
  if (value === undefined) return "—";
  const minutes = Math.floor(value / 60);
  return `${minutes}:${(value % 60).toFixed(1).padStart(4, "0")}`;
}

function activeProvider(project: ProjectData, comment?: CommentItem) {
  return comment?.provider ?? project.settings.defaultProvider;
}

function activeVoice(project: ProjectData, comment?: CommentItem) {
  return comment?.voiceId ?? project.settings.defaultVoiceId;
}

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectData>();
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voicesProvider, setVoicesProvider] = useState<TtsProviderId>();
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState("");
  const [voiceRefreshKey, setVoiceRefreshKey] = useState(0);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [tiktokJobs, setTikTokJobs] = useState<TikTokPublishJob[]>([]);
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfileInfo[]>([]);
  const [tiktokPreflight, setTikTokPreflight] = useState<TikTokPreflightResult>();
  const [tiktokChecking, setTikTokChecking] = useState(false);
  const [showExportConfirmation, setShowExportConfirmation] = useState(false);
  const [message, setMessage] = useState("Sẵn sàng");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [showProjects, setShowProjects] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elevenKey, setElevenKey] = useState("");
  const [showBatchVoice, setShowBatchVoice] = useState(false);
  const [batchFields, setBatchFields] = useState({ rate: true, pitch: true, pauseAfter: true });
  const [threadsUrl, setThreadsUrl] = useState("");
  const [threadsAnalysisId, setThreadsAnalysisId] = useState("");
  const [threadsAnalysis, setThreadsAnalysis] = useState<ThreadsAnalysis>();
  const [selectedThreadsIds, setSelectedThreadsIds] = useState<Set<string>>(new Set());
  const [workspaceMode, setWorkspaceMode] = useState<StudioWorkspace>(() => (
    typeof window !== "undefined" && window.location.hash === "#auto-threads" ? "auto-threads" : "manual"
  ));
  const backgroundInput = useRef<HTMLInputElement>(null);
  const imagesInput = useRef<HTMLInputElement>(null);
  const repliesInput = useRef<HTMLInputElement>(null);
  const illustrationsInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const conversationInput = useRef<HTMLInputElement>(null);
  const contentImageInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const illustrationRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const soundEffectRef = useRef<HTMLAudioElement>(null);
  const conversationDingRef = useRef<HTMLAudioElement>(null);
  const appearanceSoundRef = useRef<HTMLAudioElement>(null);
  const attachmentClickRef = useRef<HTMLAudioElement>(null);
  const previewTimeRef = useRef(0);
  const ttsOperationVersionRef = useRef(0);
  const draggedComment = useRef<string | undefined>(undefined);
  const draggingLogo = useRef(false);
  const isAutoWorkspace = workspaceMode === "auto-threads";
  previewTimeRef.current = previewTime;

  const selected = project?.comments.find((comment) => comment.id === selectedId);
  const selectedSoundEvent = project?.soundEffects.events.find((event) => event.commentId === selectedId);
  const selectedSoundAsset = project?.soundEffects.assets.find((asset) => asset.id === selectedSoundEvent?.assetId);
  const commentLabels = useMemo(() => buildCommentLabels(project?.comments ?? []), [project?.comments]);
  const timeline = useMemo(() => {
    if (!project?.comments.length) return undefined;
    try {
      return buildTimeline(project.comments, project.settings.export.fps);
    } catch {
      return undefined;
    }
  }, [project]);
  const activeSegment = timeline?.segments.find(
    (segment) => previewTime >= segment.startSeconds && previewTime < segment.endSeconds
  );
  const previewComment = project?.comments.find((comment) => comment.id === activeSegment?.commentId) ?? selected;
  const previewParentComment = previewComment?.parentCommentId
    ? project?.comments.find((comment) => comment.id === previewComment.parentCommentId)
    : previewComment;
  const replyVoiceFinished = Boolean(
    previewComment?.parentCommentId
    && activeSegment
    && previewComment.audioDuration
    && previewTime - activeSegment.startSeconds >= previewComment.audioDuration
  );
  const previewReplyComment = previewComment?.parentCommentId && !replyVoiceFinished ? previewComment : undefined;
  const threadReplies = previewParentComment
    ? project?.comments.filter((comment) => comment.parentCommentId === previewParentComment.id) ?? []
    : [];
  const activeBrollSegment = project?.illustrations.segments.find(
    (segment) => previewTime >= segment.startSeconds && previewTime < segment.startSeconds + segment.durationSeconds
  );
  const previewIllustration = project?.illustrations.videos.find((video) => video.id === activeBrollSegment?.videoAssetId);
  const previewSoundEvent = project?.soundEffects.enabled
    ? project.soundEffects.events.find((event) => event.commentId === activeSegment?.commentId)
    : undefined;
  const previewSoundAsset = project?.soundEffects.assets.find((asset) => asset.id === previewSoundEvent?.assetId);
  const previewConversation = previewComment?.conversation?.enabled ? previewComment.conversation : undefined;
  const previewConversationMessage = previewComment && activeSegment
    ? activeConversationMessage(previewComment, Math.max(0, previewTime - activeSegment.startSeconds))
    : undefined;
  const conversationHasTiming = Boolean(previewConversation?.messages.some((item) => item.revealStartSeconds !== undefined));
  const showConversationImage = Boolean(previewConversation && (previewConversationMessage || !conversationHasTiming));
  const previewDingAsset = project?.soundEffects.assets.find((asset) => asset.id === previewConversation?.dingAssetId);
  const previewAttachment = isAutoWorkspace ? previewComment?.attachment?.asset : undefined;
  const attachmentLocalTime = activeSegment ? previewTime - activeSegment.startSeconds : 0;
  const showPreviewAttachment = Boolean(
    previewAttachment
    && activeSegment
    && attachmentLocalTime >= (previewComment?.attachment?.revealStartSeconds ?? 0)
  );
  const appearanceAssetId = isAutoWorkspace && project?.soundEffects.enabled
    ? resolveCommentAppearanceAssetId(project.comments, activeSegment?.commentId, project.soundEffects.appearance)
    : undefined;
  const previewAppearanceAsset = project?.soundEffects.assets.find((asset) => asset.id === appearanceAssetId);
  const introAppearanceAsset = project?.soundEffects.assets.find((asset) => asset.id === project.soundEffects.appearance.introAssetId);
  const nextAppearanceAsset = project?.soundEffects.assets.find((asset) => asset.id === project.soundEffects.appearance.nextAssetId);
  const previewLayout = useMemo(() => {
    if (!project || !previewParentComment || !project.settings.smartLayout.enabled || project.settings.smartLayout.mode !== "auto") return undefined;
    const primaryImage = previewParentComment.conversation?.enabled
      ? {
          width: previewParentComment.conversation.image.width ?? 918,
          height: Math.min(previewParentComment.conversation.image.height ?? 1114, (previewParentComment.conversation.image.width ?? 918) * 1.25)
        }
      : previewParentComment.image;
    if (threadReplies.length) {
      const tallestReply = threadReplies.reduce((tallest, candidate) => (
        (candidate.image.height ?? 1114) / Math.max(1, candidate.image.width ?? 918)
          > (tallest.image.height ?? 1114) / Math.max(1, tallest.image.width ?? 918)
          ? candidate
          : tallest
      ), threadReplies[0]!);
      const visualAspect = previewAttachment?.width && previewAttachment.height ? previewAttachment.width / previewAttachment.height : 16 / 9;
      const threaded = calculateThreadedSmartLayout(
        1080,
        1920,
        primaryImage.width ?? 918,
        primaryImage.height ?? 1114,
        tallestReply.image.width ?? 918,
        tallestReply.image.height ?? 1114,
        visualAspect,
        project.settings.smartLayout,
        project.settings.overlay.widthPercent,
        project.illustrations.layout.widthPercent,
        (project.illustrations.enabled && Boolean(previewIllustration)) || Boolean(previewAttachment)
      );
      return { primary: threaded.parent, reply: threaded.reply, broll: threaded.broll, commentScaleWarning: threaded.commentScaleWarning };
    }
    const visualAspect = previewAttachment?.width && previewAttachment.height ? previewAttachment.width / previewAttachment.height : 16 / 9;
    const single = calculateSmartLayout(
      1080, 1920,
      primaryImage.width ?? 918,
      primaryImage.height ?? 1114,
      visualAspect,
      project.settings.smartLayout,
      project.settings.overlay.widthPercent,
      project.illustrations.layout.widthPercent,
      (project.illustrations.enabled && Boolean(previewIllustration)) || Boolean(previewAttachment)
    );
    return { primary: single.comment, broll: single.broll, commentScaleWarning: single.commentScaleWarning };
  }, [project, previewParentComment, previewIllustration, previewAttachment, threadReplies]);
  const latestOutput = jobs.find((job) => job.projectId === project?.id && job.status === "completed" && job.outputPath);
  const conversationDisplay = useMemo(() => {
    if (!previewConversation || !showConversationImage) return undefined;
    const targetWidth = previewLayout?.primary.width ?? 918;
    const maxHeight = previewLayout?.primary.height ?? 1114;
    const sourceWidth = previewConversation.image.width ?? 1080;
    const sourceHeight = previewConversation.image.height ?? 1920;
    const scaledFullHeight = targetWidth * sourceHeight / Math.max(1, sourceWidth);
    const maxVisibleRatio = Math.min(1, maxHeight / Math.max(1, scaledFullHeight));
    const viewport = previewConversationMessage
      ? conversationViewport(previewConversation.messages, previewConversationMessage.id, maxVisibleRatio)
      : { top: 0, bottom: Math.min(1, maxVisibleRatio) };
    return {
      width: targetWidth,
      height: scaledFullHeight * (viewport.bottom - viewport.top),
      imageHeight: scaledFullHeight,
      imageTop: -scaledFullHeight * viewport.top,
      x: previewLayout?.primary.x ?? 81,
      y: previewLayout?.primary.y ?? 250,
      viewport
    };
  }, [previewConversation, previewConversationMessage?.id, previewLayout, showConversationImage]);
  const brollStats = useMemo(() => {
    const segments = project?.illustrations.segments ?? [];
    const uniqueUsed = new Set(segments.map((segment) => segment.videoAssetId)).size;
    const runs = segments.reduce((count, segment, index) => {
      const previous = segments[index - 1];
      const isContinuation = previous
        && previous.videoAssetId === segment.videoAssetId
        && Math.abs(previous.sourceStartSeconds + previous.durationSeconds - segment.sourceStartSeconds) < 0.05;
      return count + (isContinuation ? 0 : 1);
    }, 0);
    return {
      segments: segments.length,
      uniqueUsed,
      repeated: Math.max(0, runs - uniqueUsed)
    };
  }, [project?.illustrations.segments]);

  const reportError = (unknownError: unknown) => {
    setError(unknownError instanceof Error ? unknownError.message : "Đã xảy ra lỗi.");
    setMessage("Thao tác chưa hoàn tất");
  };

  const refreshProjects = async () => setProjects(await api<ProjectSummary[]>("/api/projects"));
  const refreshJobs = async () => setJobs(await api<RenderJob[]>("/api/render-jobs"));
  const refreshTikTokJobs = async () => setTikTokJobs(await api<TikTokPublishJob[]>("/api/tiktok/publish-jobs"));
  const refreshChromeProfiles = async () => setChromeProfiles(await api<ChromeProfileInfo[]>("/api/tiktok/chrome-profiles"));
  const refreshTtsProviders = async () => {
    const nextProviders = await api<TtsProviderInfo[]>("/api/tts/providers");
    setProviders(nextProviders);
    setVoiceRefreshKey((current) => current + 1);
  };

  useEffect(() => {
    void Promise.all([
      refreshProjects(),
      api<TtsProviderInfo[]>("/api/tts/providers").then(setProviders),
      refreshJobs(),
      refreshTikTokJobs(),
      refreshChromeProfiles()
    ]).catch(reportError);
  }, []);

  useEffect(() => {
    const syncWorkspaceFromHash = () => setWorkspaceMode(window.location.hash === "#auto-threads" ? "auto-threads" : "manual");
    window.addEventListener("hashchange", syncWorkspaceFromHash);
    return () => window.removeEventListener("hashchange", syncWorkspaceFromHash);
  }, []);

  useEffect(() => {
    if (project) window.scrollTo({ top: 0, left: 0 });
  }, [project?.id]);

  useEffect(() => {
    const profileDirectory = project?.settings.tiktok.chromeProfileDirectory;
    setTikTokPreflight(undefined);
    if (!project?.settings.tiktok.enabled || !profileDirectory) return;
    const controller = new AbortController();
    setTikTokChecking(true);
    setMessage("Đang tự kiểm tra quyền Chrome cho project…");
    void fetchTikTokPreflight(profileDirectory, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setTikTokPreflight(result);
        setMessage(result.appleEventsReady && result.accessibilityReady ? "Chrome đã sẵn sàng để tự đăng" : "Chrome còn thiếu quyền; hãy bật rồi bấm kiểm tra lại");
        setError("");
      })
      .catch((preflightError) => {
        if (controller.signal.aborted) return;
        reportError(preflightError);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTikTokChecking(false);
      });
    return () => controller.abort();
  }, [project?.id, project?.settings.tiktok.enabled, project?.settings.tiktok.chromeProfileDirectory]);

  useEffect(() => {
    const timer = window.setInterval(() => void Promise.all([refreshJobs(), refreshTikTokJobs()]).catch(() => undefined), 1200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!project || !dirty) return;
    const timer = window.setTimeout(() => {
      setMessage("Đang tự động lưu…");
      void api<ProjectData>(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(project)
      }).then((saved) => {
        setProject(saved);
        setDirty(false);
        setMessage("Đã lưu tự động");
        void refreshProjects();
      }).catch(reportError);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [project, dirty]);

  useEffect(() => {
    if (!project) return;
    const provider = activeProvider(project, selected);
    const controller = new AbortController();
    setVoices([]);
    setVoicesProvider(provider);
    setVoicesLoading(true);
    setVoicesError("");
    void api<VoiceInfo[]>(`/api/tts/voices?provider=${encodeURIComponent(provider)}&language=vi`, { signal: controller.signal })
      .then((nextVoices) => {
        if (!controller.signal.aborted) setVoices(nextVoices);
      })
      .catch((voiceError) => {
        if (controller.signal.aborted) return;
        setVoices([]);
        setVoicesError(voiceError instanceof Error ? voiceError.message : "Không tải được danh sách giọng.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoicesLoading(false);
      });
    return () => controller.abort();
  }, [project?.id, selected?.id, selected?.provider, project?.settings.defaultProvider, voiceRefreshKey]);

  useEffect(() => {
    if (!playing || !timeline) return;
    const startedAt = performance.now();
    const initialTime = previewTime;
    let frame = 0;
    const tick = (now: number) => {
      const next = initialTime + (now - startedAt) / 1000;
      if (next >= timeline.durationSeconds) {
        setPreviewTime(timeline.durationSeconds);
        setPlaying(false);
        videoRef.current?.pause();
        illustrationRef.current?.pause();
        audioRef.current?.pause();
        musicRef.current?.pause();
        soundEffectRef.current?.pause();
        conversationDingRef.current?.pause();
        appearanceSoundRef.current?.pause();
        return;
      }
      setPreviewTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, timeline]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !project || !activeSegment || !previewComment?.audioPath) return;
    const expected = Math.min(previewComment.audioDuration ?? 0, Math.max(0, previewTime - activeSegment.startSeconds));
    if (Math.abs(audio.currentTime - expected) > 0.35) audio.currentTime = expected;
    if (playing && expected < (previewComment.audioDuration ?? 0)) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [activeSegment?.commentId, playing]);

  useEffect(() => {
    const video = illustrationRef.current;
    if (!video || !previewIllustration || !activeBrollSegment) return;
    const localTime = Math.max(0, previewTime - activeBrollSegment.startSeconds);
    const expected = (activeBrollSegment.sourceStartSeconds + localTime) % previewIllustration.duration;
    if (Number.isFinite(video.duration) && Math.abs(video.currentTime - expected) > 0.3) video.currentTime = expected;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [activeBrollSegment?.id, playing, previewTime, previewIllustration?.id]);

  useEffect(() => {
    const music = musicRef.current;
    if (!music || !project?.music.enabled || !project.music.duration) return;
    const expected = previewTime % project.music.duration;
    if (Math.abs(music.currentTime - expected) > 0.4) music.currentTime = expected;
    const fadeInGain = project.music.fadeIn > 0 ? Math.min(1, previewTime / project.music.fadeIn) : 1;
    const remaining = Math.max(0, (timeline?.durationSeconds ?? 0) - previewTime);
    const fadeOutGain = project.music.fadeOut > 0 ? Math.min(1, remaining / project.music.fadeOut) : 1;
    const narrationActive = Boolean(activeSegment && previewComment?.audioDuration && previewTime - activeSegment.startSeconds < previewComment.audioDuration);
    const duckGain = project.music.ducking && narrationActive ? 0.35 : 1;
    music.volume = Math.max(0, Math.min(1, project.music.volume * fadeInGain * fadeOutGain * duckGain));
    if (playing) void music.play().catch(() => undefined);
    else music.pause();
  }, [playing, previewTime, project?.music, activeSegment?.commentId]);

  useEffect(() => {
    const sound = soundEffectRef.current;
    if (!sound || !project || !activeSegment || !previewSoundEvent || !previewSoundAsset) return;
    const eventStart = activeSegment.startSeconds + previewSoundEvent.offsetSeconds;
    const expected = Math.max(0, previewTime - eventStart);
    sound.volume = Math.max(0, Math.min(1, project.soundEffects.volume * previewSoundEvent.volume));
    if (Math.abs(sound.currentTime - Math.min(expected, previewSoundAsset.duration)) > 0.25) {
      sound.currentTime = Math.min(expected, previewSoundAsset.duration);
    }
    if (playing && previewTime >= eventStart && expected < previewSoundAsset.duration) void sound.play().catch(() => undefined);
    else sound.pause();
  }, [playing, previewTime, activeSegment?.commentId, previewSoundEvent?.id, previewSoundAsset?.id, project?.soundEffects.volume]);

  useEffect(() => {
    const ding = conversationDingRef.current;
    if (!activeSegment || !previewConversation?.dingEnabled || !previewConversationMessage || !previewDingAsset) return schedulePreviewOneShot(ding, {
      playing: false, eventStartSeconds: 0, durationSeconds: 0, volume: 0, getTimelineSeconds: () => previewTimeRef.current
    });
    const eventStart = activeSegment.startSeconds + (previewConversationMessage.revealStartSeconds ?? 0);
    return schedulePreviewOneShot(ding, {
      playing,
      eventStartSeconds: eventStart,
      durationSeconds: previewDingAsset.duration,
      volume: previewConversation.dingVolume,
      getTimelineSeconds: () => previewTimeRef.current
    });
  }, [playing, activeSegment?.commentId, previewConversationMessage?.id, previewDingAsset?.id, previewConversation?.dingEnabled, previewConversation?.dingVolume]);

  useEffect(() => {
    const sound = appearanceSoundRef.current;
    if (!activeSegment || !previewAppearanceAsset || !project?.soundEffects.enabled || !project.soundEffects.appearance.enabled) return schedulePreviewOneShot(sound, {
      playing: false, eventStartSeconds: 0, durationSeconds: 0, volume: 0, getTimelineSeconds: () => previewTimeRef.current
    });
    return schedulePreviewOneShot(sound, {
      playing,
      eventStartSeconds: activeSegment.startSeconds,
      durationSeconds: previewAppearanceAsset.duration,
      volume: project.soundEffects.appearance.volume,
      getTimelineSeconds: () => previewTimeRef.current
    });
  }, [playing, activeSegment?.commentId, previewAppearanceAsset?.id, project?.soundEffects.enabled, project?.soundEffects.appearance.enabled, project?.soundEffects.appearance.volume]);

  useEffect(() => {
    const sound = attachmentClickRef.current;
    const reveal = previewComment?.attachment?.revealStartSeconds;
    if (!activeSegment || reveal === undefined || !previewComment?.attachment?.clickEnabled || !nextAppearanceAsset || !project?.soundEffects.enabled || !project.soundEffects.appearance.enabled) return schedulePreviewOneShot(sound, {
      playing: false, eventStartSeconds: 0, durationSeconds: 0, volume: 0, getTimelineSeconds: () => previewTimeRef.current
    });
    const eventStart = activeSegment.startSeconds + reveal;
    return schedulePreviewOneShot(sound, {
      playing,
      eventStartSeconds: eventStart,
      durationSeconds: nextAppearanceAsset.duration,
      volume: project.soundEffects.appearance.volume,
      getTimelineSeconds: () => previewTimeRef.current
    });
  }, [playing, activeSegment?.commentId, previewComment?.attachment?.revealStartSeconds, previewComment?.attachment?.clickEnabled, nextAppearanceAsset?.id, project?.soundEffects.enabled, project?.soundEffects.appearance.enabled, project?.soundEffects.appearance.volume]);

  const mutateProject = (mutator: (draft: ProjectData) => void) => {
    if (!project) return;
    const draft = structuredClone(project);
    mutator(draft);
    setProject(syncBrollSegments(draft));
    setDirty(true);
    setError("");
  };

  useEffect(() => {
    if (!project || voicesProvider !== activeProvider(project, selected) || !voices.length || voices.some((voice) => voice.id === activeVoice(project, selected))) return;
    mutateProject((draft) => {
      if (selected) draft.comments.find((item) => item.id === selected.id)!.voiceId = voices[0]!.id;
      else draft.settings.defaultVoiceId = voices[0]!.id;
    });
  }, [voices, voicesProvider, project?.id, selected?.id, selected?.provider, project?.settings.defaultProvider]);

  const saveNow = async () => {
    if (!project || !dirty) return project;
    const saved = await api<ProjectData>(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(project)
    });
    setProject(saved);
    setDirty(false);
    setMessage("Đã lưu");
    return saved;
  };

  const analyzeThreads = async () => {
    if (!project || !threadsUrl.trim()) return;
    setBusy("threads-analyze");
    setError("");
    setMessage("Chrome local đang mở. Bạn có tối đa 5 phút để đăng nhập; sau đó tool sẽ cuộn và mở reply cho tới khi dữ liệu ổn định…");
    try {
      const result = await api<{ analysisId: string; analysis: ThreadsAnalysis }>(`/api/projects/${project.id}/threads/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: threadsUrl.trim() })
      });
      setThreadsAnalysisId(result.analysisId);
      setThreadsAnalysis(result.analysis);
      setSelectedThreadsIds(new Set([
        result.analysis.post.id,
        ...result.analysis.comments.filter((comment) => comment.suggested).map((comment) => comment.id)
      ]));
      setMessage(`Đã đọc ${result.analysis.comments.length} comment và reply`);
    } catch (threadsError) {
      reportError(threadsError);
    } finally {
      setBusy("");
    }
  };

  const openThreadsBrowser = async () => {
    if (!project) return;
    setBusy("threads-browser");
    setError("");
    try {
      const result = await api<{ open: boolean; url: string; message: string }>(`/api/projects/${project.id}/threads/browser/open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: threadsUrl.trim() || undefined })
      });
      setMessage(result.message);
    } catch (threadsError) {
      reportError(threadsError);
    } finally {
      setBusy("");
    }
  };

  const importThreads = async () => {
    if (!project || !threadsAnalysisId || !selectedThreadsIds.size) return;
    setBusy("threads-import");
    setError("");
    setMessage("Đang tạo card comment, phân loại ảnh và nhập vào project…");
    try {
      const updated = await api<ProjectData>(`/api/projects/${project.id}/threads/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId: threadsAnalysisId, selectedIds: [...selectedThreadsIds] })
      });
      setProject(updated);
      setThreadsAnalysis(undefined);
      setThreadsAnalysisId("");
      setSelectedThreadsIds(new Set());
      setDirty(false);
      setSelectedId(updated.comments.at(-1)?.id);
      const missing: string[] = [];
      if (!updated.illustrations.videos.length) missing.push("thư viện B-roll");
      if (!updated.branding.watermark.enabled) missing.push("watermark");
      if (!updated.branding.logo.enabled || !updated.branding.logo.asset) missing.push("logo");
      setMessage(missing.length
        ? `Đã nhập Threads. Các comment dùng chung pipeline bình thường; project hiện chưa bật/có ${missing.join(", ")}.`
        : "Đã nhập Threads với đầy đủ B-roll, watermark, logo và sound effect của project");
      void refreshProjects();
    } catch (threadsError) {
      reportError(threadsError);
    } finally {
      setBusy("");
    }
  };

  const ensureAppearanceSounds = async () => {
    if (!project) return;
    setBusy("appearance-sounds");
    try {
      const updated = await api<ProjectData>(`/api/projects/${project.id}/sound-effects/appearance`, { method: "POST" });
      setProject(updated);
      setDirty(false);
      setMessage("Đã tải âm tununuuuu và mouse click");
    } catch (soundError) {
      reportError(soundError);
    } finally {
      setBusy("");
    }
  };

  const openProject = async (id: string) => {
    setBusy("project");
    try {
      const envelope = await api<ProjectEnvelope>(`/api/projects/${id}`);
      setProject(envelope.project);
      setMissingFiles(envelope.missingFiles);
      setSelectedId(envelope.project.comments[0]?.id);
      setDirty(false);
      setPreviewTime(0);
      setThreadsUrl("");
      setThreadsAnalysis(undefined);
      setThreadsAnalysisId("");
      setSelectedThreadsIds(new Set());
      setTikTokPreflight(undefined);
      setShowProjects(false);
      setMessage(`Đã mở “${envelope.project.name}”`);
      setError("");
    } catch (openError) {
      reportError(openError);
    } finally {
      setBusy("");
    }
  };

  const deleteProject = async (item: ProjectSummary) => {
    if (!confirm(`Xóa vĩnh viễn project “${item.name}” cùng toàn bộ ảnh, audio và video đã xuất của project này?`)) return;
    setBusy(`delete-project-${item.id}`);
    setError("");
    try {
      await api<void>(`/api/projects/${item.id}`, { method: "DELETE" });
      setProjects((current) => current.filter((candidate) => candidate.id !== item.id));
      if (project?.id === item.id) {
        setProject(undefined);
        setSelectedId(undefined);
        setPlaying(false);
      }
      setMessage(`Đã xóa project “${item.name}”`);
    } catch (deleteError) {
      reportError(deleteError);
    } finally {
      setBusy("");
    }
  };

  const deleteAllProjects = async () => {
    if (!projects.length) return;
    if (!confirm(`Xóa vĩnh viễn toàn bộ ${projects.length} project cùng tất cả ảnh, audio và video đã xuất? Thao tác này không thể hoàn tác.`)) return;
    setBusy("delete-all-projects");
    setError("");
    try {
      const result = await api<{ deleted: number }>("/api/projects", { method: "DELETE" });
      setProjects([]);
      setProject(undefined);
      setSelectedId(undefined);
      setPlaying(false);
      setMessage(`Đã xóa ${result.deleted} project`);
    } catch (deleteError) {
      reportError(deleteError);
    } finally {
      setBusy("");
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setBusy("create");
    try {
      const created = await api<ProjectData>("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newProjectName })
      });
      setNewProjectName("");
      await refreshProjects();
      await openProject(created.id);
    } catch (createError) {
      reportError(createError);
    } finally {
      setBusy("");
    }
  };

  const upload = async (kind: "background" | "images", files: FileList | null) => {
    if (!project || !files?.length) return;
    const form = new FormData();
    if (kind === "background") form.append("background", files[0]!);
    else [...files].forEach((file) => form.append("images", file));
    setBusy(kind);
    setMessage(kind === "background" ? "Đang nhập video nền…" : "Đang nhập ảnh comment…");
    try {
      const updated = await api<ProjectData>(
        kind === "background" ? `/api/projects/${project.id}/background` : `/api/projects/${project.id}/comments/images`,
        { method: "POST", body: form }
      );
      setProject(updated);
      if (kind === "images") setSelectedId(updated.comments.at(-files.length)?.id);
      setMessage(kind === "background" ? "Đã nhập video nền" : `Đã thêm ${files.length} ảnh comment`);
      setError("");
    } catch (uploadError) {
      reportError(uploadError);
    } finally {
      setBusy("");
    }
  };

  const uploadIllustrations = async (files: FileList | null) => {
    if (!project || !files?.length) return;
    const form = new FormData();
    [...files].forEach((file) => form.append("videos", file, file.webkitRelativePath || file.name));
    setBusy("illustrations");
    setMessage("Đang quét và tạo thumbnail video minh họa…");
    try {
      const result = await api<{ project: ProjectData; skipped: Array<{ name: string; error: string }> }>(
        `/api/projects/${project.id}/illustrations/videos`,
        { method: "POST", body: form }
      );
      setProject(result.project);
      setDirty(false);
      setMessage(`Đã nhập ${result.project.illustrations.videos.length} video${result.skipped.length ? ` · bỏ qua ${result.skipped.length} file lỗi` : ""}`);
      setError(result.skipped.length ? result.skipped.map((item) => `${item.name}: ${item.error}`).join(" · ") : "");
    } catch (uploadError) {
      reportError(uploadError);
    } finally {
      setBusy("");
    }
  };

  const uploadReplies = async (files: FileList | null) => {
    if (!project || !selected || !files?.length) return;
    const rootParentId = selected.parentCommentId ?? selected.id;
    const form = new FormData();
    [...files].forEach((file) => form.append("images", file));
    setBusy("replies");
    setMessage("Đang thêm comment con…");
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${rootParentId}/replies/images`, {
        method: "POST",
        body: form
      });
      setProject(updated);
      const replies = updated.comments.filter((comment) => comment.parentCommentId === rootParentId);
      setSelectedId(replies.at(-1)?.id ?? rootParentId);
      setDirty(false);
      setMessage(`Đã thêm ${files.length} comment con`);
      setError("");
    } catch (uploadError) {
      reportError(uploadError);
    } finally {
      setBusy("");
      if (repliesInput.current) repliesInput.current.value = "";
    }
  };

  const uploadConversation = async (files: FileList | null) => {
    if (!project || !selected || !files?.[0]) return;
    const commentId = selected.id;
    const form = new FormData();
    form.append("image", files[0]);
    setBusy("conversation-ocr");
    setMessage("Đang nhận dạng hội thoại bằng Apple Vision…");
    try {
      await saveNow();
      let updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${commentId}/conversation/image`, {
        method: "POST", body: form
      });
      setProject(updated);
      setDirty(false);
      setMessage(`Đã nhận dạng ${updated.comments.find((item) => item.id === commentId)?.conversation?.messages.length ?? 0} tin nhắn`);
      try {
        updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${commentId}/conversation/ding`, { method: "POST" });
        setProject(updated);
        setMessage("Đã nhận dạng hội thoại và tải âm ding");
      } catch (dingError) {
        setError(`Đã quét được chữ nhưng chưa tải được âm ding: ${dingError instanceof Error ? dingError.message : "Lỗi không xác định"}`);
      }
    } catch (conversationError) {
      reportError(conversationError);
    } finally {
      setBusy("");
      if (conversationInput.current) conversationInput.current.value = "";
    }
  };

  const uploadContentImage = async (files: FileList | null) => {
    if (!project || !selected || !files?.[0]) return;
    const commentId = selected.id;
    const form = new FormData();
    form.append("image", files[0]);
    setBusy("content-image-ocr");
    setMessage("Đang quét chữ và phân loại ảnh nội dung…");
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${commentId}/content-image`, { method: "POST", body: form });
      const updatedComment = updated.comments.find((item) => item.id === commentId);
      setProject(updated);
      setDirty(false);
      setError("");
      setMessage(updatedComment?.conversation
        ? `Đã nhận dạng hội thoại ${updatedComment.conversation.messages.length} tin`
        : updatedComment?.attachment?.detectedType === "text"
          ? `Đã nhận dạng ${updatedComment.attachment.textBlocks.length} đoạn chữ trong ảnh`
          : "Ảnh không có chữ cần đọc; sẽ hiện 2 giây sau lời comment");
    } catch (contentError) {
      reportError(contentError);
    } finally {
      setBusy("");
      if (contentImageInput.current) contentImageInput.current.value = "";
    }
  };

  const removeConversation = async () => {
    if (!project || !selected?.conversation || !confirm("Gỡ ảnh và toàn bộ nội dung hội thoại khỏi comment này?")) return;
    try {
      const updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${selected.id}/conversation/image`, { method: "DELETE" });
      setProject(updated);
      setDirty(false);
      setMessage("Đã gỡ ảnh hội thoại");
    } catch (conversationError) {
      reportError(conversationError);
    }
  };

  const generateConversationMessage = async (messageId: string) => {
    if (!project || !selected?.conversation) return;
    const message = selected.conversation.messages.find((candidate) => candidate.id === messageId);
    const forceRegenerate = message?.audioStatus === "ready" || message?.audioStatus === "error";
    setBusy(`conversation-message-${messageId}`);
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${selected.id}/conversation/messages/${messageId}/tts?forceRegenerate=${forceRegenerate}`, { method: "POST" });
      setProject(updated);
      setDirty(false);
      setMessage("Đã tạo giọng cho tin nhắn");
    } catch (conversationError) {
      reportError(conversationError);
    } finally {
      setBusy("");
    }
  };

  const ensureConversationDing = async () => {
    if (!project || !selected?.conversation) return;
    setBusy("conversation-ding");
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${selected.id}/conversation/ding`, { method: "POST" });
      setProject(updated);
      setDirty(false);
      setMessage("Đã tải và cache âm ding từ MyInstants");
      setError("");
    } catch (dingError) {
      reportError(dingError);
    } finally {
      setBusy("");
    }
  };

  const randomizeIllustrations = async (commentId?: string) => {
    if (!project) return;
    setBusy("randomize");
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/illustrations/randomize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commentId ? { commentId } : {})
      });
      setProject(updated);
      setDirty(false);
      setMessage(commentId ? "Đã đổi B-roll của comment hiện tại" : "Đã phân bổ lại toàn bộ B-roll");
    } catch (randomizeError) {
      reportError(randomizeError);
    } finally {
      setBusy("");
    }
  };

  const maximizeIllustrationVariety = async () => {
    if (!project) return;
    setBusy("maximize-broll");
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/illustrations/maximize-variety`, {
        method: "POST"
      });
      setProject(updated);
      setDirty(false);
      const uniqueUsed = new Set(updated.illustrations.segments.map((segment) => segment.videoAssetId)).size;
      setMessage(`Đã dùng ${uniqueUsed}/${updated.illustrations.videos.length} video khác nhau trên timeline`);
      setError("");
    } catch (maximizeError) {
      reportError(maximizeError);
    } finally {
      setBusy("");
    }
  };

  const autoAssignSoundEffects = async (commentId?: string) => {
    if (!project) return;
    setBusy(commentId ? "sound-effect-one" : "sound-effects-all");
    setMessage(commentId ? "Đang tìm SFX phù hợp trên MyInstants…" : "Đang tự chọn SFX cho các cảnh…");
    try {
      await saveNow();
      const result = await api<{
        project: ProjectData;
        assigned: number;
        skipped: Array<{ commentId: string; error: string }>;
      }>(`/api/projects/${project.id}/sound-effects/auto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(commentId ? { commentId } : {}), force: Boolean(commentId) })
      });
      setProject(result.project);
      setDirty(false);
      setMessage(`Đã tự chọn ${result.assigned} sound effect từ MyInstants`);
      setError(result.skipped.length
        ? result.skipped.map((item) => `Comment ${commentLabels.get(item.commentId) ?? "?"}: ${item.error}`).join(" · ")
        : "");
    } catch (soundError) {
      reportError(soundError);
    } finally {
      setBusy("");
    }
  };

  const uploadMusic = async (files: FileList | null) => {
    if (!project || !files?.[0]) return;
    const form = new FormData();
    form.append("music", files[0]);
    setBusy("music");
    try {
      const updated = await api<ProjectData>(`/api/projects/${project.id}/music`, { method: "POST", body: form });
      setProject(updated);
      setDirty(false);
      setMessage("Đã thêm nhạc nền");
      setError("");
    } catch (musicError) {
      reportError(musicError);
    } finally {
      setBusy("");
    }
  };

  const removeMusic = async () => {
    if (!project || !project.music.asset || !confirm("Gỡ nhạc nền khỏi project?")) return;
    try {
      const updated = await api<ProjectData>(`/api/projects/${project.id}/music`, { method: "DELETE" });
      setProject(updated);
      setDirty(false);
      setMessage("Đã gỡ nhạc nền");
    } catch (musicError) {
      reportError(musicError);
    }
  };

  const uploadLogo = async (files: FileList | null) => {
    if (!project || !files?.[0]) return;
    const form = new FormData();
    form.append("logo", files[0]);
    setBusy("logo");
    try {
      const updated = await api<ProjectData>(`/api/projects/${project.id}/branding/logo`, { method: "POST", body: form });
      setProject(updated);
      setDirty(false);
      setMessage("Đã thêm logo kênh");
      setError("");
    } catch (logoError) {
      reportError(logoError);
    } finally {
      setBusy("");
    }
  };

  const removeLogo = async () => {
    if (!project || !project.branding.logo.asset || !confirm("Gỡ logo kênh khỏi project?")) return;
    try {
      const updated = await api<ProjectData>(`/api/projects/${project.id}/branding/logo`, { method: "DELETE" });
      setProject(updated);
      setDirty(false);
      setMessage("Đã gỡ logo kênh");
    } catch (logoError) {
      reportError(logoError);
    }
  };

  const moveLogo = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (!draggingLogo.current || !project) return;
    const frame = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!frame) return;
    const xPercent = Math.max(3, Math.min(97, (event.clientX - frame.left) / frame.width * 100));
    const yPercent = Math.max(3, Math.min(97, (event.clientY - frame.top) / frame.height * 100));
    mutateProject((draft) => {
      draft.branding.logo.xPercent = Number(xPercent.toFixed(2));
      draft.branding.logo.yPercent = Number(yPercent.toFixed(2));
    });
  };

  const generateAudio = async (commentId?: string) => {
    if (!project) return;
    const operationVersion = ++ttsOperationVersionRef.current;
    setBusy(commentId ?? "all-audio");
    try {
      await saveNow();
      if (commentId) {
        const comment = project.comments.find((candidate) => candidate.id === commentId);
        const forceRegenerate = comment?.audioStatus === "ready" || comment?.audioStatus === "error";
        const updated = await api<ProjectData>(`/api/projects/${project.id}/comments/${commentId}/tts?forceRegenerate=${forceRegenerate}`, { method: "POST" });
        setProject(updated);
        setMessage("Đã tạo giọng đọc");
        setError("");
      } else {
        const result = await api<{ project: ProjectData; generated: number; skipped: number; failed: number; failures: Array<{ order: number; error: string }> }>(`/api/projects/${project.id}/tts/all`, { method: "POST" });
        setProject(result.project);
        setMessage(`Đã tạo ${result.generated} giọng đọc · Bỏ qua ${result.skipped} audio sẵn sàng · Còn lỗi ${result.failed}`);
        setError(result.failed ? `${result.failed} comment chưa tạo được audio. Chọn comment có lỗi để xem chi tiết hoặc chuyển sang giọng macOS.` : "");
      }
    } catch (ttsError) {
      if (operationVersion !== ttsOperationVersionRef.current) return;
      reportError(ttsError);
      const envelope = await api<ProjectEnvelope>(`/api/projects/${project.id}`).catch(() => undefined);
      if (envelope) setProject(envelope.project);
    } finally {
      if (operationVersion === ttsOperationVersionRef.current) setBusy("");
    }
  };

  const assignDiverseVoiceStudioVoices = () => {
    if (!project || voicesProvider !== "voicestudio" || voices.length < 2) {
      setVoicesError("Cần ít nhất hai voice profile trong VoiceStudio để phân giọng đa dạng.");
      return;
    }
    mutateProject((draft) => {
      draft.settings.defaultProvider = "voicestudio";
      draft.settings.defaultVoiceId = voices[0]!.id;
      draft.comments
        .slice()
        .sort((left, right) => left.order - right.order)
        .forEach((comment, index) => {
          const voice = voices[index % voices.length]!;
          comment.provider = "voicestudio";
          comment.voiceId = voice.id;
          comment.audioStatus = comment.text.trim() || comment.conversation?.messages.length || comment.attachment?.textBlocks.length
            ? "stale"
            : "missing";
          comment.audioDuration = undefined;
          comment.audioCacheKey = undefined;
          comment.error = undefined;
          if (comment.conversation) {
            comment.conversation.speakerAVoiceId = voice.id;
            comment.conversation.speakerBVoiceId = voices[(index + 1) % voices.length]!.id;
          }
        });
    });
    setVoicesError("");
    setMessage(`Đã luân phiên ${voices.length} giọng VoiceStudio cho ${project.comments.length} comment`);
  };

  const assignSelectedVoiceToAllComments = () => {
    if (!project) return;
    const providerId = activeProvider(project, selected);
    const voiceId = activeVoice(project, selected);
    const voice = voices.find((candidate) => candidate.id === voiceId);
    if (!voiceId || !voice) {
      setVoicesError("Hãy chọn một giọng hợp lệ trước khi áp dụng cho tất cả comment.");
      return;
    }
    setProject(applyVoiceToAll(project, providerId, voiceId));
    setDirty(true);
    setVoicesError("");
    setMessage(`Đã dùng giọng “${voice.name}” cho ${project.comments.length} comment; audio cũ được đánh dấu cần tạo lại`);
  };

  const reorder = (targetId: string) => {
    const sourceId = draggedComment.current;
    if (!sourceId || sourceId === targetId) return;
    mutateProject((draft) => {
      const items = draft.comments.slice().sort((a, b) => a.order - b.order);
      const sourceBlock = items.filter((item) => item.id === sourceId || item.parentCommentId === sourceId);
      const remaining = items.filter((item) => item.id !== sourceId && item.parentCommentId !== sourceId);
      const targetIndex = remaining.findIndex((item) => item.id === targetId);
      if (sourceBlock.length && targetIndex >= 0) remaining.splice(targetIndex, 0, ...sourceBlock);
      const reordered = targetIndex >= 0 ? remaining : items;
      draft.comments = reordered.map((item, index) => ({ ...item, order: index + 1 }));
    });
  };

  const duplicateSelected = () => {
    if (!selected) return;
    mutateProject((draft) => {
      const selectedIndex = draft.comments.findIndex((comment) => comment.id === selected.id);
      const insertAfter = selected.parentCommentId
        ? selectedIndex
        : draft.comments.reduce((last, comment, index) => comment.id === selected.id || comment.parentCommentId === selected.id ? index : last, selectedIndex);
      const duplicate = { ...structuredClone(selected), id: crypto.randomUUID(), order: insertAfter + 2 };
      draft.comments.splice(insertAfter + 1, 0, duplicate);
      draft.comments.forEach((comment, order) => { comment.order = order + 1; });
      setSelectedId(duplicate.id);
    });
  };

  const deleteSelected = () => {
    if (!selected) return;
    const childCount = project?.comments.filter((comment) => comment.parentCommentId === selected.id).length ?? 0;
    if (!confirm(`Xóa comment ${commentLabels.get(selected.id) ?? selected.order}${childCount ? ` và ${childCount} comment con` : ""}?`)) return;
    mutateProject((draft) => {
      draft.comments = draft.comments.filter((comment) => comment.id !== selected.id && comment.parentCommentId !== selected.id)
        .map((comment, index) => ({ ...comment, order: index + 1 }));
      setSelectedId(draft.comments[0]?.id);
    });
  };

  const clearAllComments = async () => {
    if (!project?.comments.length) return;
    if (!confirm(`Chỉ xóa toàn bộ ${project.comments.length} comment? Video nền, B-roll, nhạc, watermark, logo và các setting khác vẫn được giữ nguyên.`)) return;
    setBusy("clear-comments");
    setError("");
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/comments`, { method: "DELETE" });
      setProject(updated);
      setSelectedId(undefined);
      setPreviewTime(0);
      setPlaying(false);
      setDirty(false);
      setMessage("Đã xóa toàn bộ comment; các setting khác vẫn được giữ nguyên");
    } catch (clearError) {
      reportError(clearError);
    } finally {
      setBusy("");
    }
  };

  const clearAllAudio = async () => {
    if (!project?.comments.length || busy === "clear-audio") return;
    if (!confirm("Dừng mọi giọng đọc đang tạo và xóa toàn bộ audio đã tạo trong project này? Ảnh, nội dung, giọng đã chọn, B-roll và các setting khác vẫn được giữ nguyên.")) return;
    ++ttsOperationVersionRef.current;
    setBusy("clear-audio");
    setError("");
    setPlaying(false);
    audioRef.current?.pause();
    try {
      await saveNow();
      const updated = await api<ProjectData>(`/api/projects/${project.id}/tts`, { method: "DELETE" });
      setProject(updated);
      setPreviewTime(0);
      setDirty(false);
      setMessage("Đã dừng tiến trình và xóa toàn bộ giọng đọc; nội dung cùng các setting vẫn được giữ nguyên");
    } catch (clearError) {
      reportError(clearError);
    } finally {
      setBusy("");
    }
  };

  const togglePreview = () => {
    if (!timeline) {
      setError("Hãy tạo audio hợp lệ cho tất cả comment trước khi xem timeline.");
      return;
    }
    if (previewTime >= timeline.durationSeconds) setPreviewTime(0);
    const next = !playing;
    setPlaying(next);
    if (next) void videoRef.current?.play().catch(() => undefined);
    else {
      videoRef.current?.pause();
      illustrationRef.current?.pause();
      audioRef.current?.pause();
      musicRef.current?.pause();
      soundEffectRef.current?.pause();
      conversationDingRef.current?.pause();
      appearanceSoundRef.current?.pause();
      attachmentClickRef.current?.pause();
    }
  };

  const seekPreview = (time: number) => {
    setPreviewTime(time);
    if (videoRef.current?.duration) videoRef.current.currentTime = time % videoRef.current.duration;
    const segment = timeline?.segments.find((item) => time >= item.startSeconds && time < item.endSeconds);
    const comment = project?.comments.find((item) => item.id === segment?.commentId);
    if (audioRef.current && segment && comment?.audioDuration) {
      audioRef.current.currentTime = Math.min(comment.audioDuration, Math.max(0, time - segment.startSeconds));
    }
    const brollSegment = project?.illustrations.segments.find((item) => time >= item.startSeconds && time < item.startSeconds + item.durationSeconds);
    const illustration = project?.illustrations.videos.find((video) => video.id === brollSegment?.videoAssetId);
    if (illustrationRef.current && illustration && brollSegment) {
      illustrationRef.current.currentTime = (brollSegment.sourceStartSeconds + Math.max(0, time - brollSegment.startSeconds)) % illustration.duration;
    }
    if (musicRef.current && project?.music.duration) musicRef.current.currentTime = time % project.music.duration;
    const soundEvent = project?.soundEffects.events.find((event) => event.commentId === segment?.commentId);
    const soundAsset = project?.soundEffects.assets.find((asset) => asset.id === soundEvent?.assetId);
    if (soundEffectRef.current && segment && soundEvent && soundAsset) {
      soundEffectRef.current.currentTime = Math.min(soundAsset.duration, Math.max(0, time - segment.startSeconds - soundEvent.offsetSeconds));
    }
    const conversation = comment?.conversation;
    const message = comment && segment ? activeConversationMessage(comment, Math.max(0, time - segment.startSeconds)) : undefined;
    const dingAsset = project?.soundEffects.assets.find((asset) => asset.id === conversation?.dingAssetId);
    if (conversationDingRef.current && segment && message && dingAsset) {
      conversationDingRef.current.currentTime = Math.min(dingAsset.duration, Math.max(0, time - segment.startSeconds - (message.revealStartSeconds ?? 0)));
    }
  };

  const startExport = async (publishToTikTok = false) => {
    if (!project) return;
    setBusy("export");
    try {
      await saveNow();
      await api<RenderJob>("/api/render-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.id, publishToTikTok, publishConfirmed: publishToTikTok })
      });
      await refreshJobs();
      setMessage(publishToTikTok ? "Đã xếp hàng xuất; TikTok sẽ mở sau khi render xong" : "Đã thêm video vào hàng đợi xuất");
      setError("");
      setShowExportConfirmation(false);
    } catch (exportError) {
      reportError(exportError);
    } finally {
      setBusy("");
    }
  };

  const requestExport = async () => {
    if (!project) return;
    if (!project.settings.tiktok.enabled) {
      await startExport(false);
      return;
    }
    if (!project.settings.tiktok.chromeProfileDirectory) {
      reportError(new Error("Hãy chọn hồ sơ Chrome cho TikTok trước khi xuất."));
      return;
    }
    if (project.settings.tiktok.mode === "schedule" && !project.settings.tiktok.scheduledAt) {
      reportError(new Error("Hãy chọn ngày giờ lên lịch TikTok trước khi xuất."));
      return;
    }
    const profileDirectory = project.settings.tiktok.chromeProfileDirectory;
    const preflightReady = tiktokPreflight?.profile.directory === profileDirectory
      && tiktokPreflight.appleEventsReady
      && tiktokPreflight.accessibilityReady;
    if (!preflightReady) {
      setBusy("tiktok-preflight");
      try {
        const result = await fetchTikTokPreflight(profileDirectory);
        setTikTokPreflight(result);
        if (!result.appleEventsReady || !result.accessibilityReady) {
          reportError(new Error("Chrome chưa đủ quyền để tự tải video. Làm đủ các bước thiết lập TikTok bên phải, rồi bấm Xuất video lại."));
          return;
        }
      } catch (preflightError) {
        reportError(preflightError);
        return;
      } finally {
        setBusy("");
      }
    }
    setShowExportConfirmation(true);
  };

  const checkTikTokProfile = async () => {
    const directory = project?.settings.tiktok.chromeProfileDirectory;
    if (!directory) return;
    setTikTokChecking(true);
    try {
      const result = await fetchTikTokPreflight(directory);
      setTikTokPreflight(result);
      setMessage(result.appleEventsReady && result.accessibilityReady ? "Đã cập nhật: Chrome sẵn sàng tự đăng" : "Đã kiểm tra lại: Chrome vẫn còn thiếu quyền");
      setError("");
    } catch (preflightError) {
      reportError(preflightError);
    } finally {
      setTikTokChecking(false);
    }
  };

  const openTikTokAccessibilitySettings = async () => {
    try {
      await api<void>("/api/tiktok/accessibility-settings", { method: "POST" });
      setMessage("Đã mở Cài đặt hệ thống. Hãy bật Terminal trong mục Trợ năng rồi quay lại kiểm tra.");
      setError("");
    } catch (settingsError) {
      reportError(settingsError);
    }
  };

  const jumpToComment = (comment: CommentItem) => {
    setSelectedId(comment.id);
    const segment = timeline?.segments.find((item) => item.commentId === comment.id);
    if (segment) seekPreview(segment.startSeconds);
  };

  const applyBatchVoiceSettings = () => {
    if (!project) return;
    const values = {
      rate: selected?.rate ?? project.settings.defaultRate,
      pitch: selected?.pitch ?? project.settings.defaultPitch,
      pauseAfter: selected?.pauseAfter ?? project.settings.defaultPauseAfter
    };
    const updated = applyVoiceSettingsToAll(
      project,
      values,
      batchFields,
      (providerId) => providers.find((provider) => provider.id === providerId)?.supportsPitch ?? false
    );
    const staleCount = updated.comments.filter((comment) => comment.audioStatus === "stale").length;
    setProject(updated);
    setDirty(true);
    setShowBatchVoice(false);
    setMessage(staleCount ? `${staleCount} giọng đọc cần tạo lại` : "Đã áp dụng cài đặt và cập nhật timeline");
  };

  const changeWorkspace = (workspace: StudioWorkspace) => {
    setWorkspaceMode(workspace);
    window.location.hash = workspace === "auto-threads" ? "auto-threads" : "manual";
    setThreadsAnalysis(undefined);
    setError("");
    setMessage(workspace === "auto-threads" ? "Đã mở workspace Auto Threads" : "Đã trở về chế độ chỉnh sửa thủ công");
  };

  if (!project || showProjects) {
    return (
      <main className="project-home">
        <div className="brand-mark">CV</div>
        <p className="home-caption">Xưởng video chạy local</p>
        <h1>COMMENT VIDEO STUDIO</h1>
        <p className="home-lead">Biến ảnh comment và giọng đọc thành một video dọc hoàn chỉnh.</p>
        <section className="new-project-card">
          <label htmlFor="project-name">Tên project mới</label>
          <div className="new-project-row">
            <input id="project-name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createProject()} placeholder="Ví dụ: Comment TikTok 18-10" />
            <button className="primary" onClick={() => void createProject()} disabled={!newProjectName.trim() || busy === "create"}>Tạo project</button>
          </div>
        </section>
        <section className="project-list" aria-label="Danh sách project">
          <div className="section-heading">
            <h2>Project gần đây</h2>
            <div className="project-list-actions">
              <span>{projects.length} project</span>
              {projects.length > 0 && <button className="delete-all-projects" onClick={() => void deleteAllProjects()} disabled={busy === "delete-all-projects"}>
                {busy === "delete-all-projects" ? "Đang xóa…" : "Xóa tất cả"}
              </button>}
            </div>
          </div>
          {projects.length === 0 ? <p className="empty">Chưa có project. Tạo project đầu tiên để bắt đầu.</p> : projects.map((item) => (
            <div className="project-row" key={item.id}>
              <button className="project-open-button" onClick={() => void openProject(item.id)} disabled={busy === "project" || busy === `delete-project-${item.id}`}>
                <span className="project-icon" aria-hidden="true">{item.hasBackground ? "▶" : "◇"}</span>
                <span><strong>{item.name}</strong><small>{item.commentCount} comment · cập nhật {new Date(item.updatedAt).toLocaleString("vi-VN")}</small></span>
                <span className="row-arrow" aria-hidden="true">→</span>
              </button>
              <button
                className="project-delete-button"
                onClick={() => void deleteProject(item)}
                disabled={busy === `delete-project-${item.id}` || busy === "delete-all-projects"}
                aria-label={`Xóa project ${item.name}`}
              >
                {busy === `delete-project-${item.id}` ? "Đang xóa…" : "Xóa"}
              </button>
            </div>
          ))}
        </section>
        {error && <div className="toast error">{error}</div>}
      </main>
    );
  }

  const providerId = activeProvider(project, selected);
  const provider = providers.find((item) => item.id === providerId);
  const selectedVoice = voices.find((voice) => voice.id === activeVoice(project, selected));
  const voiceStudioProvider = providers.find((item) => item.id === "voicestudio");
  const currentJobs = jobs.filter((job) => job.projectId === project.id);
  const currentTikTokJobs = tiktokJobs.filter((job) => job.projectId === project.id);

  return (
    <main className={`studio-shell ${isAutoWorkspace ? "auto-workspace" : "manual-workspace"}`}>
      <header className="topbar">
        <button className="logo-button" onClick={() => setShowProjects(true)} title="Danh sách project"><span>CV</span></button>
        <div className="project-title">
          <input aria-label="Tên project" value={project.name} onChange={(event) => mutateProject((draft) => { draft.name = event.target.value; })} />
          <small><span className={dirty ? "save-dot dirty" : "save-dot"} /> {message}</small>
        </div>
        <WorkspaceNavigation value={workspaceMode} onChange={changeWorkspace} />
        <div className="top-actions">
          <button className="secondary" onClick={() => setShowProjects(true)}>Mở project</button>
          <button className="primary export-button" onClick={requestExport} disabled={busy === "export"}>{project.settings.tiktok.enabled ? "Xuất & đăng" : "Xuất video"}</button>
        </div>
      </header>

      {(error || missingFiles.length > 0) && (
        <div className="alert-bar">
          <strong>{error || "Thiếu file nguồn"}</strong>
          {missingFiles.length > 0 && <span>{missingFiles.join(", ")}</span>}
          <button onClick={() => { setError(""); setMissingFiles([]); }}>×</button>
        </div>
      )}

      {isAutoWorkspace && <AutoWorkspaceSummary
        commentCount={project.comments.length}
        hasBackground={Boolean(project.background)}
        brollCount={project.illustrations.videos.length}
        hasWatermark={project.branding.watermark.enabled && Boolean(project.branding.watermark.text.trim())}
        hasLogo={project.branding.logo.enabled && Boolean(project.branding.logo.asset)}
      />}

      <div className="studio-grid">
        <aside className="comments-panel panel">
          <div className="panel-header">
            <div><span className="panel-kicker">NỘI DUNG</span><h2>Comment <em>{project.comments.length}</em></h2></div>
            <button className="icon-button" title="Thêm ảnh comment" onClick={() => imagesInput.current?.click()}>＋</button>
          </div>
          <input ref={imagesInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void upload("images", event.target.files)} />
          <input ref={repliesInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void uploadReplies(event.target.files)} />
          <button className="wide-action" onClick={() => imagesInput.current?.click()} disabled={busy === "images"}>＋ Thêm ảnh comment</button>
          {selected && <button className="wide-action add-reply-button" onClick={() => repliesInput.current?.click()} disabled={busy === "replies"}>↳ Thêm comment con cho {commentLabels.get(selected.parentCommentId ?? selected.id)}</button>}
          {isAutoWorkspace && project.comments.length > 0 && <button className="wide-action danger-action clear-comments-button" onClick={() => void clearAllComments()} disabled={busy === "clear-comments"}>
            {busy === "clear-comments" ? "Đang xóa comment…" : "Xóa hết comment"}
          </button>}
          <div className="comment-list">
            {project.comments.length === 0 && <div className="empty compact"><strong>Chưa có comment</strong><span>Chọn nhiều ảnh để tạo danh sách tự động.</span></div>}
            {project.comments.slice().sort((a, b) => a.order - b.order).map((comment) => (
              <article
                key={comment.id}
                className={`comment-card ${comment.parentCommentId ? "reply-card" : ""} ${selectedId === comment.id ? "selected" : ""}`}
                draggable={!comment.parentCommentId}
                onDragStart={() => { draggedComment.current = comment.id; }}
                onDragOver={(event: DragEvent) => { if (!comment.parentCommentId) event.preventDefault(); }}
                onDrop={() => { if (!comment.parentCommentId) reorder(comment.id); }}
                onClick={() => jumpToComment(comment)}
              >
                <span className="drag-handle">⠿</span>
                <span className="order-number">{commentLabels.get(comment.id) ?? comment.order}</span>
                <img src={mediaUrl(project.id, comment.image.relativePath)} alt={`Comment ${commentLabels.get(comment.id) ?? comment.order}`} />
                <span className="comment-summary">
                  <strong>{comment.text || comment.conversation?.messages[0]?.text || "Chưa nhập nội dung đọc"}</strong>
                  <small>{activeVoice(project, comment) || "Chưa chọn giọng"} · {formatTime(comment.audioDuration)}</small>
                  {comment.conversation && <small>Hội thoại: {comment.conversation.messages.length} tin</small>}
                  {project.illustrations.enabled && <small>B-roll: {project.illustrations.segments.filter((segment) => segment.commentId === comment.id).length} clip</small>}
                  <span className={`status ${comment.audioStatus}`}>{statusText[comment.audioStatus]}</span>
                </span>
                {comment.audioStatus === "ready" && <button className="mini-play" title="Nghe từ comment này" onClick={(event) => { event.stopPropagation(); jumpToComment(comment); setPlaying(true); }}>▶</button>}
              </article>
            ))}
          </div>
          <button className="wide-action accent" onClick={() => void generateAudio()} disabled={!project.comments.length || busy === "all-audio"}>
            {busy === "all-audio"
              ? "Đang tạo giọng đọc…"
              : isAutoWorkspace
                ? "Tạo giọng đọc còn thiếu hoặc bị lỗi"
                : project.comments.some((comment) => comment.audioStatus === "stale")
                  ? "Tạo lại tất cả giọng đọc cần cập nhật"
                  : "Tạo tất cả giọng đọc"}
          </button>
          <button
            className="wide-action danger-action clear-audio-button"
            onClick={() => void clearAllAudio()}
            disabled={!project.comments.length || busy === "clear-audio"}
          >
            {busy === "clear-audio"
              ? "Đang dừng và xóa giọng đọc…"
              : busy === "all-audio" || project.comments.some((comment) => comment.audioStatus === "generating")
                ? "Dừng và xóa toàn bộ giọng đọc"
                : "Xóa toàn bộ giọng đọc"}
          </button>
        </aside>

        <section className="preview-panel">
          <div className="preview-toolbar">
            <div><span className="live-dot" /> XEM TRƯỚC</div>
            <div className="resolution-pill">{project.settings.export.resolution} · 30 FPS</div>
          </div>
          <div className="phone-stage">
            <div className="video-frame">
              {project.background ? (
                <video ref={videoRef} muted loop playsInline src={mediaUrl(project.id, project.background.relativePath)} />
              ) : <div className="no-background"><span>◇</span><strong>Chưa có video nền</strong><button onClick={() => backgroundInput.current?.click()}>Chọn video nền</button></div>}
              {project.illustrations.enabled && previewIllustration && activeBrollSegment && (
                <video
                  key={activeBrollSegment.id}
                  ref={illustrationRef}
                  className="illustration-overlay"
                  muted
                  loop={project.illustrations.timingMode === "fixed"}
                  playsInline
                  src={mediaUrl(project.id, previewIllustration.relativePath)}
                  style={{
                    width: `${previewLayout?.broll ? previewLayout.broll.width / 10.8 : project.illustrations.layout.widthPercent}%`,
                    height: `${previewLayout?.broll ? previewLayout.broll.height / 19.2 : project.illustrations.layout.heightPercent}%`,
                    left: `${previewLayout?.broll ? (previewLayout.broll.x + previewLayout.broll.width / 2) / 10.8 : project.illustrations.layout.xPercent}%`,
                    top: `${previewLayout?.broll ? previewLayout.broll.y / 19.2 : project.illustrations.layout.topPercent}%`,
                    objectFit: project.illustrations.layout.fit
                  }}
                />
              )}
              {previewAttachment && showPreviewAttachment && (
                <img
                  className="attachment-overlay"
                  src={mediaUrl(project.id, previewAttachment.relativePath)}
                  alt="Ảnh đính kèm của comment Threads"
                  style={{
                    width: `${previewLayout?.broll ? previewLayout.broll.width / 10.8 : project.illustrations.layout.widthPercent}%`,
                    height: `${previewLayout?.broll ? previewLayout.broll.height / 19.2 : project.illustrations.layout.heightPercent}%`,
                    left: `${previewLayout?.broll ? (previewLayout.broll.x + previewLayout.broll.width / 2) / 10.8 : project.illustrations.layout.xPercent}%`,
                    top: `${previewLayout?.broll ? previewLayout.broll.y / 19.2 : project.illustrations.layout.topPercent}%`
                  }}
                />
              )}
              {previewParentComment && !showConversationImage && !showPreviewAttachment && (
                <img
                  className="comment-overlay"
                  src={mediaUrl(project.id, previewParentComment.image.relativePath)}
                  alt="Ảnh comment cha đang xem trước"
                  style={{
                    width: `${previewLayout ? previewLayout.primary.width / 10.8 : project.settings.overlay.widthPercent}%`,
                    height: previewLayout ? `${previewLayout.primary.height / 19.2}%` : undefined,
                    maxHeight: previewLayout ? undefined : `${project.settings.overlay.maxHeightPercent}%`,
                    left: `${previewLayout ? (previewLayout.primary.x + previewLayout.primary.width / 2) / 10.8 : project.settings.overlay.xPercent}%`,
                    top: `${previewLayout ? previewLayout.primary.y / 19.2 : project.settings.overlay.topPercent}%`
                  }}
                />
              )}
              {previewConversation && conversationDisplay && (
                <div
                  className={`conversation-overlay ${previewConversation.revealMode === "scroll" ? "scrolling" : ""}`}
                  style={{
                    width: `${conversationDisplay.width / 10.8}%`,
                    height: `${conversationDisplay.height / 19.2}%`,
                    left: `${(conversationDisplay.x + conversationDisplay.width / 2) / 10.8}%`,
                    top: `${conversationDisplay.y / 19.2}%`
                  }}
                >
                  <img
                    src={mediaUrl(project.id, previewConversation.image.relativePath)}
                    alt="Ảnh hội thoại đang mở theo lời đọc"
                    style={{ transform: `translateY(${-conversationDisplay.viewport.top * 100}%)` }}
                  />
                </div>
              )}
              {previewReplyComment && previewLayout?.reply && (
                <img
                  className="comment-overlay reply-overlay"
                  src={mediaUrl(project.id, previewReplyComment.image.relativePath)}
                  alt="Ảnh comment con đang xem trước"
                  style={{
                    width: `${previewLayout.reply.width / 10.8}%`,
                    height: `${previewLayout.reply.height / 19.2}%`,
                    left: `${(previewLayout.reply.x + previewLayout.reply.width / 2) / 10.8}%`,
                    top: `${previewLayout.reply.y / 19.2}%`
                  }}
                />
              )}
              {project.branding.watermark.enabled && project.branding.watermark.text.trim() && (
                <div
                  className="watermark-overlay"
                  style={{
                    opacity: project.branding.watermark.opacity,
                    left: `${project.branding.watermark.xPercent}%`,
                    top: `${project.branding.watermark.yPercent}%`,
                    fontSize: `${project.branding.watermark.fontSize / 10.8}cqw`
                  }}
                >{project.branding.watermark.text}</div>
              )}
              {project.branding.logo.enabled && project.branding.logo.asset && (
                <img
                  className="channel-logo-overlay"
                  src={mediaUrl(project.id, project.branding.logo.asset.relativePath)}
                  alt="Logo kênh"
                  title="Kéo để di chuyển logo"
                  draggable={false}
                  onPointerDown={(event) => {
                    draggingLogo.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    moveLogo(event);
                  }}
                  onPointerMove={moveLogo}
                  onPointerUp={(event) => {
                    draggingLogo.current = false;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { draggingLogo.current = false; }}
                  style={{
                    opacity: project.branding.logo.opacity,
                    width: `${project.branding.logo.widthPercent}%`,
                    left: `${project.branding.logo.xPercent}%`,
                    top: `${project.branding.logo.yPercent}%`
                  }}
                />
              )}
              <div className="safe-area" />
              {previewLayout?.commentScaleWarning && <div className="layout-warning">Ảnh comment đang được thu nhỏ nhiều</div>}
            </div>
          </div>
          <audio
            ref={audioRef}
            src={previewComment?.audioPath ? mediaUrl(project.id, previewComment.audioPath) : undefined}
            onEnded={() => undefined}
          />
          <audio
            ref={musicRef}
            loop
            src={project.music.asset ? mediaUrl(project.id, project.music.asset.relativePath) : undefined}
          />
          <audio
            ref={soundEffectRef}
            src={previewSoundAsset ? mediaUrl(project.id, previewSoundAsset.relativePath) : undefined}
          />
          <audio
            ref={conversationDingRef}
            src={previewDingAsset ? mediaUrl(project.id, previewDingAsset.relativePath) : undefined}
          />
          <audio
            ref={appearanceSoundRef}
            src={previewAppearanceAsset ? mediaUrl(project.id, previewAppearanceAsset.relativePath) : undefined}
          />
          <audio
            ref={attachmentClickRef}
            src={nextAppearanceAsset ? mediaUrl(project.id, nextAppearanceAsset.relativePath) : undefined}
          />
          <div className="transport">
            <button onClick={() => seekPreview(0)} title="Về đầu">↺</button>
            <button className="play-main" onClick={togglePreview}>{playing ? "Ⅱ" : "▶"}</button>
            <span>{formatTime(previewTime)}</span>
            <input
              aria-label="Timeline"
              type="range"
              min="0"
              max={timeline?.durationSeconds ?? 1}
              step="0.01"
              value={Math.min(previewTime, timeline?.durationSeconds ?? 1)}
              onChange={(event) => seekPreview(Number(event.target.value))}
            />
            <span>{formatTime(timeline?.durationSeconds)}</span>
          </div>
          <div className="timeline-track">
            {timeline ? timeline.segments.map((segment, index) => (
              <button
                key={segment.commentId}
                style={{ width: `${segment.durationFrames / timeline.durationFrames * 100}%` }}
                className={activeSegment?.commentId === segment.commentId ? "active" : ""}
                onClick={() => seekPreview(segment.startSeconds)}
                title={`Comment ${index + 1}: ${segment.startSeconds.toFixed(2)}–${segment.endSeconds.toFixed(2)} giây`}
              ><span>C{commentLabels.get(segment.commentId) ?? index + 1}</span><span className="broll-ticks">{project.illustrations.segments.filter((item) => item.commentId === segment.commentId).map((item) => <i key={item.id} />)}</span></button>
            )) : <div className="timeline-empty">Timeline xuất hiện sau khi tất cả audio sẵn sàng</div>}
          </div>
          {latestOutput?.outputPath && (
            <details className="rendered-preview">
              <summary>Xem video vừa xuất</summary>
              <video controls src={`/media/${latestOutput.outputPath.split("/").map(encodeURIComponent).join("/")}`} />
            </details>
          )}
        </section>

        <aside className="settings-panel panel">
          <div className="panel-header"><div><span className="panel-kicker">THUỘC TÍNH</span><h2>{selected ? `Comment ${commentLabels.get(selected.id) ?? selected.order}` : "Project"}</h2></div>{selected && <button className="project-settings-button" onClick={() => setSelectedId(undefined)}>Cài đặt project</button>}</div>
          <input ref={backgroundInput} hidden type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => void upload("background", event.target.files)} />
          <input
            ref={illustrationsInput}
            hidden
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            multiple
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(event) => void uploadIllustrations(event.target.files)}
          />
          <input ref={musicInput} hidden type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/flac,audio/ogg" onChange={(event) => void uploadMusic(event.target.files)} />
          <input ref={logoInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadLogo(event.target.files)} />
          <input ref={conversationInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadConversation(event.target.files)} />
          <input ref={contentImageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadContentImage(event.target.files)} />
          {isAutoWorkspace && <ThreadsAutoImportPanel
            url={threadsUrl}
            busy={busy}
            onUrlChange={setThreadsUrl}
            onOpenBrowser={() => void openThreadsBrowser()}
            onAnalyze={() => void analyzeThreads()}
          />}
          <section className="settings-section">
            <h3>Video nền</h3>
            <button className="file-picker" onClick={() => backgroundInput.current?.click()} disabled={busy === "background"}>
              <span>▣</span><span><strong>{project.background?.originalName ?? "Chọn video nền"}</strong><small>MP4, MOV, M4V hoặc WebM</small></span><b>Thay đổi</b>
            </button>
          </section>

          <section className="settings-section">
            <div className="section-title-row"><h3>Video minh họa</h3><span>{project.illustrations.videos.length} video</span></div>
            <label className="toggle-row">
              <input type="checkbox" checked={project.illustrations.enabled} disabled={!project.illustrations.videos.length} onChange={(event) => mutateProject((draft) => { draft.illustrations.enabled = event.target.checked; })} />
              Hiển thị video bên dưới comment
            </label>
            <label>Chế độ B-roll
              <select value={project.illustrations.mode} onChange={(event) => mutateProject((draft) => { draft.illustrations.mode = event.target.value as "per-comment" | "multi"; })}>
                <option value="per-comment">1 clip mỗi comment</option>
                <option value="multi">Nhiều clip mỗi comment</option>
              </select>
            </label>
            {project.illustrations.mode === "multi" && <label>Cách chuyển clip
              <select aria-label="Cách chuyển clip B-roll" value={project.illustrations.timingMode} onChange={(event) => mutateProject((draft) => { draft.illustrations.timingMode = event.target.value as "fixed" | "source-duration"; })}>
                <option value="fixed">Chia đều theo số giây</option>
                <option value="source-duration">Phát hết clip rồi mới đổi</option>
              </select>
            </label>}
            {project.illustrations.mode === "multi" && project.illustrations.timingMode === "fixed" && <div className="slider-row">
              <label>Thời gian đổi clip <b>{project.illustrations.intervalSeconds.toFixed(1)} giây</b>
                <input type="range" min="2" max="10" step="0.5" value={project.illustrations.intervalSeconds} onChange={(event) => mutateProject((draft) => { draft.illustrations.intervalSeconds = Number(event.target.value); })} />
              </label>
            </div>}
            {project.illustrations.mode === "multi" && project.illustrations.timingMode === "source-duration" && <p className="provider-notice offline">Mỗi B-roll bắt đầu từ đầu, chạy hết thời lượng nguồn rồi mới chuyển clip tiếp theo. Clip đang chạy được nối tiếp qua ranh giới comment.</p>}
            <button className="file-picker" onClick={() => illustrationsInput.current?.click()} disabled={busy === "illustrations"}>
              <span>▦</span><span><strong>{project.illustrations.videos.length ? "Quét lại thư mục video" : "Chọn thư mục video"}</strong><small>MP4, MOV, M4V hoặc WebM · file lỗi sẽ được báo</small></span><b>Chọn</b>
            </button>
            {project.illustrations.videos.length > 0 && (
              <>
                <div className="media-library-summary">
                  <strong>Thư viện đã quét: {project.illustrations.videos.length} video</strong>
                  <span>Timeline: {brollStats.segments} đoạn · đang dùng {brollStats.uniqueUsed} video khác nhau · {brollStats.repeated ? `${brollStats.repeated} lượt lặp` : "chưa lặp"}</span>
                  <small>Thumbnail chỉ hiển thị tối đa 12 ảnh; tất cả video trong thư viện vẫn tham gia random.</small>
                </div>
                <div className="media-library">
                  {project.illustrations.videos.slice(0, 12).map((video) => (
                    <div key={video.id} title={`${video.originalName} · ${formatTime(video.duration)}`}>
                      {video.thumbnailPath
                        ? <img src={mediaUrl(project.id, video.thumbnailPath)} alt={video.originalName} />
                        : <span>▶</span>}
                    </div>
                  ))}
                </div>
                <button className="wide-action media-randomize variety-button" onClick={() => void maximizeIllustrationVariety()} disabled={busy === "maximize-broll"}>
                  {busy === "maximize-broll" ? "Đang tối ưu…" : "Tối đa hóa độ đa dạng"}
                </button>
                <button className="wide-action media-randomize" onClick={() => void randomizeIllustrations()} disabled={busy === "randomize"}>⤨ Đổi ngẫu nhiên tất cả B-roll</button>
                {selected && <button className="wide-action media-randomize" onClick={() => void randomizeIllustrations(selected.id)} disabled={busy === "randomize"}>Đổi ngẫu nhiên comment hiện tại</button>}
                <p className="provider-notice offline">Random luôn ưu tiên clip chưa xuất hiện. Ở chế độ chia đều, nút tối đa tự chọn nhịp 2–10 giây với mục tiêu 80 video/đầu ra; ở chế độ phát hết clip, thời lượng file nguồn quyết định điểm đổi. Segment đã khóa không đổi.</p>
              </>
            )}
            {selected && project.illustrations.videos.length > 0 && (
              <div className="assignment-box">
                <strong>B-roll comment {commentLabels.get(selected.id) ?? selected.order}: {project.illustrations.segments.filter((segment) => segment.commentId === selected.id).length} đoạn theo thời lượng</strong>
                <small>Đây là số đoạn của riêng comment này, không phải giới hạn video trong thư viện.</small>
                <div className="segment-list">
                  {project.illustrations.segments.filter((segment) => segment.commentId === selected.id).map((segment, index) => (
                    <div key={segment.id}>
                      <span>{index + 1} · {segment.durationSeconds.toFixed(1)}s</span>
                      <select value={segment.videoAssetId} onChange={(event) => mutateProject((draft) => {
                        const item = draft.illustrations.segments.find((candidate) => candidate.id === segment.id)!;
                        item.videoAssetId = event.target.value;
                        item.sourceStartSeconds = 0;
                      })}>
                        {project.illustrations.videos.map((video) => <option key={video.id} value={video.id}>{video.originalName}</option>)}
                      </select>
                      <label className="toggle-row"><input type="checkbox" checked={segment.locked} onChange={(event) => mutateProject((draft) => { draft.illustrations.segments.find((candidate) => candidate.id === segment.id)!.locked = event.target.checked; })} /> Khóa</label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="slider-row two-column">
              {([
                ["widthPercent", "Chiều rộng", 30, 100],
                ["heightPercent", "Chiều cao", 15, 55],
                ["topPercent", "Cách mép trên", 35, 85],
                ["xPercent", "Vị trí ngang", 10, 90],
                ["gapPercent", "Khoảng cách", 0, 10]
              ] as const).map(([key, label, min, max]) => (
                <label key={key}>{label} <b>{project.illustrations.layout[key]}%</b>
                  <input type="range" min={min} max={max} value={project.illustrations.layout[key]} onChange={(event) => mutateProject((draft) => { draft.illustrations.layout[key] = Number(event.target.value); })} />
                </label>
              ))}
            </div>
            <label>Chế độ hiển thị
              <select value={project.illustrations.layout.fit} onChange={(event) => mutateProject((draft) => { draft.illustrations.layout.fit = event.target.value as "cover" | "contain"; })}>
                <option value="cover">Cover · phủ đầy vùng</option>
                <option value="contain">Contain · thấy toàn bộ video</option>
              </select>
            </label>
          </section>

          <section className="settings-section sound-effects-section">
            <div className="section-title-row"><h3>Sound effect tự động</h3><span>{project.soundEffects.events.length}/{project.comments.length} cảnh</span></div>
            <label className="toggle-row">
              <input type="checkbox" checked={project.soundEffects.enabled} onChange={(event) => mutateProject((draft) => { draft.soundEffects.enabled = event.target.checked; })} />
              Bật sound effect trong preview và video xuất
            </label>
            {isAutoWorkspace && <div className="appearance-sound-card">
              <label className="toggle-row"><input type="checkbox" checked={project.soundEffects.appearance.enabled} onChange={(event) => mutateProject((draft) => { draft.soundEffects.appearance.enabled = event.target.checked; })} /> Âm khi comment xuất hiện</label>
              <p>Comment đầu tiên: <strong>tununuuuu</strong><br />Các comment sau và comment con: <strong>mouse click</strong><br />Hội thoại chỉ dùng âm ding.</p>
              <div className="slider-row"><label>Âm lượng <b>{Math.round(project.soundEffects.appearance.volume * 100)}%</b><input type="range" min="0.05" max="1" step="0.05" value={project.soundEffects.appearance.volume} onChange={(event) => mutateProject((draft) => { draft.soundEffects.appearance.volume = Number(event.target.value); })} /></label></div>
              {introAppearanceAsset && nextAppearanceAsset ? <div className="appearance-audio-grid">
                <div><small>Comment đầu</small><audio className="audio-player" controls src={mediaUrl(project.id, introAppearanceAsset.relativePath)} /></div>
                <div><small>Comment sau</small><audio className="audio-player" controls src={mediaUrl(project.id, nextAppearanceAsset.relativePath)} /></div>
              </div> : <button className="wide-action" onClick={() => void ensureAppearanceSounds()} disabled={busy === "appearance-sounds"}>{busy === "appearance-sounds" ? "Đang tải…" : "Tải 2 âm xuất hiện từ MyInstants"}</button>}
            </div>}
            <div className="slider-row">
              <label>Âm lượng chung <b>{Math.round(project.soundEffects.volume * 100)}%</b>
                <input aria-label="Âm lượng sound effect" type="range" min="0" max="0.6" step="0.01" value={project.soundEffects.volume} onChange={(event) => mutateProject((draft) => { draft.soundEffects.volume = Number(event.target.value); })} />
              </label>
            </div>
            <button className="wide-action variety-button" onClick={() => void autoAssignSoundEffects()} disabled={busy === "sound-effects-all" || !project.comments.length}>
              {busy === "sound-effects-all" ? "Đang tìm và tải SFX…" : "Tự chọn SFX cho các cảnh còn thiếu"}
            </button>
            <p className="provider-notice offline">Ứng dụng chỉ gửi từ khóa hiệu ứng chung sang MyInstants, không gửi nguyên văn comment. MP3 được lưu cache local và không tải lại nếu đã có.</p>
            {selected && (
              <div className="assignment-box">
                <strong>SFX comment {commentLabels.get(selected.id) ?? selected.order}</strong>
                {selectedSoundEvent && selectedSoundAsset ? (
                  <>
                    <span>{selectedSoundAsset.title}</span>
                    <small>{selectedSoundEvent.reason} · {selectedSoundAsset.duration.toFixed(1)} giây</small>
                    <audio className="audio-player" controls src={mediaUrl(project.id, selectedSoundAsset.relativePath)} />
                    <div className="slider-row two-column">
                      <label>Âm lượng riêng <b>{Math.round(selectedSoundEvent.volume * 100)}%</b><input type="range" min="0" max="2" step="0.05" value={selectedSoundEvent.volume} onChange={(event) => mutateProject((draft) => { draft.soundEffects.events.find((item) => item.id === selectedSoundEvent.id)!.volume = Number(event.target.value); })} /></label>
                      <label>Vào sau <b>{selectedSoundEvent.offsetSeconds.toFixed(2)} giây</b><input type="range" min="0" max="2" step="0.05" value={selectedSoundEvent.offsetSeconds} onChange={(event) => mutateProject((draft) => { draft.soundEffects.events.find((item) => item.id === selectedSoundEvent.id)!.offsetSeconds = Number(event.target.value); })} /></label>
                    </div>
                    <label className="toggle-row"><input type="checkbox" checked={selectedSoundEvent.locked} onChange={(event) => mutateProject((draft) => { draft.soundEffects.events.find((item) => item.id === selectedSoundEvent.id)!.locked = event.target.checked; })} /> Khóa SFX này khi tự chọn hàng loạt</label>
                    {/^https:\/\//i.test(selectedSoundAsset.sourcePageUrl) && <a href={selectedSoundAsset.sourcePageUrl} target="_blank" rel="noreferrer">Mở trang nguồn trên MyInstants</a>}
                    <div className="inline-actions">
                      <button onClick={() => void autoAssignSoundEffects(selected.id)} disabled={busy === "sound-effect-one"}>Đổi SFX khác</button>
                      <button className="danger" onClick={() => mutateProject((draft) => { draft.soundEffects.events = draft.soundEffects.events.filter((event) => event.commentId !== selected.id); })}>Gỡ SFX</button>
                    </div>
                  </>
                ) : (
                  <button className="wide-action" onClick={() => void autoAssignSoundEffects(selected.id)} disabled={busy === "sound-effect-one"}>Tự chọn SFX cho comment này</button>
                )}
              </div>
            )}
          </section>

          <section className="settings-section">
            <div className="section-title-row"><h3>Nhạc nền</h3><span>{formatTime(project.music.duration)}</span></div>
            <button className="file-picker" onClick={() => musicInput.current?.click()} disabled={busy === "music"}>
              <span className="file-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg></span><span><strong>{project.music.asset?.originalName ?? "Chọn file nhạc"}</strong><small>MP3, WAV, M4A, AAC, FLAC hoặc OGG</small></span><b>{project.music.asset ? "Thay" : "Chọn"}</b>
            </button>
            {project.music.asset && (
              <>
                <audio className="audio-player" controls src={mediaUrl(project.id, project.music.asset.relativePath)} />
                <label className="toggle-row"><input type="checkbox" checked={project.music.enabled} onChange={(event) => mutateProject((draft) => { draft.music.enabled = event.target.checked; })} /> Bật nhạc nền</label>
                <div className="slider-row">
                  <label>Âm lượng <b>{Math.round(project.music.volume * 100)}%</b>
                    <input type="range" min="0" max="0.5" step="0.01" value={project.music.volume} onChange={(event) => mutateProject((draft) => { draft.music.volume = Number(event.target.value); })} />
                  </label>
                  <label>Fade in <b>{project.music.fadeIn.toFixed(1)} giây</b>
                    <input type="range" min="0" max="5" step="0.1" value={project.music.fadeIn} onChange={(event) => mutateProject((draft) => { draft.music.fadeIn = Number(event.target.value); })} />
                  </label>
                  <label>Fade out <b>{project.music.fadeOut.toFixed(1)} giây</b>
                    <input type="range" min="0" max="5" step="0.1" value={project.music.fadeOut} onChange={(event) => mutateProject((draft) => { draft.music.fadeOut = Number(event.target.value); })} />
                  </label>
                </div>
                <label className="toggle-row"><input type="checkbox" checked={project.music.ducking} onChange={(event) => mutateProject((draft) => { draft.music.ducking = event.target.checked; })} /> Tự hạ nhạc khi có giọng đọc</label>
                <button className="wide-action danger-action" onClick={() => void removeMusic()}>Gỡ nhạc nền</button>
              </>
            )}
          </section>

          <section className="settings-section branding-section">
            <div className="section-title-row"><h3>Watermark & logo kênh</h3><span>Lớp phủ</span></div>
            <div className="branding-card">
              <label className="toggle-row"><input type="checkbox" checked={project.branding.watermark.enabled} onChange={(event) => mutateProject((draft) => { draft.branding.watermark.enabled = event.target.checked; })} /> Bật watermark chữ</label>
              <label>Nội dung watermark
                <input
                  aria-label="Nội dung watermark"
                  type="text"
                  maxLength={120}
                  placeholder="Ví dụ: @tenkenh"
                  value={project.branding.watermark.text}
                  onChange={(event) => mutateProject((draft) => { draft.branding.watermark.text = event.target.value; })}
                />
              </label>
              <div className="slider-row two-column">
                <label>Độ mờ <b>{Math.round(project.branding.watermark.opacity * 100)}%</b><input aria-label="Độ mờ watermark" type="range" min="0.05" max="1" step="0.05" value={project.branding.watermark.opacity} onChange={(event) => mutateProject((draft) => { draft.branding.watermark.opacity = Number(event.target.value); })} /></label>
                <label>Cỡ chữ <b>{project.branding.watermark.fontSize}px</b><input type="range" min="18" max="96" step="2" value={project.branding.watermark.fontSize} onChange={(event) => mutateProject((draft) => { draft.branding.watermark.fontSize = Number(event.target.value); })} /></label>
                <label>Vị trí ngang <b>{project.branding.watermark.xPercent.toFixed(0)}%</b><input type="range" min="5" max="95" value={project.branding.watermark.xPercent} onChange={(event) => mutateProject((draft) => { draft.branding.watermark.xPercent = Number(event.target.value); })} /></label>
                <label>Vị trí dọc <b>{project.branding.watermark.yPercent.toFixed(0)}%</b><input type="range" min="5" max="95" value={project.branding.watermark.yPercent} onChange={(event) => mutateProject((draft) => { draft.branding.watermark.yPercent = Number(event.target.value); })} /></label>
              </div>
            </div>
            <div className="branding-card">
              <label className="toggle-row"><input type="checkbox" checked={project.branding.logo.enabled} disabled={!project.branding.logo.asset} onChange={(event) => mutateProject((draft) => { draft.branding.logo.enabled = event.target.checked; })} /> Bật logo kênh</label>
              <button className="file-picker" onClick={() => logoInput.current?.click()} disabled={busy === "logo"}>
                <span>◎</span><span><strong>{project.branding.logo.asset?.originalName ?? "Thêm logo kênh"}</strong><small>PNG trong suốt, JPEG hoặc WebP</small></span><b>{project.branding.logo.asset ? "Thay" : "Chọn"}</b>
              </button>
              {project.branding.logo.asset && <>
                <p className="provider-notice offline">Kéo logo trực tiếp trên khung xem trước hoặc dùng thanh vị trí bên dưới.</p>
                <div className="slider-row two-column">
                  <label>Độ mờ <b>{Math.round(project.branding.logo.opacity * 100)}%</b><input aria-label="Độ mờ logo" type="range" min="0.05" max="1" step="0.05" value={project.branding.logo.opacity} onChange={(event) => mutateProject((draft) => { draft.branding.logo.opacity = Number(event.target.value); })} /></label>
                  <label>Kích thước <b>{project.branding.logo.widthPercent}%</b><input aria-label="Kích thước logo" type="range" min="5" max="40" value={project.branding.logo.widthPercent} onChange={(event) => mutateProject((draft) => { draft.branding.logo.widthPercent = Number(event.target.value); })} /></label>
                  <label>Vị trí ngang <b>{project.branding.logo.xPercent.toFixed(0)}%</b><input aria-label="Vị trí ngang logo" type="range" min="3" max="97" value={project.branding.logo.xPercent} onChange={(event) => mutateProject((draft) => { draft.branding.logo.xPercent = Number(event.target.value); })} /></label>
                  <label>Vị trí dọc <b>{project.branding.logo.yPercent.toFixed(0)}%</b><input aria-label="Vị trí dọc logo" type="range" min="3" max="97" value={project.branding.logo.yPercent} onChange={(event) => mutateProject((draft) => { draft.branding.logo.yPercent = Number(event.target.value); })} /></label>
                </div>
                <button className="wide-action danger-action" onClick={() => void removeLogo()}>Gỡ logo kênh</button>
              </>}
            </div>
          </section>

          {isAutoWorkspace && selected && <section className="settings-section conversation-settings auto-content-image-section">
            <div className="section-title-row"><h3>Ảnh nội dung sau comment</h3><span>{selected.attachment ? (attachmentContentType(selected.attachment) === "text" ? `${selected.attachment.textBlocks.length} đoạn chữ` : "Không đọc") : "Tự động"}</span></div>
            <button className="file-picker" onClick={() => contentImageInput.current?.click()} disabled={busy === "content-image-ocr"}>
              <span>▧</span><span><strong>{selected.attachment?.asset.originalName ?? "Thêm ảnh nội dung"}</strong><small>Tự phân loại ảnh chữ, ảnh minh họa hoặc hội thoại</small></span><b>{selected.attachment ? "Thay" : "Chọn"}</b>
            </button>
            {!selected.attachment && !selected.conversation && <p className="provider-notice offline">Tool đọc comment trước, sau đó mới hiện ảnh với tiếng click. Ảnh không chữ chỉ hiện; ảnh có chữ sẽ được đọc từ trên xuống, trái sang phải.</p>}
            {selected.attachment && <>
              <img className="conversation-thumbnail" src={mediaUrl(project.id, selected.attachment.asset.relativePath)} alt="Ảnh nội dung đã nhập" />
              <p className="provider-notice offline">Tự nhận dạng: <b>{selected.attachment.detectedType === "text" ? "ảnh có chữ" : "ảnh minh họa, không đọc"}</b> · độ tin cậy {Math.round(selected.attachment.classificationConfidence * 100)}%. Chữ OCR gốc luôn được giữ để bạn đối chiếu.</p>
              <label>Cách xử lý ảnh
                <select value={selected.attachment.mode} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.attachment!.mode = event.target.value as "auto" | "illustration" | "text"; })}>
                  <option value="auto">Tự động theo kết quả nhận dạng</option>
                  <option value="illustration">Ảnh minh họa — không đọc chữ</option>
                  <option value="text">Ảnh có chữ — đọc theo thứ tự</option>
                </select>
              </label>
              <div className="slider-row">
                <label>Giữ ảnh sau khi đọc <b>{selected.attachment.holdAfterSeconds.toFixed(1)} giây</b><input type="range" min="0" max="5" step="0.1" value={selected.attachment.holdAfterSeconds} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.attachment!.holdAfterSeconds = Number(event.target.value); })} /></label>
              </div>
              <label className="toggle-row"><input type="checkbox" checked={selected.attachment.clickEnabled} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.attachment!.clickEnabled = event.target.checked; })} /> Phát tiếng click khi chuyển sang ảnh</label>
              {attachmentContentType(selected.attachment) === "text" && <div className="conversation-message-list">
                {selected.attachment.textBlocks.slice().sort((a, b) => a.order - b.order).map((block) => <article className="conversation-message-card" key={block.id}>
                  <div className="conversation-message-head"><strong>Đoạn {block.order}</strong><span>{Math.round(block.confidence * 100)}%</span></div>
                  <label>OCR gốc<textarea value={block.text} onChange={(event) => mutateProject((draft) => {
                    const target = draft.comments.find((item) => item.id === selected.id)!.attachment!.textBlocks.find((item) => item.id === block.id)!;
                    target.text = event.target.value;
                    target.speechText = normalizeSpeechText(event.target.value);
                  })} /></label>
                  <label>Nội dung sẽ đọc<textarea value={block.speechText} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.attachment!.textBlocks.find((item) => item.id === block.id)!.speechText = event.target.value; })} /></label>
                  <small className={`status ${block.audioStatus}`}>{statusText[block.audioStatus]}</small>
                </article>)}
              </div>}
              {selected.attachment.mode === "text" && !selected.attachment.textBlocks.length && <p className="provider-notice warning">OCR chưa thấy chữ. Hãy thay ảnh rõ hơn hoặc dùng phần hội thoại bên dưới để nhập thủ công.</p>}
            </>}
          </section>}

          {selected && <section className="settings-section conversation-settings">
            <div className="section-title-row"><h3>Hội thoại trong ảnh</h3><span>{selected.conversation?.messages.length ?? 0} tin</span></div>
            <button className="file-picker" onClick={() => conversationInput.current?.click()} disabled={busy === "conversation-ocr"}>
              <span>▤</span><span><strong>{selected.conversation?.image.originalName ?? "Thêm ảnh hội thoại"}</strong><small>OCR local bằng Apple Vision · có thể sửa lại text</small></span><b>{selected.conversation ? "Thay" : "Chọn"}</b>
            </button>
            {!selected.conversation && <p className="provider-notice offline">Thêm ảnh chat của hai người. Tool sẽ nhận dạng từng tin, phân bên trái/phải và tạo danh sách chỉnh sửa.</p>}
            {selected.conversation && <>
              <img className="conversation-thumbnail" src={mediaUrl(project.id, selected.conversation.image.relativePath)} alt="Ảnh hội thoại đã nhập" />
              <p className="provider-notice offline">OCR: {selected.conversation.ocrLanguage ?? "tự động"} · Ảnh chỉ xử lý trên máy Mac, không tải lên dịch vụ ngoài.</p>
              <div className="choice-grid">
                <button className={selected.conversation.mode === "replace" ? "selected" : ""} onClick={() => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.mode = "replace"; })}>Thay nội dung đọc<small>Chỉ đọc các tin nhắn</small></button>
                <button className={selected.conversation.mode === "after-comment" ? "selected" : ""} onClick={() => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.mode = "after-comment"; })}>Đọc sau comment<small>Đọc phần chính trước</small></button>
              </div>
              <label>Hiệu ứng hiển thị
                <select value={selected.conversation.revealMode} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.revealMode = event.target.value as "step" | "scroll"; })}>
                  <option value="scroll">Mở và cuộn theo lời đọc</option>
                  <option value="step">Hiện từng tin không chuyển động</option>
                </select>
              </label>
              <div className="slider-row two-column">
                <label>Giọng Người A
                  <select value={selected.conversation.speakerAVoiceId} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.speakerAVoiceId = event.target.value; })}>
                    {voices.map((voice) => <option key={`a-${voice.id}`} value={voice.id}>{voice.name}</option>)}
                  </select>
                </label>
                <label>Giọng Người B
                  <select value={selected.conversation.speakerBVoiceId} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.speakerBVoiceId = event.target.value; })}>
                    {voices.map((voice) => <option key={`b-${voice.id}`} value={voice.id}>{voice.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="conversation-ding-card">
                <label className="toggle-row"><input type="checkbox" checked={selected.conversation.dingEnabled} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.dingEnabled = event.target.checked; })} /> Phát “ding” khi tin nhắn xuất hiện</label>
                <div className="slider-row two-column">
                  <label>Âm lượng <b>{Math.round(selected.conversation.dingVolume * 100)}%</b><input type="range" min="0.05" max="1" step="0.05" value={selected.conversation.dingVolume} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.dingVolume = Number(event.target.value); })} /></label>
                  <label>Đọc sau ding <b>{selected.conversation.dingLeadSeconds.toFixed(2)} giây</b><input type="range" min="0" max="0.5" step="0.05" value={selected.conversation.dingLeadSeconds} onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.conversation!.dingLeadSeconds = Number(event.target.value); })} /></label>
                </div>
                {selected.conversation.dingAssetId ? <>
                  {previewDingAsset && <audio className="audio-player" controls src={mediaUrl(project.id, previewDingAsset.relativePath)} />}
                  <a className="source-link" href="https://www.myinstants.com/fr/instant/ding-sound-effect/" target="_blank" rel="noreferrer">Nguồn ding: MyInstants ↗</a>
                </> : <button className="wide-action" onClick={() => void ensureConversationDing()} disabled={busy === "conversation-ding"}>Tải âm ding từ MyInstants</button>}
              </div>
              <div className="conversation-message-list">
                {selected.conversation.messages.slice().sort((a, b) => a.order - b.order).map((chatMessage, messageIndex) => (
                  <article className="conversation-message-card" key={chatMessage.id}>
                    <div className="conversation-message-head">
                      <strong>Tin {messageIndex + 1}</strong>
                      <select aria-label={`Người nói tin ${messageIndex + 1}`} value={chatMessage.speaker} onChange={(event) => mutateProject((draft) => {
                        draft.comments.find((item) => item.id === selected.id)!.conversation!.messages.find((item) => item.id === chatMessage.id)!.speaker = event.target.value as "a" | "b" | "system";
                      })}>
                        <option value="a">Người A · trái</option><option value="b">Người B · phải</option><option value="system">Hệ thống</option>
                      </select>
                      <span className={`ocr-confidence ${chatMessage.confidence < 0.7 ? "low" : ""}`}>{Math.round(chatMessage.confidence * 100)}%</span>
                    </div>
                    <textarea rows={3} value={chatMessage.text} onChange={(event) => mutateProject((draft) => {
                      draft.comments.find((item) => item.id === selected.id)!.conversation!.messages.find((item) => item.id === chatMessage.id)!.text = event.target.value;
                    })} />
                    <div className="conversation-message-actions">
                      <button disabled={messageIndex === 0} onClick={() => mutateProject((draft) => {
                        const messages = draft.comments.find((item) => item.id === selected.id)!.conversation!.messages.sort((a, b) => a.order - b.order);
                        [messages[messageIndex - 1]!.order, messages[messageIndex]!.order] = [messages[messageIndex]!.order, messages[messageIndex - 1]!.order];
                      })}>↑</button>
                      <button disabled={messageIndex === selected.conversation!.messages.length - 1} onClick={() => mutateProject((draft) => {
                        const messages = draft.comments.find((item) => item.id === selected.id)!.conversation!.messages.sort((a, b) => a.order - b.order);
                        [messages[messageIndex + 1]!.order, messages[messageIndex]!.order] = [messages[messageIndex]!.order, messages[messageIndex + 1]!.order];
                      })}>↓</button>
                      <button className="danger" onClick={() => mutateProject((draft) => {
                        const conversation = draft.comments.find((item) => item.id === selected.id)!.conversation!;
                        conversation.messages = conversation.messages.filter((item) => item.id !== chatMessage.id).map((item, index) => ({ ...item, order: index + 1 }));
                      })}>Xóa</button>
                      <button onClick={() => void generateConversationMessage(chatMessage.id)} disabled={!chatMessage.text.trim() || busy === `conversation-message-${chatMessage.id}`}>{chatMessage.audioStatus === "ready" ? "Tạo lại giọng" : "Tạo giọng"}</button>
                    </div>
                    {chatMessage.audioPath && <audio className="audio-player" controls src={mediaUrl(project.id, chatMessage.audioPath)} />}
                    <span className={`status ${chatMessage.audioStatus}`}>{statusText[chatMessage.audioStatus]} · {formatTime(chatMessage.audioDuration)}</span>
                  </article>
                ))}
              </div>
              <button className="wide-action" onClick={() => mutateProject((draft) => {
                const conversation = draft.comments.find((item) => item.id === selected.id)!.conversation!;
                const order = conversation.messages.length + 1;
                conversation.messages.push({ id: crypto.randomUUID(), order, speaker: order % 2 ? "a" : "b", text: "", box: { x: 0.15, y: Math.min(0.9, 0.15 + order * 0.08), width: 0.7, height: 0.06 }, confidence: 1, audioStatus: "missing" });
              })}>＋ Thêm tin nhắn thủ công</button>
              <button className="primary full" onClick={() => void generateAudio(selected.id)} disabled={!selected.conversation.messages.length || busy === selected.id}>Tạo tất cả giọng hội thoại</button>
              <button className="wide-action danger-action" onClick={() => void removeConversation()}>Gỡ ảnh hội thoại</button>
            </>}
          </section>}

          {selected && <section className="settings-section">
            <div className="section-title-row"><h3>{isAutoWorkspace ? "Nội dung comment gốc" : "Nội dung đọc"}</h3><span>{selected.text.length} ký tự</span></div>
            <textarea
              rows={5}
              placeholder={isAutoWorkspace ? "Nhập nội dung comment gốc…" : "Nhập chính xác nội dung AI sẽ đọc…"}
              value={selected.text}
              onChange={(event) => mutateProject((draft) => {
                const comment = draft.comments.find((item) => item.id === selected.id)!;
                comment.text = event.target.value;
                if (isAutoWorkspace) comment.speechText = normalizeSpeechText(event.target.value);
              })}
            />
            {isAutoWorkspace && <><div className="section-title-row narration-heading"><h3>Nội dung đọc cho TTS</h3><button onClick={() => mutateProject((draft) => {
              const comment = draft.comments.find((item) => item.id === selected.id)!;
              comment.speechText = normalizeSpeechText(comment.text);
            })}>Chuẩn hóa & lọc an toàn</button></div>
            <textarea
              rows={4}
              placeholder="Tool sẽ sửa teencode, bỏ biểu tượng, rút gọn dấu lặp và làm dịu từ nhạy cảm…"
              value={selected.speechText ?? normalizeSpeechText(selected.text)}
              onChange={(event) => mutateProject((draft) => { draft.comments.find((item) => item.id === selected.id)!.speechText = event.target.value; })}
            />
            <p className="provider-notice online">Nội dung gốc được giữ nguyên. Từ tục được đổi thành “bíp”; cụm nhạy cảm được diễn đạt trung tính trước khi tạo giọng đọc.</p>
            {!normalizeSpeechText(selected.speechText ?? selected.text) && <p className="field-error">Không có chữ để đọc sau khi bỏ sticker, emoji và icon.</p>}</>}
            <div className="inline-actions">
              <button onClick={duplicateSelected}>Nhân bản</button>
              <button className="danger" onClick={deleteSelected}>Xóa</button>
            </div>
          </section>}

          <section className="settings-section">
            <h3>Giọng đọc</h3>
            <label>Nhà cung cấp
              <select
                value={providerId}
                onChange={(event) => mutateProject((draft) => {
                  const value = event.target.value as TtsProviderId;
                  if (selected) draft.comments.find((item) => item.id === selected.id)!.provider = value;
                  else draft.settings.defaultProvider = value;
                })}
              >
                {providers.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.name}{item.available ? "" : " — chưa sẵn sàng"}</option>)}
              </select>
            </label>
            <label>Giọng tiếng Việt
              <select
                value={activeVoice(project, selected) ?? ""}
                disabled={voicesLoading || !voices.length}
                onChange={(event) => mutateProject((draft) => {
                  if (selected) draft.comments.find((item) => item.id === selected.id)!.voiceId = event.target.value;
                  else draft.settings.defaultVoiceId = event.target.value;
                })}
              >
                {!voices.length && <option value="">{voicesLoading
                  ? "Đang tải danh sách giọng…"
                  : voicesError
                    ? "Chưa tải được danh sách giọng"
                    : "Chưa có giọng phù hợp"}</option>}
                {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.gender ?? voice.locale}</option>)}
              </select>
            </label>
            {voicesError && <div className="voice-inline-error" role="alert">
              <span>{voicesError}</span>
              <button onClick={() => void refreshTtsProviders().catch((voiceError) => setVoicesError(voiceError instanceof Error ? voiceError.message : "Không tải được danh sách giọng."))}>Thử lại</button>
            </div>}
            <p className={`provider-notice ${provider?.online ? "online" : "offline"}`}>{provider?.online ? "Kết nối mạng" : "Xử lý trên máy"} · {provider?.notice}</p>
            <div className="voice-one-for-all">
              <div>
                <strong>Áp dụng giọng đọc cho toàn bộ comment</strong>
                <small title={`${provider?.name ?? "Chưa chọn nhà cung cấp"} · ${selectedVoice?.name ?? "Chưa chọn giọng"}`}>{provider?.name ?? "Chưa chọn nhà cung cấp"} · {selectedVoice?.name ?? "Chưa chọn giọng"}</small>
              </div>
              <button className="accent" onClick={assignSelectedVoiceToAllComments} disabled={!project.comments.length || voicesLoading || !selectedVoice}>Áp dụng cho tất cả</button>
            </div>
            <div className={`voice-studio-card ${voiceStudioProvider?.available ? "ready" : "offline"}`}>
              <div className="voice-studio-heading">
                <div>
                  <strong>VoiceStudio Local</strong>
                  <small>{voiceStudioProvider?.available
                    ? `${providerId === "voicestudio" ? voices.length : "Kho"} voice profile sẵn sàng`
                    : "Chưa kết nối cổng 3900"}</small>
                </div>
                <span>{voiceStudioProvider?.available ? "Đã kết nối" : "Tùy chọn"}</span>
              </div>
              <p>{voiceStudioProvider?.available
                ? "Có thể dùng một giọng riêng cho từng comment mà không cần mở thêm giao diện trong lúc dựng video."
                : (voiceStudioProvider?.error ?? "Mở backend VoiceStudio trên máy rồi kiểm tra lại kết nối.")}</p>
              {providerId === "voicestudio" && voices.length > 0 && <div className="voice-profile-preview" aria-label="Voice profile đã tải">
                {voices.slice(0, 5).map((voice) => <span key={voice.id}>{voice.name}</span>)}
                {voices.length > 5 && <span>+{voices.length - 5}</span>}
              </div>}
              <div className="voice-studio-actions">
                <button onClick={() => void refreshTtsProviders().catch((voiceError) => setVoicesError(voiceError instanceof Error ? voiceError.message : "Không tải được danh sách giọng."))} disabled={voicesLoading}>{voicesLoading ? "Đang kiểm tra…" : "Kiểm tra lại"}</button>
                {voiceStudioProvider?.available && providerId !== "voicestudio" && <button className="accent" onClick={() => mutateProject((draft) => {
                  if (selected) draft.comments.find((item) => item.id === selected.id)!.provider = "voicestudio";
                  else draft.settings.defaultProvider = "voicestudio";
                })}>Dùng VoiceStudio</button>}
                {providerId === "voicestudio" && <button className="accent" onClick={assignDiverseVoiceStudioVoices} disabled={voices.length < 2}>Phân giọng đa dạng</button>}
              </div>
              <a href="https://github.com/debpalash/VoiceStudio/blob/main/docs/install/macos.md" target="_blank" rel="noreferrer">Hướng dẫn cài VoiceStudio cho macOS ↗</a>
            </div>
            {providerId === "elevenlabs" && (
              <div className="api-key-row">
                <input type="password" placeholder="ElevenLabs API key" value={elevenKey} onChange={(event) => setElevenKey(event.target.value)} />
                <button onClick={() => void api<void>("/api/settings/elevenlabs-key", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: elevenKey }) }).then(() => { setElevenKey(""); setMessage("Đã lưu API key vào Keychain"); }).catch(reportError)}>Lưu</button>
              </div>
            )}
            <div className="slider-row">
              <label>Tốc độ <b>{(selected?.rate ?? project.settings.defaultRate).toFixed(2)}×</b>
                <input type="range" min="0.7" max="1.3" step="0.05" value={selected?.rate ?? project.settings.defaultRate} onChange={(event) => mutateProject((draft) => {
                  const value = Number(event.target.value);
                  if (selected) draft.comments.find((item) => item.id === selected.id)!.rate = value;
                  else draft.settings.defaultRate = value;
                })} />
              </label>
              <label>Nghỉ sau câu <b>{(selected?.pauseAfter ?? project.settings.defaultPauseAfter).toFixed(1)} giây</b>
                <input type="range" min="0" max="2" step="0.1" value={selected?.pauseAfter ?? project.settings.defaultPauseAfter} onChange={(event) => mutateProject((draft) => {
                  const value = Number(event.target.value);
                  if (selected) draft.comments.find((item) => item.id === selected.id)!.pauseAfter = value;
                  else draft.settings.defaultPauseAfter = value;
                })} />
                <small>Đặt 0 để chuyển ảnh ngay khi giọng đọc kết thúc.</small>
              </label>
              {provider?.supportsPitch && <label>Cao độ <b>{selected?.pitch ?? project.settings.defaultPitch} Hz</b>
                <input type="range" min="-50" max="50" step="5" value={selected?.pitch ?? project.settings.defaultPitch} onChange={(event) => mutateProject((draft) => {
                  const value = Number(event.target.value);
                  if (selected) draft.comments.find((item) => item.id === selected.id)!.pitch = value;
                  else draft.settings.defaultPitch = value;
                })} />
              </label>}
            </div>
            <button className="wide-action media-randomize" onClick={() => setShowBatchVoice(true)} disabled={!project.comments.length}>Áp dụng thông số giọng cho tất cả comment</button>
            {(isAutoWorkspace
              ? project.comments.some((comment) => comment.audioStatus !== "ready")
              : project.comments.some((comment) => comment.audioStatus === "stale")) && <button className="primary full" onClick={() => void generateAudio()} disabled={busy === "all-audio"}>{isAutoWorkspace ? "Tạo giọng đọc còn thiếu hoặc bị lỗi" : "Tạo lại tất cả giọng đọc cần cập nhật"}</button>}
            {selected && <button className="primary full" onClick={() => void generateAudio(selected.id)} disabled={(isAutoWorkspace
              ? !normalizeSpeechText(selected.speechText ?? selected.text) && !selected.conversation?.messages.some((item) => normalizeSpeechText(item.text)) && !selected.attachment?.textBlocks.some((block) => normalizeSpeechText(block.speechText || block.text))
              : !selected.text.trim() && !selected.conversation?.messages.some((item) => item.text.trim())) || busy === selected.id}>{selected.audioStatus === "ready" ? "Tạo lại giọng đọc" : "Tạo giọng đọc"}</button>}
            {selected?.audioStatus === "error" && providerId === "edge" && providers.some((item) => item.id === "macos" && item.available) && <button className="wide-action macos-fallback-button" onClick={() => mutateProject((draft) => {
              const comment = draft.comments.find((item) => item.id === selected.id)!;
              comment.provider = "macos";
              comment.voiceId = undefined;
              comment.audioStatus = "stale";
              comment.error = undefined;
              setMessage("Đã chuyển comment sang giọng macOS. Chọn giọng rồi bấm Tạo giọng đọc.");
            })}>Chuyển comment này sang giọng macOS</button>}
            {selected?.error && <p className="field-error">{selected.error}</p>}
            {selected?.audioPath && <audio className="audio-player" controls src={mediaUrl(project.id, selected.audioPath)} />}
          </section>

          <section className="settings-section">
            <h3>Bố cục ảnh</h3>
            <label className="toggle-row"><input type="checkbox" checked={project.settings.smartLayout.enabled} onChange={(event) => mutateProject((draft) => {
              draft.settings.smartLayout.enabled = event.target.checked;
              draft.settings.smartLayout.mode = event.target.checked ? "auto" : "manual";
            })} /> Smart Auto Layout</label>
            <div className="choice-grid">
              {(["auto", "manual"] as const).map((mode) => <button key={mode} className={project.settings.smartLayout.mode === mode ? "selected" : ""} onClick={() => mutateProject((draft) => {
                draft.settings.smartLayout.mode = mode;
                draft.settings.smartLayout.enabled = mode === "auto";
              })}>{mode === "auto" ? "Tự động" : "Thủ công"}<small>{mode === "auto" ? "Căn theo chiều cao từng ảnh" : "Dùng tọa độ cố định"}</small></button>)}
            </div>
            {project.settings.smartLayout.mode === "auto" ? <div className="slider-row two-column">
              <label>Khoảng cách <b>{project.settings.smartLayout.gapPixels}px</b><input type="range" min="16" max="100" step="2" value={project.settings.smartLayout.gapPixels} onChange={(event) => mutateProject((draft) => { draft.settings.smartLayout.gapPixels = Number(event.target.value); })} /></label>
              <label>Vùng an toàn trên <b>{project.settings.smartLayout.safeTopPercent}%</b><input type="range" min="0" max="20" value={project.settings.smartLayout.safeTopPercent} onChange={(event) => mutateProject((draft) => { draft.settings.smartLayout.safeTopPercent = Number(event.target.value); })} /></label>
              <label>Vùng an toàn dưới <b>{project.settings.smartLayout.safeBottomPercent}%</b><input type="range" min="0" max="25" value={project.settings.smartLayout.safeBottomPercent} onChange={(event) => mutateProject((draft) => { draft.settings.smartLayout.safeBottomPercent = Number(event.target.value); })} /></label>
              <button className="wide-action" onClick={() => mutateProject((draft) => { draft.settings.smartLayout = { enabled: true, mode: "auto", gapPixels: 40, safeTopPercent: 8, safeBottomPercent: 12 }; })}>Đặt lại bố cục tự động</button>
            </div> : <div className="slider-row two-column">
              {([
                ["widthPercent", "Chiều rộng", 40, 100, "%"],
                ["topPercent", "Cách mép trên", 0, 50, "%"],
                ["xPercent", "Vị trí ngang", 10, 90, "%"],
                ["maxHeightPercent", "Chiều cao tối đa", 20, 90, "%"]
              ] as const).map(([key, label, min, max, unit]) => (
                <label key={key}>{label} <b>{project.settings.overlay[key]}{unit}</b>
                  <input type="range" min={min} max={max} value={project.settings.overlay[key]} onChange={(event) => mutateProject((draft) => { draft.settings.overlay[key] = Number(event.target.value); })} />
                </label>
              ))}
            </div>}
          </section>

          <section className="settings-section">
            <h3>Xuất video</h3>
            <div className="choice-grid">
              {(["1080x1920", "720x1280"] as const).map((value) => <button key={value} className={project.settings.export.resolution === value ? "selected" : ""} onClick={() => mutateProject((draft) => { draft.settings.export.resolution = value; })}>{value}<small>{value === "1080x1920" ? "Chất lượng cao" : "Render thử nhanh"}</small></button>)}
            </div>
            <label>Bộ mã hóa
              <select value={project.settings.export.encoder} onChange={(event) => mutateProject((draft) => { draft.settings.export.encoder = event.target.value as "libx264" | "h264_videotoolbox"; })}>
                <option value="libx264">H.264 chất lượng ổn định</option>
                <option value="h264_videotoolbox">Apple Silicon tăng tốc</option>
              </select>
            </label>
          </section>

          <section className="settings-section tiktok-publishing-section" aria-labelledby="tiktok-publishing-title">
            <div className="section-title-row">
              <div><span className="panel-kicker">SAU KHI XUẤT</span><h3 id="tiktok-publishing-title">Đăng TikTok tự động</h3></div>
              <label className="switch-control"><input aria-label="Bật tự đăng TikTok sau khi xuất" type="checkbox" checked={project.settings.tiktok.enabled} onChange={(event) => mutateProject((draft) => { draft.settings.tiktok.enabled = event.target.checked; })} /><span aria-hidden="true" /></label>
            </div>
            <p className="muted">Mỗi project nhớ một hồ sơ Chrome thật. Tool không đọc hoặc sao chép mật khẩu và cookie.</p>
            {project.settings.tiktok.enabled && <div className="tiktok-publishing-fields">
              <label>Hồ sơ Chrome đã đăng nhập TikTok
                <select value={project.settings.tiktok.chromeProfileDirectory ?? ""} onChange={(event) => {
                  const profile = chromeProfiles.find((candidate) => candidate.directory === event.target.value);
                  mutateProject((draft) => {
                    draft.settings.tiktok.chromeProfileDirectory = profile?.directory;
                    draft.settings.tiktok.chromeProfileName = profile?.name;
                  });
                  setTikTokPreflight(undefined);
                }}>
                  <option value="">Chọn hồ sơ Chrome…</option>
                  {chromeProfiles.map((profile) => <option key={profile.directory} value={profile.directory}>{profile.name} · {profile.directory}</option>)}
                </select>
              </label>
              <button type="button" className="secondary wide-action" disabled={!project.settings.tiktok.chromeProfileDirectory || tiktokChecking} onClick={() => void checkTikTokProfile()}>
                {tiktokChecking ? "Đang mở và kiểm tra…" : "Mở & kiểm tra đúng hồ sơ"}
              </button>
              {tiktokPreflight && <div role="status" aria-live="polite" className={`tiktok-preflight ${tiktokPreflight.appleEventsReady && tiktokPreflight.accessibilityReady ? "ready" : "warning"}`}>
                <strong>{tiktokPreflight.appleEventsReady && tiktokPreflight.accessibilityReady ? "Sẵn sàng tự đăng" : "Cần thiết lập một lần"}</strong>
                <span>Apple Events: {tiktokPreflight.appleEventsReady ? "Đạt" : "Chưa bật"}</span>
                <span>Quyền Trợ năng: {tiktokPreflight.accessibilityReady ? "Đạt" : "Chưa cấp"}</span>
                <small>{tiktokPreflight.message}</small>
                <button type="button" className="secondary tiktok-recheck" disabled={tiktokChecking} onClick={() => void checkTikTokProfile()}>
                  {tiktokChecking ? "Đang kiểm tra lại…" : "Kiểm tra lại quyền Chrome"}
                </button>
              </div>}
              <details className="tiktok-setup-guide" open={Boolean(tiktokPreflight && (!tiktokPreflight.appleEventsReady || !tiktokPreflight.accessibilityReady))}>
                <summary>Cách bật quyền để tool tự tải video</summary>
                <ol>
                  <li><strong>Bấm vào cửa sổ Chrome</strong> để chữ “Chrome” hiện cạnh logo Apple trên thanh menu.</li>
                  <li>Trên thanh menu trên cùng chọn <strong>Xem → Nhà phát triển → Cho phép JavaScript từ Apple Events</strong>. Mục có dấu ✓ là đã bật.</li>
                  <li>Mở <strong>Cài đặt hệ thống → Quyền riêng tư &amp; Bảo mật → Trợ năng</strong>, rồi bật <strong>Terminal</strong> — ứng dụng đang chạy <code>start.command</code>.</li>
                  <li>Quay lại tool và bấm <strong>Mở &amp; kiểm tra đúng hồ sơ</strong>. Chỉ xuất khi cả hai trạng thái đều “Đạt”.</li>
                </ol>
                <button type="button" className="secondary wide-action" onClick={() => void openTikTokAccessibilitySettings()}>Mở Cài đặt Trợ năng</button>
              </details>
              <label>Caption / mô tả video
                <textarea rows={5} maxLength={4_000} placeholder="Nhập caption, hashtag và nội dung muốn đăng…" value={project.settings.tiktok.caption} onChange={(event) => mutateProject((draft) => { draft.settings.tiktok.caption = event.target.value; })} />
                <small className="field-hint">{project.settings.tiktok.caption.length}/4.000 ký tự</small>
              </label>
              <fieldset className="publish-time-fieldset">
                <legend>Thời điểm đăng</legend>
                <div className="choice-grid">
                  <button type="button" className={project.settings.tiktok.mode === "now" ? "selected" : ""} onClick={() => mutateProject((draft) => { draft.settings.tiktok.mode = "now"; })}>Đăng bây giờ<small>Sau khi TikTok tải video xong</small></button>
                  <button type="button" className={project.settings.tiktok.mode === "schedule" ? "selected" : ""} onClick={() => mutateProject((draft) => { draft.settings.tiktok.mode = "schedule"; })}>Lên lịch<small>Dùng giờ hiện tại trên máy Mac</small></button>
                </div>
              </fieldset>
              {project.settings.tiktok.mode === "schedule" && <label>Ngày và giờ đăng
                <input type="datetime-local" value={project.settings.tiktok.scheduledAt ?? ""} onChange={(event) => mutateProject((draft) => { draft.settings.tiktok.scheduledAt = event.target.value; })} />
              </label>}
              <p className="provider-notice online">Tool sẽ kiểm tra hai quyền trên trước khi bắt đầu render. Nếu TikTok báo lỗi kiểm tra nội dung, tool sẽ dừng và giữ tab mở.</p>
            </div>}
          </section>

          <section className="settings-section jobs-section">
            <div className="section-title-row"><h3>Hàng đợi xuất</h3><span>{currentJobs.length}</span></div>
            {!currentJobs.length && <p className="muted">Chưa có tác vụ.</p>}
            {currentJobs.slice(0, 4).map((job) => (
              <div className="job-card" key={job.id}>
                <div><strong>{job.status === "completed" ? "Đã xuất" : job.status === "rendering" ? "Đang render" : job.status === "queued" ? "Đang chờ" : job.status === "failed" ? "Thất bại" : "Đã hủy"}</strong><span>{job.progress.toFixed(0)}%</span></div>
                <progress max="100" value={job.progress} />
                {job.error && <small className="field-error">{job.error}</small>}
                <div className="inline-actions">
                  {(job.status === "queued" || job.status === "rendering") && <button onClick={() => void api(`/api/render-jobs/${job.id}/cancel`, { method: "POST" }).then(refreshJobs).catch(reportError)}>Hủy</button>}
                  {(job.status === "failed" || job.status === "cancelled") && <button onClick={() => void api(`/api/render-jobs/${job.id}/retry`, { method: "POST" }).then(refreshJobs).catch(reportError)}>Chạy lại</button>}
                  {job.status === "completed" && <button onClick={() => void api(`/api/render-jobs/${job.id}/open-folder`, { method: "POST" }).catch(reportError)}>Mở thư mục</button>}
                </div>
              </div>
            ))}
          </section>

          {currentTikTokJobs.length > 0 && <section className="settings-section jobs-section tiktok-jobs-section" aria-live="polite">
            <div className="section-title-row"><h3>Hàng đợi TikTok</h3><span>{currentTikTokJobs.length}</span></div>
            {currentTikTokJobs.slice(0, 4).map((job) => (
              <div className="job-card" key={job.id}>
                <div><strong>{job.status === "completed" ? "Đã gửi TikTok" : job.status === "failed" ? "Cần kiểm tra" : job.status === "cancelled" ? "Đã hủy" : "Đang tự đăng"}</strong><span>{job.progress.toFixed(0)}%</span></div>
                <progress max="100" value={job.progress} />
                <small>{job.chromeProfileName} · {job.mode === "schedule" ? `Lịch ${job.scheduledAt ?? "—"}` : "Đăng ngay"}</small>
                <small>{job.message}</small>
                {job.error && <small className="field-error">{job.error}</small>}
                <div className="inline-actions">
                  {!["completed", "failed", "cancelled"].includes(job.status) && <button onClick={() => void api(`/api/tiktok/publish-jobs/${job.id}/cancel`, { method: "POST" }).then(refreshTikTokJobs).catch(reportError)}>Dừng</button>}
                  {(job.status === "failed" || job.status === "cancelled") && <button onClick={() => void api(`/api/tiktok/publish-jobs/${job.id}/retry`, { method: "POST" }).then(refreshTikTokJobs).catch(reportError)}>Thử lại</button>}
                </div>
              </div>
            ))}
          </section>}
        </aside>
      </div>
      {showExportConfirmation && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowExportConfirmation(false)}>
        <section className="batch-modal publish-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="publish-confirmation-title" onMouseDown={(event) => event.stopPropagation()}>
          <span className="workspace-label">Xác nhận lần cuối</span>
          <h2 id="publish-confirmation-title">Xuất và gửi lên TikTok?</h2>
          <p>Render xong, tool sẽ mở đúng hồ sơ Chrome, tải video, điền caption và bấm nút {project.settings.tiktok.mode === "schedule" ? "Lên lịch" : "Đăng"}.</p>
          <dl className="publish-confirmation-summary">
            <div><dt>Hồ sơ Chrome</dt><dd>{project.settings.tiktok.chromeProfileName || project.settings.tiktok.chromeProfileDirectory}</dd></div>
            <div><dt>Thời điểm</dt><dd>{project.settings.tiktok.mode === "schedule" ? project.settings.tiktok.scheduledAt || "Chưa chọn" : "Ngay sau khi tải lên"}</dd></div>
            <div><dt>Caption</dt><dd>{project.settings.tiktok.caption || "Không có caption"}</dd></div>
          </dl>
          <p className="provider-notice offline">Đây là thao tác đăng nội dung ra ngoài. Hãy kiểm tra đúng tài khoản trong hồ sơ Chrome trước khi xác nhận.</p>
          <div className="inline-actions"><button type="button" onClick={() => setShowExportConfirmation(false)}>Quay lại</button><button type="button" className="primary" disabled={busy === "export"} onClick={() => void startExport(true)}>{busy === "export" ? "Đang xếp hàng…" : project.settings.tiktok.mode === "schedule" ? "Xác nhận xuất & lên lịch" : "Xác nhận xuất & đăng"}</button></div>
        </section>
      </div>}
      {isAutoWorkspace && threadsAnalysis && <div className="modal-backdrop" role="presentation" onMouseDown={() => setThreadsAnalysis(undefined)}>
        <section className="threads-modal" role="dialog" aria-modal="true" aria-labelledby="threads-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="threads-modal-header">
            <div><span className="panel-kicker">Auto Threads</span><h2 id="threads-title">Chọn comment và câu trả lời</h2></div>
            <button type="button" aria-label="Đóng" onClick={() => setThreadsAnalysis(undefined)}>×</button>
          </div>
          <article className="threads-source-post">
            <label className="toggle-row">
              <input type="checkbox" checked={selectedThreadsIds.has(threadsAnalysis.post.id)} onChange={(event) => setSelectedThreadsIds((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(threadsAnalysis.post.id); else next.delete(threadsAnalysis.post.id);
                return next;
              })} />
              Dùng bài viết gốc làm comment đầu tiên
            </label>
            <strong>@{threadsAnalysis.post.username}</strong><p>{threadsAnalysis.post.text}</p>
            <small>{threadsAnalysis.post.media.length ? `${threadsAnalysis.post.media.length} ảnh nội dung đã nhận diện (không tính avatar)` : "Không có ảnh nội dung"}</small>
          </article>
          {threadsAnalysis.warning && <p className="provider-notice online">{threadsAnalysis.warning}</p>}
          <div className="threads-selection-actions">
            <button type="button" onClick={() => setSelectedThreadsIds(new Set([threadsAnalysis.post.id, ...threadsAnalysis.comments.filter((comment) => comment.suggested).map((comment) => comment.id)]))}>Chọn đề xuất</button>
            <button type="button" onClick={() => setSelectedThreadsIds(new Set([threadsAnalysis.post.id, ...threadsAnalysis.comments.slice().sort((a, b) => b.likeCount - a.likeCount).slice(0, 12).map((comment) => comment.id)]))}>Chọn nhiều tim nhất</button>
            <button type="button" onClick={() => setSelectedThreadsIds(new Set())}>Bỏ chọn</button>
          </div>
          <div className="threads-candidate-list">
            {threadsAnalysis.comments.map((candidate) => {
              const checked = selectedThreadsIds.has(candidate.id);
              return <label className={`threads-candidate ${checked ? "selected" : ""}`} key={candidate.id} style={{ marginLeft: `${Math.min(candidate.depth, 2) * 22}px` }}>
                <input type="checkbox" checked={checked} onChange={(event) => setSelectedThreadsIds((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(candidate.id); else next.delete(candidate.id);
                  return next;
                })} />
                <span className="threads-candidate-body">
                  <span><strong>@{candidate.username}</strong>{candidate.parentId && <em>↳ reply</em>}<b className="like-count"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" /></svg>{candidate.likeCount}</b></span>
                  <p>{candidate.text || "[Chỉ có ảnh]"}</p>
                  <small>Điểm {candidate.score.toFixed(1)} · {candidate.reasons.join(" · ") || "Chưa đủ dữ liệu"}{candidate.media.length ? ` · ${candidate.media.length} ảnh` : ""}</small>
                </span>
              </label>;
            })}
          </div>
          <div className="threads-import-footer"><span>Đã chọn {selectedThreadsIds.size} mục. Bài gốc được nhận diện theo đúng link; reply tự kèm comment cha.</span><button type="button" className="primary" onClick={() => void importThreads()} disabled={!selectedThreadsIds.size || busy === "threads-import"}>{busy === "threads-import" ? "Đang nhập…" : "Nhập vào project"}</button></div>
        </section>
      </div>}
      {showBatchVoice && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowBatchVoice(false)}>
        <section className="batch-modal" role="dialog" aria-modal="true" aria-labelledby="batch-title" onMouseDown={(event) => event.stopPropagation()}>
          <h2 id="batch-title">Áp dụng cho tất cả comment</h2>
          <p>Chọn các thông số cần đồng bộ. Provider và giọng đọc riêng sẽ không bị thay đổi.</p>
          <label className="toggle-row"><input type="checkbox" checked={batchFields.rate} onChange={(event) => setBatchFields((current) => ({ ...current, rate: event.target.checked }))} /> Tốc độ đọc · {(selected?.rate ?? project.settings.defaultRate).toFixed(2)}×</label>
          <label className="toggle-row"><input type="checkbox" checked={batchFields.pitch} onChange={(event) => setBatchFields((current) => ({ ...current, pitch: event.target.checked }))} /> Cao độ · {selected?.pitch ?? project.settings.defaultPitch} Hz</label>
          <label className="toggle-row"><input type="checkbox" checked={batchFields.pauseAfter} onChange={(event) => setBatchFields((current) => ({ ...current, pauseAfter: event.target.checked }))} /> Thời gian nghỉ · {(selected?.pauseAfter ?? project.settings.defaultPauseAfter).toFixed(1)} giây</label>
          <p className="provider-notice online">Đổi tốc độ hoặc cao độ sẽ đánh dấu audio cần tạo lại. Chỉ đổi thời gian nghỉ sẽ cập nhật timeline, không tạo lại TTS.</p>
          <div className="inline-actions"><button onClick={() => setShowBatchVoice(false)}>Hủy</button><button className="primary" disabled={!batchFields.rate && !batchFields.pitch && !batchFields.pauseAfter} onClick={applyBatchVoiceSettings}>Áp dụng</button></div>
        </section>
      </div>}
    </main>
  );
}
