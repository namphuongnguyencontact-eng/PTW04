import { afterEach, describe, expect, it, vi } from "vitest";
import { schedulePreviewOneShot } from "./preview-audio.js";

function mockAudio(readyState = 4) {
  let metadataListener: (() => void) | undefined;
  const audio = {
    currentTime: 0,
    volume: 1,
    readyState,
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    load: vi.fn(),
    addEventListener: vi.fn((_name: string, listener: EventListenerOrEventListenerObject) => {
      metadataListener = typeof listener === "function" ? () => listener(new Event("loadedmetadata")) : () => listener.handleEvent(new Event("loadedmetadata"));
    }),
    removeEventListener: vi.fn()
  } as unknown as HTMLAudioElement;
  return { audio, fireMetadata: () => metadataListener?.() };
}

afterEach(() => vi.useRealTimers());

describe("preview audio một lần", () => {
  it("phát ngay đúng âm lượng và vị trí khi media đã sẵn sàng", () => {
    const { audio } = mockAudio();
    const stop = schedulePreviewOneShot(audio, {
      playing: true,
      eventStartSeconds: 10,
      durationSeconds: 3,
      volume: 0.35,
      getTimelineSeconds: () => 10.4
    });
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBeCloseTo(0.4);
    expect(audio.volume).toBe(0.35);
    stop();
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  it("chờ metadata rồi đồng bộ theo timeline thay vì bỏ mất âm", () => {
    let timelineSeconds = 4;
    const { audio, fireMetadata } = mockAudio(0);
    schedulePreviewOneShot(audio, {
      playing: true,
      eventStartSeconds: 4,
      durationSeconds: 2,
      volume: 0.25,
      getTimelineSeconds: () => timelineSeconds
    });
    expect(audio.load).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();
    timelineSeconds = 4.3;
    fireMetadata();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBeCloseTo(0.3);
  });

  it("lập lịch đúng mốc tương lai và không gọi play mỗi frame", () => {
    vi.useFakeTimers();
    let timelineSeconds = 9;
    const { audio } = mockAudio();
    schedulePreviewOneShot(audio, {
      playing: true,
      eventStartSeconds: 10,
      durationSeconds: 1,
      volume: 0.2,
      getTimelineSeconds: () => timelineSeconds
    });
    vi.advanceTimersByTime(999);
    expect(audio.play).not.toHaveBeenCalled();
    timelineSeconds = 10;
    vi.advanceTimersByTime(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
