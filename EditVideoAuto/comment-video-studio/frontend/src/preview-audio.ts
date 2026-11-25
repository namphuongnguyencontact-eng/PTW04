export interface PreviewOneShotOptions {
  playing: boolean;
  eventStartSeconds: number;
  durationSeconds: number;
  volume: number;
  getTimelineSeconds: () => number;
}

export function schedulePreviewOneShot(
  audio: HTMLAudioElement | null,
  options: PreviewOneShotOptions
): () => void {
  if (!audio) return () => undefined;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waitingForMetadata = false;
  audio.pause();

  const startPlayback = () => {
    if (cancelled || !options.playing) return;
    const offset = Math.max(0, options.getTimelineSeconds() - options.eventStartSeconds);
    if (offset >= options.durationSeconds) return;
    audio.volume = Math.max(0, Math.min(1, options.volume));
    try {
      audio.currentTime = Math.min(offset, Math.max(0, options.durationSeconds - 0.001));
    } catch {
      return;
    }
    void audio.play().catch(() => undefined);
  };

  const onMetadata = () => {
    waitingForMetadata = false;
    startPlayback();
  };

  const startWhenReady = () => {
    if (cancelled) return;
    if (audio.readyState >= 1) {
      startPlayback();
      return;
    }
    waitingForMetadata = true;
    audio.addEventListener("loadedmetadata", onMetadata, { once: true });
    audio.load();
  };

  if (options.playing) {
    const delayMs = Math.max(0, (options.eventStartSeconds - options.getTimelineSeconds()) * 1000);
    if (delayMs > 8) timer = setTimeout(startWhenReady, delayMs);
    else startWhenReady();
  }

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    if (waitingForMetadata) audio.removeEventListener("loadedmetadata", onMetadata);
    audio.pause();
  };
}
