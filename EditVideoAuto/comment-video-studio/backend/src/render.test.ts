import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTimeline,
  createDefaultBrandingSettings,
  createDefaultIllustrationSettings,
  createDefaultMusicSettings,
  createDefaultSoundEffectSettings,
  type ProjectData
} from "@comment-video-studio/shared";
import { buildBrollSceneArgs, buildNarrationArgs, buildVideoArgs, renderWatermarkImage, RenderEngine, RenderQueue, type CommandRunner } from "./render.js";
import { ProjectStore } from "./storage.js";

function readyProject(): ProjectData {
  const now = new Date().toISOString();
  return {
    id: "project-test",
    name: "Video thử nghiệm",
    createdAt: now,
    updatedAt: now,
    illustrations: createDefaultIllustrationSettings(),
    music: createDefaultMusicSettings(),
    soundEffects: createDefaultSoundEffectSettings(),
    branding: createDefaultBrandingSettings(),
    background: { relativePath: "assets/nền có dấu.mp4", originalName: "nền có dấu.mp4", mimeType: "video/mp4", size: 10 },
    settings: {
      defaultProvider: "macos",
      defaultVoiceId: "Linh",
      defaultRate: 1,
      defaultPitch: 0,
      defaultPauseAfter: 0.4,
      smartLayout: { enabled: true, mode: "auto", gapPixels: 40, safeTopPercent: 8, safeBottomPercent: 12 },
      overlay: { widthPercent: 85, xPercent: 50, topPercent: 13, maxHeightPercent: 58 },
      export: { resolution: "1080x1920", fps: 30, encoder: "libx264" },
      tiktok: { enabled: false, caption: "", mode: "now" }
    },
    comments: [
      {
        id: "a", order: 1,
        image: { relativePath: "assets/a.png", originalName: "a.png", mimeType: "image/png", size: 1, width: 900, height: 180 },
        text: "Một", rate: 1, pitch: 0, pauseAfter: 0.4,
        audioPath: "audio/a.mp3", audioDuration: 1.2, audioStatus: "ready"
      },
      {
        id: "b", order: 2,
        image: { relativePath: "assets/b.png", originalName: "b.png", mimeType: "image/png", size: 1, width: 900, height: 900 },
        text: "Hai", rate: 1, pitch: 0, pauseAfter: 0.4,
        audioPath: "audio/b.mp3", audioDuration: 2.1, audioStatus: "ready"
      }
    ]
  };
}

