import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "./command.js";
import { probeDuration } from "./media.js";
import { RenderEngine } from "./render.js";
import { ProjectStore } from "./storage.js";

let dataRoot: string;

beforeAll(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-ffmpeg-test-"));
});

afterAll(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

describe("nghiệm thu FFmpeg thực tế", () => {
  it("xuất MP4 1080x1920 từ background, 6 comment cao thấp khác nhau, B-roll nhiều đoạn và nhạc", async () => {
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const project = await store.create("Nghiệm thu FFmpeg");
    const backgroundRelative = "assets/background/sample.mp4";
    const backgroundPath = store.resolveProjectAsset(project.id, backgroundRelative);
    await mkdir(path.dirname(backgroundPath), { recursive: true });
    await runCommand("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000",
      "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", backgroundPath
    ]);
    project.background = {
      relativePath: backgroundRelative,
      originalName: "sample.mp4",
      mimeType: "video/mp4",
      size: (await readFile(backgroundPath)).byteLength
    };
    project.settings.export.resolution = "1080x1920";
    project.settings.smartLayout = { enabled: true, mode: "auto", gapPixels: 40, safeTopPercent: 8, safeBottomPercent: 12 };

    const logoRelative = "assets/branding/logo.png";
    const logoPath = store.resolveProjectAsset(project.id, logoRelative);
    await mkdir(path.dirname(logoPath), { recursive: true });
    await runCommand("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=0x9cff38:s=240x120", "-frames:v", "1", "-update", "1", logoPath
    ]);
    project.branding.watermark = { enabled: true, text: "@Kênh Việt", opacity: 0.4, xPercent: 50, yPercent: 92, fontSize: 42 };
    project.branding.logo = {
      enabled: true, opacity: 0.75, xPercent: 86, yPercent: 12, widthPercent: 16,
      asset: { relativePath: logoRelative, originalName: "logo.png", mimeType: "image/png", size: (await readFile(logoPath)).byteLength, width: 240, height: 120 }
    };

    const illustrationColors = ["yellow", "cyan", "magenta", "orange", "purple"];
    const illustrationDurations = [0.5, 0.8, 1.1, 1.4, 1.7];
    project.illustrations.enabled = true;
    project.illustrations.mode = "multi";
    project.illustrations.timingMode = "source-duration";
    project.illustrations.intervalSeconds = 4;
    for (let index = 0; index < illustrationColors.length; index += 1) {
      const relativePath = `assets/illustrations/${index}.mp4`;
      const illustrationPath = store.resolveProjectAsset(project.id, relativePath);
      await mkdir(path.dirname(illustrationPath), { recursive: true });
      await runCommand("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", `color=c=${illustrationColors[index]}:s=320x240:r=30`,
        "-f", "lavfi", "-i", `sine=frequency=${250 + index * 50}:sample_rate=48000`,
        "-t", String(illustrationDurations[index]), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", illustrationPath
      ]);
      project.illustrations.videos.push({
        id: `illustration-${index}`,
        relativePath,
        originalName: `${index}.mp4`,
        mimeType: "video/mp4",
        size: (await readFile(illustrationPath)).byteLength,
        duration: illustrationDurations[index]!,
        width: 320,
        height: 240
      });
    }

    const musicRelative = "assets/music/sample.mp3";
    const musicPath = store.resolveProjectAsset(project.id, musicRelative);
    await mkdir(path.dirname(musicPath), { recursive: true });
    await runCommand("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "sine=frequency=180:sample_rate=48000:duration=0.7", "-c:a", "libmp3lame", musicPath
    ]);
    project.music = {
      enabled: true,
      asset: { relativePath: musicRelative, originalName: "sample.mp3", mimeType: "audio/mpeg", size: (await readFile(musicPath)).byteLength },
      duration: 0.7,
      volume: 0.1,
      ducking: true,
      fadeIn: 0.1,
      fadeOut: 0.2
    };

    const colors = ["red", "lime", "blue", "white", "pink", "gray"];
    const imageHeights = [180, 360, 720, 1200, 2000, 3200];
    const audioDurations = [0.28, 0.32, 0.36, 0.4, 0.44, 8.15];
    for (let index = 0; index < 6; index += 1) {
      const imageRelative = `assets/comments/${index}.png`;
      const audioRelative = `audio/${index}.mp3`;
      const imagePath = store.resolveProjectAsset(project.id, imageRelative);
      const audioPath = store.resolveProjectAsset(project.id, audioRelative);
      await mkdir(path.dirname(imagePath), { recursive: true });
      await mkdir(path.dirname(audioPath), { recursive: true });
      await runCommand("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
        `color=c=${colors[index]}:s=900x${imageHeights[index]}`, "-frames:v", "1", "-update", "1", imagePath
      ]);
      await runCommand("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
        `sine=frequency=${600 + index * 120}:sample_rate=48000:duration=${audioDurations[index]}`,
        "-c:a", "libmp3lame", "-b:a", "128k", audioPath
      ]);
      project.comments.push({
        id: `comment-${index}`,
        order: index + 1,
        ...(index === 1 || index === 2 ? { parentCommentId: "comment-0" } : {}),
        image: {
          relativePath: imageRelative,
          originalName: `${index}.png`,
          mimeType: "image/png",
          size: (await readFile(imagePath)).byteLength,
          width: 900,
          height: imageHeights[index]
        },
        text: `Bình luận ${index + 1}`,
        provider: "test",
        voiceId: "fixture",
        rate: 1,
        pitch: 0,
        audioPath: audioRelative,
        audioDuration: await probeDuration(audioPath),
        pauseAfter: 0.1,
        audioStatus: "ready",
        illustrationVideoId: `illustration-${index}`,
        illustrationStartSeconds: 0.05,
        illustrationLocked: false
      });
    }
    const dingRelative = "assets/sound-effects/ding.mp3";
    const dingPath = store.resolveProjectAsset(project.id, dingRelative);
    await mkdir(path.dirname(dingPath), { recursive: true });
    await runCommand("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "sine=frequency=1200:sample_rate=48000:duration=0.18", "-c:a", "libmp3lame", dingPath
    ]);
    project.soundEffects.assets.push({
      id: "ding-live", provider: "myinstants", title: "ding sound effect",
      sourcePageUrl: "https://www.myinstants.com/fr/instant/ding-sound-effect/",
      relativePath: dingRelative, originalName: "ding.mp3", mimeType: "audio/mpeg",
      size: (await readFile(dingPath)).byteLength, duration: await probeDuration(dingPath)
    });
    project.comments[5]!.conversation = {
      enabled: true,
      image: { ...project.comments[5]!.image },
      mode: "replace",
      revealMode: "scroll",
      speakerAVoiceId: "HoaiMy",
      speakerBVoiceId: "NamMinh",
      messageGapSeconds: 0.08,
      dingEnabled: true,
      dingVolume: 0.25,
      dingLeadSeconds: 0.1,
      dingAssetId: "ding-live",
      messages: [
        { id: "chat-1", order: 1, speaker: "a", text: "Tin một", box: { x: 0.1, y: 0.12, width: 0.55, height: 0.08 }, confidence: 1, audioStatus: "ready", audioDuration: 1, revealStartSeconds: 0, voiceStartSeconds: 0.1 },
        { id: "chat-2", order: 2, speaker: "b", text: "Tin hai", box: { x: 0.4, y: 0.48, width: 0.5, height: 0.08 }, confidence: 1, audioStatus: "ready", audioDuration: 1, revealStartSeconds: 2, voiceStartSeconds: 2.1 },
        { id: "chat-3", order: 3, speaker: "a", text: "Tin ba", box: { x: 0.1, y: 0.82, width: 0.55, height: 0.08 }, confidence: 1, audioStatus: "ready", audioDuration: 1, revealStartSeconds: 5, voiceStartSeconds: 5.1 }
      ]
    };
    const saved = await store.save(project);
    expect(saved.illustrations.timingMode).toBe("source-duration");
    expect(saved.illustrations.segments.length).toBeGreaterThan(12);
    expect(saved.illustrations.segments.filter((segment) => segment.commentId === "comment-5").length).toBeGreaterThan(3);
    const hasCrossCommentContinuation = saved.illustrations.segments.slice(1).some((segment, index) => {
      const previous = saved.illustrations.segments[index]!;
      return segment.commentId !== previous.commentId
        && segment.videoAssetId === previous.videoAssetId
        && Math.abs(segment.sourceStartSeconds - (previous.sourceStartSeconds + previous.durationSeconds)) < 1 / 30;
    });
    expect(hasCrossCommentContinuation).toBe(true);

    const engine = new RenderEngine(store);
    const relativeOutput = await engine.render(project.id, () => undefined, new AbortController().signal);
    const outputPath = path.join(dataRoot, relativeOutput);
    const { stdout } = await runCommand("ffprobe", [
      "-v", "error", "-show_entries",
      "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate:format=duration",
      "-of", "json", outputPath
    ]);
    const media = JSON.parse(stdout) as {
      streams: Array<Record<string, string | number>>;
      format: { duration: string };
    };
    const video = media.streams.find((stream) => stream.codec_type === "video");
    const audio = media.streams.find((stream) => stream.codec_type === "audio");
    expect(video).toMatchObject({ codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1" });
    expect(audio).toMatchObject({ codec_name: "aac", sample_rate: "48000" });
    expect(Number(media.format.duration)).toBeGreaterThan(10.4);
    expect(Number(media.format.duration)).toBeLessThan(10.8);

    const frameDirectory = path.join(dataRoot, "verified-frames");
    await mkdir(frameDirectory, { recursive: true });
    for (const [name, time] of [["dau", "0.10"], ["giua", "5.20"], ["cuoi", "10.30"]] as const) {
      await runCommand("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-ss", time, "-i", outputPath,
        "-frames:v", "1", "-update", "1", path.join(frameDirectory, `${name}.png`)
      ]);
    }
    expect((await readFile(path.join(frameDirectory, "dau.png"))).byteLength).toBeGreaterThan(1000);
    expect((await readFile(path.join(frameDirectory, "giua.png"))).byteLength).toBeGreaterThan(1000);
    expect((await readFile(path.join(frameDirectory, "cuoi.png"))).byteLength).toBeGreaterThan(1000);
    const acceptanceOutput = process.env.CVS_ACCEPTANCE_OUTPUT;
    if (acceptanceOutput) {
      await mkdir(path.dirname(acceptanceOutput), { recursive: true });
      await copyFile(outputPath, acceptanceOutput);
    }
  }, 240_000);
});
