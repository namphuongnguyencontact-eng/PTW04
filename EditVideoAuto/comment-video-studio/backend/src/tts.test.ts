import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TtsProvider, TtsRequest } from "./tts.js";
import {
  AUDIO_PROCESSING_VERSION,
  compactTtsError,
  EdgeTtsProvider,
  ElevenLabsTtsProvider,
  isTransientEdgeTtsError,
  MacOsTtsProvider,
  normalizeNarrationAudio,
  parseVoiceStudioVoices,
  splitNarrationText,
  TtsService,
  VoiceStudioTtsProvider
} from "./tts.js";
import { ProjectStore } from "./storage.js";
import { runCommand } from "./command.js";
import { probeDuration } from "./media.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

class FakeProvider implements TtsProvider {
  readonly id = "test" as const;
  generateCount = 0;
  generatedPaths: string[] = [];
  async info() {
    return {
      id: this.id,
      name: "Test",
      available: true,
      configured: true,
      online: false,
      supportsPitch: true,
      notice: "Provider kiểm thử."
    };
  }
  async listVoices() {
    return [{ id: "voice-test", name: "Giọng test", locale: "vi-VN", provider: this.id }];
  }
  async generate(request: TtsRequest) {
    this.generateCount += 1;
    this.generatedPaths.push(request.outputPath);
    await writeFile(request.outputPath, `audio:${request.text}`);
  }
}

class FailingEdgeProvider implements TtsProvider {
  readonly id = "edge" as const;
  async info() {
    return {
      id: this.id,
      name: "Edge TTS",
      available: true,
      configured: true,
      online: true,
      supportsPitch: true,
      notice: "Provider kiểm thử lỗi mạng."
    };
  }
  async listVoices() {
    return [{ id: "vi-VN-HoaiMyNeural", name: "Hoài My", locale: "vi-VN", provider: this.id }];
  }
  async generate() {
    throw new Error("Connection timeout to host wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1");
  }
}

class FakeMacOsProvider implements TtsProvider {
  readonly id = "macos" as const;
  generateCount = 0;
  async info() {
    return {
      id: this.id,
      name: "Giọng đọc macOS",
      available: true,
      configured: true,
      online: false,
      supportsPitch: false,
      notice: "Provider dự phòng kiểm thử."
    };
  }
  async listVoices() {
    return [{ id: "Linh", name: "Linh", locale: "vi-VN", provider: this.id }];
  }
  async generate(request: TtsRequest) {
    this.generateCount += 1;
    await writeFile(request.outputPath, `macos:${request.text}`);
  }
}

class FakeVoiceStudioProvider implements TtsProvider {
  readonly id = "voicestudio" as const;
  generateCount = 0;
  async info() {
    return {
      id: this.id,
      name: "VoiceStudio Local",
      available: true,
      configured: true,
      online: false,
      supportsPitch: false,
      notice: "Provider VoiceStudio kiểm thử."
    };
  }
  async listVoices() {
    return [{ id: "voice-studio-test", name: "Giọng VoiceStudio", locale: "vi-VN", provider: this.id }];
  }
  async generate(request: TtsRequest) {
    this.generateCount += 1;
    await writeFile(request.outputPath, `voicestudio:${this.generateCount}:${request.text}`);
  }
}

class BlockingProvider extends FakeProvider {
  private markStarted!: () => void;
  readonly started = new Promise<void>((resolve) => { this.markStarted = resolve; });

  override async generate(request: TtsRequest) {
    this.generateCount += 1;
    this.markStarted();
    await new Promise<void>((_resolve, reject) => {
      const abort = () => reject(new Error("provider đã nhận tín hiệu hủy"));
      if (request.signal?.aborted) abort();
      else request.signal?.addEventListener("abort", abort, { once: true });
    });
  }
}

let dataRoot: string;
let store: ProjectStore;
let provider: FakeProvider;
let service: TtsService;
let processedPaths: Array<{ input: string; output: string }>;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "comment-video-tts-test-"));
  store = new ProjectStore(dataRoot);
  await store.initialize();
  provider = new FakeProvider();
  processedPaths = [];
  service = new TtsService(store, process.cwd(), {
    providers: [provider],
    probeDuration: async (filePath) => (await readFile(filePath, "utf8")).startsWith("combined") ? 2.68 : 1.25,
    processAudio: async (input, output) => {
      processedPaths.push({ input, output });
      await copyFile(input, output);
    },
    combineAudio: async (segments, output) => writeFile(output, `combined:${segments.length}`)
  });
});

afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

async function projectWithComment(text = "Xin chào Việt Nam") {
  const project = await store.create("TTS cache");
  const imagePath = store.resolveProjectAsset(project.id, "assets/comments/a.png");
  await mkdir(path.dirname(imagePath), { recursive: true });
  await writeFile(imagePath, "image");
  project.settings.defaultProvider = "test";
  project.settings.defaultVoiceId = "voice-test";
  project.comments.push({
    id: "comment-a",
    order: 1,
    image: { relativePath: "assets/comments/a.png", originalName: "a.png", mimeType: "image/png", size: 5 },
    text,
    rate: 1,
    pitch: 0,
    pauseAfter: 0.4,
    audioStatus: "missing"
  });
  return store.save(project);
}

describe("TtsService", () => {
  it("rút gọn traceback của provider để giao diện không hiện lỗi kỹ thuật dài", () => {
    const error = new Error("Traceback (most recent call last):\n  File /tmp/provider.py\nRuntimeError: No audio was received. Please verify that your parameters are correct.");
    expect(compactTtsError(error)).toBe("No audio was received. Please verify that your parameters are correct.");
  });

  it("nhận diện đúng lỗi mạng tạm thời của Edge TTS", () => {
    expect(isTransientEdgeTtsError(new Error("Connection timeout to host wss://speech.platform.bing.com"))).toBe(true);
    expect(isTransientEdgeTtsError(new Error("No audio was received"))).toBe(true);
    expect(isTransientEdgeTtsError(new Error("Voice không tồn tại"))).toBe(false);
  });

  it("vẫn trả về giọng tiếng Việt mặc định khi Edge không tải được danh sách giọng", async () => {
    const edge = new EdgeTtsProvider(dataRoot, async () => {
      throw new Error("python vượt quá thời gian chờ 20000 ms");
    });
    const voices = await edge.listVoices();
    expect(voices.map((voice) => voice.id)).toEqual(["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"]);
    expect(voices.every((voice) => voice.provider === "edge" && voice.locale === "vi-VN")).toBe(true);
  });

  it("không tự đổi provider khi Edge timeout và vẫn giữ nguyên nội dung", async () => {
    const project = await projectWithComment("Nội dung phải được giữ nguyên");
    project.settings.defaultProvider = "edge";
    project.settings.defaultVoiceId = "vi-VN-HoaiMyNeural";
    project.comments[0]!.provider = "edge";
    project.comments[0]!.voiceId = "vi-VN-HoaiMyNeural";
    project.comments.push({
      ...structuredClone(project.comments[0]!),
      id: "comment-b",
      order: 2,
      text: "Comment tiếp theo",
      audioStatus: "error",
      error: "Lỗi Edge cũ"
    });
    await store.save(project);
    const macos = new FakeMacOsProvider();
    const fallbackService = new TtsService(store, process.cwd(), {
      providers: [new FailingEdgeProvider(), macos],
      probeDuration: async () => 1.25,
      processAudio: async (input, output) => copyFile(input, output),
      combineAudio: async (segments, output) => writeFile(output, `combined:${segments.length}`)
    });

    await expect(fallbackService.generateComment(project.id, "comment-a")).rejects.toThrow("Connection timeout");

    const saved = await store.get(project.id);
    expect(macos.generateCount).toBe(0);
    expect(saved.settings).toMatchObject({ defaultProvider: "edge", defaultVoiceId: "vi-VN-HoaiMyNeural" });
    expect(saved.comments[0]).toMatchObject({
      text: "Nội dung phải được giữ nguyên",
      provider: "edge",
      voiceId: "vi-VN-HoaiMyNeural",
      audioStatus: "error"
    });
    expect(saved.comments[1]).toMatchObject({
      text: "Comment tiếp theo",
      provider: "edge",
      voiceId: "vi-VN-HoaiMyNeural",
      audioStatus: "error",
      error: "Lỗi Edge cũ"
    });
  });

  it("đọc được giọng macOS dù chỉ có một khoảng trắng trước mã ngôn ngữ", async () => {
    const macos = new MacOsTtsProvider(async () => ({
      stdout: "Linh (Tiếng Việt (Việt Nam)) vi_VN    # Xin chào! Tên tôi là Linh.\nLinh (Tiếng Việt (Việt Nam)) vi_VN    # Dòng trùng từ macOS.\nAlbert              en_US    # Hello!\n",
      stderr: ""
    }));
    await expect(macos.listVoices()).resolves.toEqual([
      { id: "Linh (Tiếng Việt (Việt Nam))", name: "Linh (Tiếng Việt (Việt Nam))", locale: "vi-VN", provider: "macos" },
      { id: "Albert", name: "Albert", locale: "en-US", provider: "macos" }
    ]);
  });

  it("chuẩn hóa nhiều kiểu phản hồi kho giọng của VoiceStudio", () => {
    expect(parseVoiceStudioVoices({ data: [
      { profile_id: "voice-a", display_name: "Giọng nữ ấm", language: "vi" },
      { voice_id: "voice-b", name: "Giọng nam", locale: "vi-VN", gender: "male" }
    ] })).toEqual([
      { id: "voice-a", name: "Giọng nữ ấm", locale: "vi", provider: "voicestudio" },
      { id: "voice-b", name: "Giọng nam", locale: "vi-VN", gender: "male", provider: "voicestudio" }
    ]);
    expect(parseVoiceStudioVoices({ voices: [] })[0]).toMatchObject({ id: "default", provider: "voicestudio" });
  });

  it("kết nối VoiceStudio Local, tải voice profile và gửi yêu cầu tạo WAV", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/health")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      if (url.endsWith("/v1/audio/voices")) return new Response(JSON.stringify({ voices: [{ id: "local-1", name: "Giọng local", language: "vi" }] }), { status: 200 });
      return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
    };
    const voiceStudio = new VoiceStudioTtsProvider("http://127.0.0.1:3900", fetcher as typeof fetch);
    const output = path.join(dataRoot, "voice-studio.wav");

    await expect(voiceStudio.info()).resolves.toMatchObject({ available: true, id: "voicestudio" });
    await expect(voiceStudio.listVoices()).resolves.toEqual([
      { id: "local-1", name: "Giọng local", locale: "vi", provider: "voicestudio" }
    ]);
    await voiceStudio.generate({ text: "Xin chào", voiceId: "local-1", rate: 1.1, pitch: 0, outputPath: output });

    expect(await readFile(output)).toEqual(Buffer.from([82, 73, 70, 70]));
    const speechRequest = requests.find((request) => request.url.endsWith("/v1/audio/speech"));
    expect(JSON.parse(String(speechRequest?.init?.body))).toMatchObject({
      model: "tts-1",
      voice: "local-1",
      input: "Xin chào",
      response_format: "wav",
      speed: 1.1
    });
  });

  it("chia comment dài cho VoiceStudio rồi ghép lại để không vượt giới hạn compute", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
    };
    const combinedInputs: string[] = [];
    const voiceStudio = new VoiceStudioTtsProvider(
      "http://127.0.0.1:3900",
      fetcher as typeof fetch,
      async (inputs, outputPath) => {
        combinedInputs.push(...inputs);
        await writeFile(outputPath, "audio-đã-ghép");
      }
    );
    const output = path.join(dataRoot, "voice-studio-long.mp3");
    const text = `${"Một câu tiếng Việt đủ dài để kiểm tra chia đoạn. ".repeat(12)}Kết thúc.`;

    await voiceStudio.generate({ text, voiceId: "local-1", rate: 1, pitch: 0, outputPath: output });

    const speechRequests = requests.filter((request) => request.url.endsWith("/v1/audio/speech"));
    const generatedChunks = speechRequests.map((request) => JSON.parse(String(request.init?.body)).input as string);
    expect(generatedChunks.length).toBeGreaterThan(1);
    expect(generatedChunks.every((chunk) => chunk.length <= 180)).toBe(true);
    expect(generatedChunks.join(" ").replace(/\s+/gu, " ")).toBe(text.trim().replace(/\s+/gu, " "));
    expect(combinedInputs).toHaveLength(generatedChunks.length);
    expect(await readFile(output, "utf8")).toBe("audio-đã-ghép");
  });

  it("chia nội dung dài theo câu và không làm mất chữ", () => {
    const text = `${"Câu đầu khá dài ".repeat(30)}. ${"Câu tiếp theo ".repeat(35)}.`;
    const chunks = splitNarrationText(text, 120);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("dùng nội dung đọc đã chuẩn hóa, bỏ emoji và teencode thay vì sửa comment gốc", async () => {
    const project = await projectWithComment("mik ko bt nx 😂 [sticker]");
    project.comments[0]!.speechText = "mik ko bt nx 😂";
    await store.save(project);
    await service.generateComment(project.id, "comment-a");
    const generated = await readFile(provider.generatedPaths[0]!, "utf8").catch(() => "");
    expect(generated).toBe("");
    const cachePath = (await store.get(project.id)).comments[0]!.audioPath!;
    expect(await readFile(store.resolveProjectAsset(project.id, cachePath), "utf8")).toBe("audio:mình không biết nữa");
    expect((await store.get(project.id)).comments[0]!.text).toContain("😂");
  });

  it("lọc từ tục và làm dịu cụm nhạy cảm ngay trước khi gửi sang provider", async () => {
    const project = await projectWithComment("Nó địt mẹ rồi dọa giết người 😡");
    project.comments[0]!.speechText = "Nó địt mẹ rồi dọa giết người 😡";
    await store.save(project);

    await service.generateComment(project.id, "comment-a");

    const cachePath = (await store.get(project.id)).comments[0]!.audioPath!;
    expect(await readFile(store.resolveProjectAsset(project.id, cachePath), "utf8"))
      .toBe("audio:Nó bíp rồi dọa làm hại người");
    expect((await store.get(project.id)).comments[0]!.text).toContain("địt mẹ");
  });

  it("không gọi provider khi comment chỉ chứa sticker và emoji", async () => {
    const project = await projectWithComment("😂🔥 [sticker]");
    await expect(service.generateComment(project.id, "comment-a")).rejects.toThrow("chỉ có sticker");
    expect(provider.generateCount).toBe(0);
    expect((await store.get(project.id)).comments[0]).toMatchObject({ audioStatus: "error", error: expect.stringContaining("chỉ có sticker") });
  });

  it("batch chỉ tạo comment thiếu hoặc lỗi, bỏ qua audio sẵn sàng và tiếp tục khi có lỗi", async () => {
    const project = await projectWithComment("Audio đã có");
    project.comments[0]!.audioStatus = "ready";
    project.comments[0]!.audioDuration = 1;
    project.comments.push({
      ...structuredClone(project.comments[0]!), id: "comment-b", order: 2, text: "Nội dung mới", speechText: "Nội dung mới", audioStatus: "missing", audioDuration: undefined
    });
    project.comments.push({
      ...structuredClone(project.comments[0]!), id: "comment-c", order: 3, text: "😂 [sticker]", speechText: "", audioStatus: "error", audioDuration: undefined
    });
    await store.save(project);

    const result = await service.generateAll(project.id);

    expect(result).toMatchObject({ generated: 1, skipped: 1, failed: 1 });
    expect(result.failures[0]).toMatchObject({ commentId: "comment-c", order: 3 });
    expect(result.project.comments.map((comment) => comment.audioStatus)).toEqual(["ready", "ready", "error"]);
    expect(provider.generateCount).toBe(1);
  });

  it("hủy tiến trình TTS đang chạy của project trước khi xóa audio", async () => {
    const project = await projectWithComment("Đoạn đọc đang chạy");
    const blockingProvider = new BlockingProvider();
    const cancellableService = new TtsService(store, process.cwd(), {
      providers: [blockingProvider],
      probeDuration: async () => 1,
      processAudio: async (input, output) => copyFile(input, output),
      combineAudio: async (segments, output) => writeFile(output, `combined:${segments.length}`)
    });
    const generation = cancellableService.generateAll(project.id);
    const rejected = expect(generation).rejects.toThrow("Đã dừng tạo giọng đọc");
    await blockingProvider.started;

    await cancellableService.cancelProject(project.id);

    await rejected;
    expect(blockingProvider.generateCount).toBe(1);
  });

  it("tạo audio, đo thời lượng và gắn vào đúng comment", async () => {
    const project = await projectWithComment();
    const generated = await service.generateComment(project.id, "comment-a");
    expect(generated.comments[0]?.audioStatus).toBe("ready");
    expect(generated.comments[0]?.audioDuration).toBe(1.25);
    expect(generated.comments[0]?.audioPath).toMatch(/^audio\/[a-f0-9]{64}\.mp3$/);
    expect(generated.comments[0]?.audioProcessingVersion).toBe(AUDIO_PROCESSING_VERSION);
    expect(provider.generatedPaths[0]).toMatch(/\.provider\.mp3$/);
    expect(processedPaths[0]?.output).toMatch(/\.tmp\.mp3$/);
  });

  it("dùng lại cache khi cùng text và cấu hình", async () => {
    const first = await projectWithComment();
    await service.generateComment(first.id, "comment-a");
    const second = await projectWithComment();
    await service.generateComment(second.id, "comment-a");
    expect(provider.generateCount).toBe(1);
  });

  it("bắt buộc tạo file mới khi người dùng bấm tạo lại dù audio đang sẵn sàng", async () => {
    const project = await projectWithComment("Nội dung không đổi khi tạo lại");
    const first = await service.generateComment(project.id, "comment-a");
    const firstAudioPath = first.comments[0]!.audioPath!;

    const regenerated = await service.generateComment(project.id, "comment-a", true);
    const regeneratedAudioPath = regenerated.comments[0]!.audioPath!;

    expect(provider.generateCount).toBe(2);
    expect(regeneratedAudioPath).not.toBe(firstAudioPath);
  });

  it("VoiceStudio tạo file mới khi thử lại comment lỗi dù text và cấu hình không đổi", async () => {
    const voiceStudio = new FakeVoiceStudioProvider();
    const voiceStudioService = new TtsService(store, process.cwd(), {
      providers: [voiceStudio],
      probeDuration: async () => 1.25,
      processAudio: async (input, output) => copyFile(input, output),
      combineAudio: async (segments, output) => writeFile(output, `combined:${segments.length}`)
    });
    const prepareVoiceStudio = async () => {
      const project = await projectWithComment("Nội dung VoiceStudio giữ nguyên");
      project.settings.defaultProvider = "voicestudio";
      project.settings.defaultVoiceId = "voice-studio-test";
      project.comments[0]!.provider = "voicestudio";
      project.comments[0]!.voiceId = "voice-studio-test";
      return store.save(project);
    };

    const oldProject = await prepareVoiceStudio();
    const oldResult = await voiceStudioService.generateComment(oldProject.id, "comment-a");
    const oldAudioPath = oldResult.comments[0]!.audioPath!;

    const retryProject = await prepareVoiceStudio();
    retryProject.comments[0]!.audioStatus = "error";
    retryProject.comments[0]!.error = "Lần tạo trước bị lỗi";
    await store.save(retryProject);
    const retryResult = await voiceStudioService.generateComment(retryProject.id, "comment-a");
    const retryAudioPath = retryResult.comments[0]!.audioPath!;

    expect(voiceStudio.generateCount).toBe(2);
    expect(retryAudioPath).not.toBe(oldAudioPath);
    expect(await readFile(store.resolveProjectAsset(retryProject.id, retryAudioPath), "utf8"))
      .toBe("voicestudio:2:Nội dung VoiceStudio giữ nguyên");
  });

  it("chỉ đánh dấu stale cho comment thay đổi", async () => {
    const previous = await projectWithComment();
    previous.comments[0]!.audioStatus = "ready";
    previous.comments[0]!.audioDuration = 1;
    const incoming = structuredClone(previous);
    incoming.comments[0]!.text = "Nội dung mới";
    incoming.comments[0]!.speechText = "Nội dung mới";
    service.invalidateChangedAudio(previous, incoming);
    expect(incoming.comments[0]!.audioStatus).toBe("stale");
    expect(incoming.comments[0]!.audioDuration).toBeUndefined();
  });

  it("giữ nội dung và ghi trạng thái lỗi khi provider thất bại", async () => {
    const project = await projectWithComment("Nội dung không được mất");
    provider.generate = async () => {
      throw new Error("Provider tạm thời không khả dụng");
    };

    await expect(service.generateComment(project.id, "comment-a")).rejects.toThrow("tạm thời");
    const saved = await store.get(project.id);
    expect(saved.comments[0]!.text).toBe("Nội dung không được mất");
    expect(saved.comments[0]!.audioStatus).toBe("error");
    expect(saved.comments[0]!.error).toContain("tạm thời");
  });

  it("đánh dấu audio phiên bản cũ và chuẩn hóa lại tại local, không gọi provider", async () => {
    const project = await projectWithComment();
    const legacyRelativePath = "audio/legacy.mp3";
    await mkdir(path.dirname(store.resolveProjectAsset(project.id, legacyRelativePath)), { recursive: true });
    await writeFile(store.resolveProjectAsset(project.id, legacyRelativePath), "legacy-audio");
    project.comments[0]!.audioPath = legacyRelativePath;
    project.comments[0]!.audioDuration = 2.3;
    project.comments[0]!.audioStatus = "ready";
    await store.save(project);

    expect(service.invalidateOutdatedAudio(project)).toBe(true);
    expect(project.comments[0]!.audioStatus).toBe("stale");
    await store.save(project);
    const migrated = await service.generateComment(project.id, "comment-a");
    expect(provider.generateCount).toBe(0);
    expect(migrated.comments[0]!.audioStatus).toBe("ready");
    expect(migrated.comments[0]!.audioProcessingVersion).toBe(AUDIO_PROCESSING_VERSION);
  });

  it("yêu cầu tạo lại audio cũ khi ảnh nội dung chưa có mốc chuyển cảnh", async () => {
    const project = await projectWithComment();
    const comment = project.comments[0]!;
    comment.audioStatus = "ready";
    comment.audioProcessingVersion = AUDIO_PROCESSING_VERSION;
    comment.audioDuration = 1.25;
    comment.audioPath = "audio/ready.mp3";
    comment.attachment = {
      kind: "image", asset: comment.image, mode: "auto", detectedType: "illustration",
      classificationConfidence: 1, textBlocks: [], holdAfterSeconds: 2, clickEnabled: true
    };
    expect(service.invalidateOutdatedAudio(project)).toBe(true);
    expect(comment.audioStatus).toBe("stale");
  });

  it("cắt im lặng đầu cuối nhưng giữ nguyên phần âm thanh", async () => {
    const input = path.join(dataRoot, "co-im-lang.mp3");
    const output = path.join(dataRoot, "da-cat.mp3");
    await runCommand("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.35",
      "-f", "lavfi", "-i", "sine=frequency=800:sample_rate=48000:duration=0.5",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.8",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
      "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "128k", input
    ]);
    await normalizeNarrationAudio(input, output);
    expect(await probeDuration(input)).toBeGreaterThan(1.5);
    expect(await probeDuration(output)).toBeGreaterThan(0.45);
    expect(await probeDuration(output)).toBeLessThan(0.65);
  });

  it("tạo hai giọng hội thoại, ghép tuần tự và đặt mốc mở ảnh sau tiếng ding", async () => {
    const project = await projectWithComment("");
    project.comments[0]!.conversation = {
      enabled: true,
      image: project.comments[0]!.image,
      mode: "replace",
      revealMode: "scroll",
      speakerAVoiceId: "voice-a",
      speakerBVoiceId: "voice-b",
      messageGapSeconds: 0.08,
      dingEnabled: true,
      dingVolume: 0.25,
      dingLeadSeconds: 0.1,
      messages: [
        { id: "m1", order: 1, speaker: "a", text: "Xin chào", box: { x: 0.1, y: 0.2, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "missing" },
        { id: "m2", order: 2, speaker: "b", text: "Chào bạn", box: { x: 0.5, y: 0.4, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "missing" }
      ]
    };
    await store.save(project);
    const generated = await service.generateComment(project.id, "comment-a");
    const conversation = generated.comments[0]!.conversation!;
    expect(provider.generateCount).toBe(2);
    expect(conversation.messages.every((message) => message.audioStatus === "ready" && message.audioPath)).toBe(true);
    expect(conversation.messages[0]).toMatchObject({ revealStartSeconds: 0, voiceStartSeconds: 0.1, audioDuration: 1.25 });
    expect(conversation.messages[1]!.revealStartSeconds).toBeCloseTo(1.43, 5);
    expect(conversation.messages[1]!.voiceStartSeconds).toBeCloseTo(1.53, 5);
    expect(generated.comments[0]).toMatchObject({ audioStatus: "ready", audioDuration: 2.68 });
  });

  it("đọc comment trước, rồi đọc chữ trong ảnh theo thứ tự và giữ bản OCR gốc", async () => {
    const project = await projectWithComment("Nội dung comment");
    project.comments[0]!.attachment = {
      kind: "image",
      asset: project.comments[0]!.image,
      mode: "auto",
      detectedType: "text",
      classificationConfidence: 0.9,
      holdAfterSeconds: 2,
      clickEnabled: true,
      textBlocks: [
        { id: "b1", order: 1, text: "nma hs ko bít", speechText: "nma hs ko bít", box: { x: 0.1, y: 0.2, width: 0.6, height: 0.06 }, confidence: 1, audioStatus: "missing" },
        { id: "b2", order: 2, text: "Dòng thứ hai", speechText: "Dòng thứ hai", box: { x: 0.1, y: 0.4, width: 0.6, height: 0.06 }, confidence: 1, audioStatus: "missing" }
      ]
    };
    await store.save(project);

    const generated = await service.generateComment(project.id, "comment-a");
    const attachment = generated.comments[0]!.attachment!;
    expect(provider.generateCount).toBe(3);
    expect(attachment.revealStartSeconds).toBe(1.25);
    expect(attachment.voiceStartSeconds).toBeCloseTo(1.35, 5);
    expect(attachment.holdAfterSeconds).toBe(2);
    expect(attachment.textBlocks[0]).toMatchObject({
      text: "nma hs ko bít",
      speechText: "nhưng mà học sinh không biết",
      audioStatus: "ready"
    });
    expect(generated.comments[0]).toMatchObject({ audioStatus: "ready", audioDuration: 2.68 });
  });

  it("chèn dấu -- trước văn bản khi gọi say và không lộ API key ElevenLabs trên tham số dòng lệnh", async () => {
    const sayCalls: Array<{ command: string; args: string[] }> = [];
    const macos = new MacOsTtsProvider(async (command, args) => {
      sayCalls.push({ command, args });
      return { stdout: "", stderr: "" };
    });
    await macos.generate({
      text: "-f /etc/passwd",
      voiceId: "Linh",
      rate: 1,
      pitch: 0,
      outputPath: path.join(dataRoot, "say-safe.mp3")
    });
    expect(sayCalls[0]?.command).toBe("say");
    const separatorIndex = sayCalls[0]!.args.indexOf("--");
    expect(separatorIndex).toBeGreaterThan(0);
    expect(sayCalls[0]!.args[separatorIndex + 1]).toBe("-f /etc/passwd");

    const keychainCalls: Array<{ command: string; args: string[]; stdin?: string }> = [];
    const eleven = new ElevenLabsTtsProvider(async (command, args, options) => {
      keychainCalls.push({ command, args, stdin: options?.stdin });
      return { stdout: "", stderr: "" };
    });
    const fakeKey = "test-key-never-in-argv";
    await eleven.saveApiKey(fakeKey);
    expect(keychainCalls).toHaveLength(1);
    expect(keychainCalls[0]?.command).toBe("security");
    expect(keychainCalls[0]?.args).toEqual(["-i"]);
    expect(keychainCalls[0]?.args.join(" ")).not.toContain(fakeKey);
    expect(keychainCalls[0]?.stdin).toContain(`-X ${Buffer.from(fakeKey, "utf8").toString("hex")}`);
  });
});