describe("câu lệnh FFmpeg", () => {
  it("raster hóa watermark tiếng Việt và ký tự đặc biệt thành PNG trong suốt", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "comment-video-watermark-test-"));
    try {
      const output = path.join(directory, "watermark.png");
      await renderWatermarkImage("@Kênh Việt & <Mới>", 42, output);
      expect((await readFile(output)).subarray(1, 4).toString()).toBe("PNG");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("nối audio theo thứ tự, thêm khoảng nghỉ và chuẩn hóa 48 kHz", () => {
    const project = readyProject();
    const timeline = buildTimeline(project.comments, 30);
    const args = buildNarrationArgs(project, timeline, "/tmp/narration.wav");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(filter).toContain("apad=pad_dur=0.400000");
    expect(filter).toContain("[a0][a1]concat=n=2:v=0:a=1[narration]");
    expect(args).toContain("48000");
  });

  it("dùng một background liên tục và đổi ảnh đúng theo frame", () => {
    const project = readyProject();
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args.slice(0, 9)).toContain("-stream_loop");
    expect(filter).toContain("force_original_aspect_ratio=increase,crop=1080:1920");
    expect(filter).toContain("force_original_aspect_ratio=decrease");
    expect(filter).toContain("between(n,0,47)");
    expect(filter).toContain("between(n,48,122)");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
  });

  it("giới hạn thời lượng mọi input lặp để FFmpeg không kẹt ở 99%", () => {
    const project = readyProject();
    project.illustrations.enabled = true;
    project.illustrations.videos = [{
      id: "broll", relativePath: "/tmp/broll.mp4", originalName: "broll.mp4", mimeType: "video/mp4", size: 10,
      duration: 12, width: 720, height: 1280
    }];
    project.comments[0]!.illustrationVideoId = "broll";
    project.music = {
      enabled: true,
      asset: { relativePath: "/tmp/music.mp3", originalName: "music.mp3", mimeType: "audio/mpeg", size: 10 },
      duration: 30, volume: 0.2, ducking: false, fadeIn: 0, fadeOut: 0
    };
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const inputGroups: string[][] = [];
    let start = 4;
    args.forEach((argument, index) => {
      if (argument !== "-i") return;
      inputGroups.push(args.slice(start, index + 2));
      start = index + 2;
    });
    const loopedInputs = inputGroups.filter((group) => group.includes("-loop") || group.includes("-stream_loop"));
    expect(loopedInputs.length).toBeGreaterThan(0);
    expect(loopedInputs.every((group) => group.includes("-t"))).toBe(true);
    const brollInput = loopedInputs.find((group) => group.includes("/tmp/broll.mp4"))!;
    const brollDuration = Number(brollInput[brollInput.indexOf("-t") + 1]);
    expect(brollDuration).toBeGreaterThan(0);
    expect(brollDuration).toBeLessThanOrEqual(timeline.durationSeconds);
  });

  it("giữ comment cha khi comment con đọc và ẩn comment con ngay khi hết voice", () => {
    const project = readyProject();
    project.comments[1]!.parentCommentId = "a";
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(filter).toContain("between(n,0,122)");
    expect(filter).toContain("between(n,48,110)");
    expect(filter).not.toContain("between(n,48,122)");
  });

  it("ghép video minh họa không lấy audio nguồn và trộn nhạc có ducking", () => {
    const project = readyProject();
    project.comments[0]!.audioDuration = 9.1;
    project.illustrations.enabled = true;
    project.illustrations.videos = ["one", "two"].map((id) => ({
      id,
      relativePath: `/tmp/${id} clip.mp4`,
      originalName: `${id}.mp4`,
      mimeType: "video/mp4",
      size: 10,
      duration: 10,
      width: 720,
      height: 1280
    }));
    project.comments.forEach((comment, index) => {
      comment.illustrationVideoId = index === 0 ? "one" : "two";
      comment.illustrationStartSeconds = index * 0.5;
    });
    project.music = {
      enabled: true,
      asset: { relativePath: "/tmp/nhạc nền.mp3", originalName: "nhạc nền.mp3", mimeType: "audio/mpeg", size: 10 },
      duration: 30,
      volume: 0.1,
      ducking: true,
      fadeIn: 0.5,
      fadeOut: 1.5
    };
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args).toContain("/tmp/one clip.mp4");
    expect(args).toContain("/tmp/nhạc nền.mp3");
    expect(filter).toContain("sidechaincompress");
    expect(filter).toContain("volume=0.1000");
    expect(filter).toContain("setpts=PTS-STARTPTS+0.000000/TB");
    expect(project.illustrations.mode).toBe("multi");
    expect((filter.match(/setpts=PTS-STARTPTS\+/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(filter).toContain("overlay=x='");
    expect(args[args.indexOf("-map", args.indexOf("-map") + 1) + 1]).toBe("[audio]");
  });

  it("dựng riêng một cảnh B-roll với mốc cục bộ và không mở clip của cảnh khác", () => {
    const project = readyProject();
    project.comments[0]!.audioDuration = 4;
    project.illustrations.enabled = true;
    project.illustrations.mode = "multi";
    project.illustrations.videos = ["one", "two", "other"].map((id) => ({
      id,
      relativePath: `/tmp/${id}.mp4`,
      originalName: `${id}.mp4`,
      mimeType: "video/mp4",
      size: 10,
      duration: 10,
      width: 720,
      height: 1280
    }));
    project.illustrations.segments = [
      { id: "a-1", commentId: "a", videoAssetId: "one", startSeconds: 0, durationSeconds: 2, sourceStartSeconds: 0, locked: false },
      { id: "a-2", commentId: "a", videoAssetId: "two", startSeconds: 2, durationSeconds: 2.4, sourceStartSeconds: 1, locked: false },
      { id: "b-1", commentId: "b", videoAssetId: "other", startSeconds: 4.4, durationSeconds: 2.5, sourceStartSeconds: 0, locked: false }
    ];
    const timeline = buildTimeline(project.comments, 30);
    const args = buildBrollSceneArgs(project, timeline, timeline.segments[0]!, "/tmp/scene.mp4", 1.25);
    const filter = args[args.indexOf("-filter_complex") + 1]!;

    expect(args).toContain("/tmp/one.mp4");
    expect(args).toContain("/tmp/two.mp4");
    expect(args).not.toContain("/tmp/other.mp4");
    expect(args).toContain("1.250000");
    expect(filter).toContain("setpts=PTS-STARTPTS+2.000000/TB");
    expect(filter).toContain("between(n,60,131)");
    expect(args).toContain("-an");
    expect(args.at(-1)).toBe("/tmp/scene.mp4");
  });

  it("phủ watermark chữ và logo trong suốt xuyên suốt video", () => {
    const project = readyProject();
    project.branding.watermark = { enabled: true, text: "@Kênh Việt", opacity: 0.35, xPercent: 50, yPercent: 92, fontSize: 42 };
    project.branding.logo = {
      enabled: true, opacity: 0.7, xPercent: 84, yPercent: 14, widthPercent: 18,
      asset: { relativePath: "/tmp/logo kênh.png", originalName: "logo kênh.png", mimeType: "image/png", size: 10, width: 512, height: 256 }
    };
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4", "/tmp/watermark.png");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args).toContain("/tmp/watermark.png");
    expect(args).toContain("/tmp/logo kênh.png");
    expect(filter).toContain("colorchannelmixer=aa=0.3500");
    expect(filter).toContain("colorchannelmixer=aa=0.7000");
    expect(filter).toContain("main_w*0.840000-overlay_w/2");
    expect(filter).toContain("main_h*0.140000-overlay_h/2");
    expect(args[args.indexOf("-map") + 1]).toBe("[branded]");
  });

  it("đặt SFX đúng cảnh, cắt trong cảnh và trộn nhỏ hơn giọng đọc", () => {
    const project = readyProject();
    project.soundEffects = {
      enabled: true,
      volume: 0.2,
      appearance: createDefaultSoundEffectSettings().appearance,
      assets: [{
        id: "boom", provider: "myinstants", title: "Vine Boom",
        sourcePageUrl: "https://www.myinstants.com/en/instant/vine-boom-1/",
        relativePath: "/tmp/vine boom.mp3", originalName: "vine boom.mp3", mimeType: "audio/mpeg", size: 10, duration: 3
      }],
      events: [{ id: "event", commentId: "b", assetId: "boom", offsetSeconds: 0.1, volume: 0.5, locked: false, query: "vine boom", reason: "Bất ngờ" }]
    };
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args).toContain("/tmp/vine boom.mp3");
    expect(filter).toContain("volume=0.1000");
    expect(filter).toContain("adelay=1700|1700");
    expect(filter).toContain("amix=inputs=2:duration=first");
    expect(args[args.indexOf("-map", args.indexOf("-map") + 1) + 1]).toBe("[audio]");
  });

  it("phát tununuuuu chỉ ở comment đầu, mouse click ở comment sau và bỏ qua comment hội thoại", () => {
    const project = readyProject();
    project.soundEffects.assets.push(
      {
        id: "intro", provider: "myinstants", title: "tununuuuu",
        sourcePageUrl: "https://www.myinstants.com/fr/instant/tununuuuu-67224/",
        relativePath: "/tmp/tununuuuu.mp3", originalName: "tununuuuu.mp3", mimeType: "audio/mpeg", size: 10, duration: 0.7
      },
      {
        id: "click", provider: "myinstants", title: "mouse click by ek6",
        sourcePageUrl: "https://www.myinstants.com/fr/instant/mouse-click-by-ek6-9658/",
        relativePath: "/tmp/mouse-click.mp3", originalName: "mouse-click.mp3", mimeType: "audio/mpeg", size: 10, duration: 0.3
      }
    );
    project.soundEffects.appearance = { enabled: true, volume: 0.35, leadSeconds: 0.08, introAssetId: "intro", nextAssetId: "click" };
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args.filter((item) => item === "/tmp/tununuuuu.mp3")).toHaveLength(1);
    expect(args.filter((item) => item === "/tmp/mouse-click.mp3")).toHaveLength(1);
    expect(filter).toContain("volume=0.3500");
    expect(filter).toContain("adelay=0|0");
    expect(filter).toContain("adelay=1600|1600");

    project.comments[0]!.conversation = {
      enabled: true,
      image: project.comments[0]!.image,
      mode: "replace",
      revealMode: "scroll",
      speakerAVoiceId: "a",
      speakerBVoiceId: "b",
      messageGapSeconds: 0.08,
      dingEnabled: false,
      dingVolume: 0.25,
      dingLeadSeconds: 0.1,
      messages: []
    };
    const conversationArgs = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    expect(conversationArgs).not.toContain("/tmp/tununuuuu.mp3");
    expect(conversationArgs.filter((item) => item === "/tmp/mouse-click.mp3")).toHaveLength(1);
  });

  it("chỉ hiện ảnh đính kèm sau lời comment, giữ đến hết cảnh và không crop ảnh", () => {
    const project = readyProject();
    project.comments[1]!.audioDuration = 8;
    project.comments[1]!.attachment = {
      kind: "image",
      asset: { relativePath: "/tmp/ảnh đính kèm.png", originalName: "ảnh đính kèm.png", mimeType: "image/png", size: 10, width: 800, height: 1200 },
      mode: "auto",
      detectedType: "illustration",
      classificationConfidence: 1,
      textBlocks: [],
      revealStartSeconds: 8,
      audioDuration: 0,
      holdAfterSeconds: 2,
      clickEnabled: true
    };
    project.illustrations.enabled = true;
    project.illustrations.videos = [{
      id: "broll", relativePath: "/tmp/broll.mp4", originalName: "broll.mp4", mimeType: "video/mp4", size: 10,
      width: 1080, height: 1920, duration: 30
    }];
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args).toContain("/tmp/ảnh đính kèm.png");
    expect(args).toContain("/tmp/broll.mp4");
    expect(filter).toContain("force_original_aspect_ratio=decrease,pad=");
    expect(filter).toContain(`between(n,${timeline.segments[1]!.startFrame + 8 * timeline.fps},${timeline.segments[1]!.endFrame - 1})`);
  });

  it("phát mouse click đúng lúc chuyển từ comment sang ảnh nội dung", () => {
    const project = readyProject();
    project.soundEffects.enabled = true;
    project.soundEffects.assets.push({
      id: "click", provider: "myinstants", title: "mouse click",
      sourcePageUrl: "https://www.myinstants.com/fr/instant/mouse-click-by-ek6-9658/",
      relativePath: "/tmp/mouse-click.mp3", originalName: "mouse-click.mp3", mimeType: "audio/mpeg", size: 10, duration: 0.3
    });
    project.soundEffects.appearance = { enabled: true, volume: 0.35, leadSeconds: 0.08, nextAssetId: "click" };
    project.comments[0]!.attachment = {
      kind: "image", asset: project.comments[0]!.image, mode: "auto", detectedType: "illustration",
      classificationConfidence: 1, textBlocks: [], revealStartSeconds: 1.2, holdAfterSeconds: 2, clickEnabled: true
    };
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args.filter((item) => item === "/tmp/mouse-click.mp3")).toHaveLength(2);
    expect(filter).toContain("adelay=1200|1200");
  });

  it("mở ảnh hội thoại theo từng tin và phát ding đúng mốc", () => {
    const project = readyProject();
    project.comments[0]!.audioDuration = 4;
    project.comments[0]!.conversation = {
      enabled: true,
      image: { relativePath: "/tmp/chat dài.png", originalName: "chat dài.png", mimeType: "image/png", size: 10, width: 720, height: 1280 },
      mode: "replace",
      revealMode: "scroll",
      speakerAVoiceId: "HoaiMy",
      speakerBVoiceId: "NamMinh",
      messageGapSeconds: 0.08,
      dingEnabled: true,
      dingVolume: 0.25,
      dingLeadSeconds: 0.1,
      dingAssetId: "ding",
      messages: [
        { id: "m1", order: 1, speaker: "a", text: "Một", box: { x: 0.1, y: 0.2, width: 0.5, height: 0.08 }, confidence: 1, audioStatus: "ready", revealStartSeconds: 0, voiceStartSeconds: 0.1, audioDuration: 1 },
        { id: "m2", order: 2, speaker: "b", text: "Hai", box: { x: 0.45, y: 0.62, width: 0.45, height: 0.08 }, confidence: 1, audioStatus: "ready", revealStartSeconds: 1.5, voiceStartSeconds: 1.6, audioDuration: 1 }
      ]
    };
    project.soundEffects.assets.push({
      id: "ding", provider: "myinstants", title: "ding sound effect",
      sourcePageUrl: "https://www.myinstants.com/fr/instant/ding-sound-effect/",
      relativePath: "/tmp/ding.mp3", originalName: "ding.mp3", mimeType: "audio/mpeg", size: 10, duration: 0.4
    });
    const timeline = buildTimeline(project.comments, 30);
    const args = buildVideoArgs(project, timeline, "/tmp/narration.wav", "/tmp/video.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    expect(args.filter((item) => item === "/tmp/chat dài.png")).toHaveLength(2);
    expect(args.filter((item) => item === "/tmp/ding.mp3")).toHaveLength(2);
    expect(filter).toContain("crop=iw:ih*");
    expect(filter).toContain("fade=t=in");
    expect(filter).toContain("adelay=0|0");
    expect(filter).toContain("adelay=1500|1500");
    expect(filter).toContain("volume=0.2500");
  });
});

let dataRoot: string;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-render-test-"));
});

afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

describe("RenderEngine và hàng đợi", () => {
  it("render bằng argv an toàn, dọn file tạm và trả đường dẫn output", async () => {
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const project = readyProject();
    for (const relativePath of [project.background!.relativePath, ...project.comments.flatMap((comment) => [comment.image.relativePath, comment.audioPath!])]) {
      const absolute = store.resolveProjectAsset(project.id, relativePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, "fixture");
    }
    await store.save(project);
    const commands: string[][] = [];
    const fakeRun: CommandRunner = async (command, args, options) => {
      commands.push(args);
      if (command === "ffprobe") return { stdout: "4.100000\n", stderr: "" };
      const output = args.at(-1)!;
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, "rendered");
      options?.onStdout?.("out_time_us=1000000\n");
      return { stdout: "", stderr: "" };
    };
    const engine = new RenderEngine(store, { run: fakeRun, now: () => new Date("2026-01-02T03:04:05Z") });
    const relativeOutput = await engine.render(project.id, () => undefined, new AbortController().signal);
    expect(commands).toHaveLength(3);
    expect(relativeOutput).toMatch(/^outputs\/project-test\/video-thu-nghiem-/);
    expect(commands[1]).toContain(store.resolveProjectAsset(project.id, project.background!.relativePath));
  });

  it("tiền dựng B-roll lớn thành các nhóm ít input trước lệnh render cuối", async () => {
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const project = readyProject();
    project.comments[0]!.audioDuration = 13;
    project.illustrations.enabled = true;
    project.illustrations.mode = "multi";
    project.illustrations.timingMode = "fixed";
    project.illustrations.intervalSeconds = 1;
    project.illustrations.videos = [{
      id: "broll",
      relativePath: "assets/illustrations/broll.mp4",
      originalName: "broll.mp4",
      mimeType: "video/mp4",
      size: 10,
      duration: 30,
      width: 720,
      height: 1280
    }];
    const requiredFiles = [
      project.background!.relativePath,
      project.illustrations.videos[0]!.relativePath,
      ...project.comments.flatMap((comment) => [comment.image.relativePath, comment.audioPath!])
    ];
    for (const relativePath of requiredFiles) {
      const absolute = store.resolveProjectAsset(project.id, relativePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, "fixture");
    }
    await store.save(project);
    const timeline = buildTimeline(project.comments, 30);
    const commands: Array<{ command: string; args: string[] }> = [];
    const backgroundPath = store.resolveProjectAsset(project.id, project.background!.relativePath);
    const brollPath = store.resolveProjectAsset(project.id, project.illustrations.videos[0]!.relativePath);
    const fakeRun: CommandRunner = async (command, args, options) => {
      commands.push({ command, args });
      if (command === "ffprobe") {
        return { stdout: args.at(-1) === backgroundPath ? "2.000000\n" : `${timeline.durationSeconds.toFixed(6)}\n`, stderr: "" };
      }
      const output = args.at(-1)!;
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, "rendered");
      options?.onStdout?.(`out_time_us=${Math.round(timeline.durationSeconds * 1_000_000)}\n`);
      return { stdout: "", stderr: "" };
    };
    const engine = new RenderEngine(store, { run: fakeRun, now: () => new Date("2026-01-02T03:04:05Z") });
    await engine.render(project.id, () => undefined, new AbortController().signal);

    const sceneCommands = commands.filter(({ command, args }) => command === "ffmpeg" && args.at(-1)?.includes("broll-scene-"));
    expect(sceneCommands.length).toBeGreaterThan(1);
    expect(sceneCommands.every(({ args }) => args.filter((item) => item === "-i").length <= 7)).toBe(true);
    expect(commands.some(({ command, args }) => command === "ffmpeg" && args.includes("concat"))).toBe(true);
    const finalRender = commands.findLast(({ command, args }) => command === "ffmpeg" && args.includes("-progress"));
    expect(finalRender?.args.some((argument) => argument.includes("broll-background.mp4"))).toBe(true);
    expect(finalRender?.args).not.toContain(brollPath);
  });

  it("hàng đợi chỉ chạy tuần tự và cho phép chạy lại tác vụ lỗi", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const calls: string[] = [];
    const engine = {
      render: async (projectId: string) => {
        calls.push(projectId);
        if (projectId === "one") await firstGate;
        if (projectId === "bad") throw new Error("Lỗi thử nghiệm");
        return `outputs/${projectId}.mp4`;
      }
    } as unknown as RenderEngine;
    const queue = new RenderQueue(engine);
    const settled: string[] = [];
    queue.onSettled((job) => { settled.push(`${job.projectId}:${job.status}`); });
    const first = queue.enqueue("one");
    queue.enqueue("two");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls).toEqual(["one"]);
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toEqual(["one", "two"]);
    expect(queue.list().find((job) => job.id === first.id)?.status).toBe("completed");
    expect(settled).toEqual(expect.arrayContaining(["one:completed", "two:completed"]));

    const failed = queue.enqueue("bad");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(queue.list().find((job) => job.id === failed.id)?.status).toBe("failed");
    expect(settled).toContain("bad:failed");
    expect(queue.retry(failed.id).projectId).toBe("bad");
  });

  it("hủy toàn bộ tác vụ render đang chờ hoặc đang chạy của một project", async () => {
    const engine = {
      render: async (_projectId: string, _onProgress: unknown, signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("đã hủy")), { once: true });
      })
    } as unknown as RenderEngine;
    const queue = new RenderQueue(engine);
    const active = queue.enqueue("project-can-xoa");
    const queued = queue.enqueue("project-can-xoa");
    await new Promise((resolve) => setTimeout(resolve, 5));

    const cancelled = queue.cancelProject("project-can-xoa");
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(cancelled.map((job) => job.id)).toEqual(expect.arrayContaining([active.id, queued.id]));
    expect(queue.list().filter((job) => job.projectId === "project-can-xoa").every((job) => job.status === "cancelled")).toBe(true);
  });

  it("từ chối outputDirectory trỏ ra ngoài thư mục outputs của ứng dụng", async () => {
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const project = readyProject();
    project.settings.export.outputDirectory = "../../outside";
    for (const relativePath of [project.background!.relativePath, ...project.comments.flatMap((comment) => [comment.image.relativePath, comment.audioPath!])]) {
      const absolute = store.resolveProjectAsset(project.id, relativePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, "fixture");
    }
    await store.save(project);
    const engine = new RenderEngine(store);
    await expect(engine.render(project.id, () => undefined, new AbortController().signal))
      .rejects.toThrow("Thư mục xuất video không hợp lệ");
  });
});
