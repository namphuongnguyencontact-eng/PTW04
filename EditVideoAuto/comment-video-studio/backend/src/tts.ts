import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CommentItem,
  ConversationMessage,
  ProjectData,
  TtsProviderId,
  TtsProviderInfo,
  VoiceInfo
} from "@comment-video-studio/shared";
import { narrationText, normalizeSpeechText } from "@comment-video-studio/shared";
import { attachmentContentType } from "@comment-video-studio/shared";
import { runCommand } from "./command.js";
import { probeDuration as probeDurationWithFfprobe } from "./media.js";
import { ProjectStore } from "./storage.js";

export interface TtsRequest {
  text: string;
  voiceId: string;
  rate: number;
  pitch: number;
  outputPath: string;
  signal?: AbortSignal;
}

export interface TtsProvider {
  readonly id: TtsProviderId;
  info(): Promise<TtsProviderInfo>;
  listVoices(): Promise<VoiceInfo[]>;
  generate(request: TtsRequest): Promise<void>;
}

export function compactTtsError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Lỗi không xác định.";
  const runtimeMessages = [...raw.matchAll(/(?:RuntimeError|Error):\s*([^\n]+)/g)].map((match) => match[1]!.trim());
  const useful = runtimeMessages.at(-1)
    ?? raw.split("\n").map((line) => line.trim()).filter(Boolean).at(-1)
    ?? "Lỗi không xác định.";
  return useful.replace(/\s+/g, " ").slice(0, 320);
}

export function isTransientEdgeTtsError(error: unknown) {
  const detail = compactTtsError(error).toLowerCase();
  return [
    "timeout", "timed out", "connection", "websocket", "no audio was received",
    "không phản hồi", "vượt quá thời gian chờ", "temporarily unavailable", "service unavailable"
  ].some((marker) => detail.includes(marker));
}

const edgeVietnameseFallbackVoices: VoiceInfo[] = [
  { id: "vi-VN-HoaiMyNeural", name: "Microsoft Hoài My Online (Natural) - Vietnamese (Vietnam)", locale: "vi-VN", gender: "Female", provider: "edge" },
  { id: "vi-VN-NamMinhNeural", name: "Microsoft Nam Minh Online (Natural) - Vietnamese (Vietnam)", locale: "vi-VN", gender: "Male", provider: "edge" }
];

export function splitNarrationText(input: string, maximumLength = 700) {
  const text = input.trim();
  if (!text) return [];
  const sentences = text.match(/[^.!?]+[.!?]*\s*/gu) ?? [text];
  const chunks: string[] = [];
  let current = "";
  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maximumLength) {
      if (!current || `${current} ${trimmed}`.length <= maximumLength) current = current ? `${current} ${trimmed}` : trimmed;
      else { pushCurrent(); current = trimmed; }
      continue;
    }
    pushCurrent();
    for (const word of trimmed.split(/\s+/u)) {
      if (!current || `${current} ${word}`.length <= maximumLength) current = current ? `${current} ${word}` : word;
      else { pushCurrent(); current = word; }
    }
  }
  pushCurrent();
  return chunks;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class EdgeTtsProvider implements TtsProvider {
  readonly id = "edge" as const;

  constructor(
    private readonly projectRoot: string,
    private readonly commandRunner = runCommand
  ) {}

  private get pythonPath() {
    return path.join(this.projectRoot, ".venv", "bin", "python");
  }

  private get scriptPath() {
    return path.join(this.projectRoot, "tts-providers", "edge_provider.py");
  }

  async info(): Promise<TtsProviderInfo> {
    const available = await fileExists(this.pythonPath);
    return {
      id: this.id,
      name: "Edge TTS",
      available,
      configured: available,
      online: true,
      supportsPitch: true,
      notice: "Nội dung sẽ được gửi tới dịch vụ giọng nói trực tuyến của Microsoft Edge.",
      error: available ? undefined : "Chưa cài Edge TTS. Hãy chạy setup.sh."
    };
  }

  async listVoices() {
    try {
      const { stdout } = await this.commandRunner(this.pythonPath, [this.scriptPath, "voices"], { timeoutMs: 20_000 });
      return (JSON.parse(stdout) as Array<Omit<VoiceInfo, "provider">>).map((voice) => ({ ...voice, provider: this.id }));
    } catch {
      return structuredClone(edgeVietnameseFallbackVoices);
    }
  }

  async generate(request: TtsRequest) {
    const ratePercent = Math.round((request.rate - 1) * 100);
    const chunks = splitNarrationText(request.text);
    const outputs = chunks.map((_chunk, index) => `${request.outputPath}.${index}.mp3`);
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        request.signal?.throwIfAborted();
        await this.commandRunner(this.pythonPath, [
          this.scriptPath,
          "generate",
          `--voice=${request.voiceId}`,
          `--rate=${ratePercent >= 0 ? "+" : ""}${ratePercent}%`,
          `--pitch=${request.pitch >= 0 ? "+" : ""}${Math.round(request.pitch)}Hz`,
          `--output=${outputs[index]!}`,
          `--text=${chunks[index]!}`
        ], { timeoutMs: 70_000, signal: request.signal });
      }
      if (outputs.length === 1) await rename(outputs[0]!, request.outputPath);
      else {
        const args = ["-hide_banner", "-loglevel", "error", "-y"];
        outputs.forEach((output) => args.push("-i", output));
        args.push("-filter_complex", `${outputs.map((_output, index) => `[${index}:a]`).join("")}concat=n=${outputs.length}:v=0:a=1[a]`, "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "128k", request.outputPath);
        await this.commandRunner("ffmpeg", args, { timeoutMs: 150_000, signal: request.signal });
      }
    } catch (error) {
      const detail = compactTtsError(error);
      throw new Error(`Edge TTS chưa tạo được audio. Hãy thử lại hoặc chọn “Giọng đọc macOS”. Nội dung vẫn được giữ. Chi tiết: ${detail}`);
    } finally {
      await Promise.all(outputs.map((output) => unlink(output).catch(() => undefined)));
    }
  }
}

export class MacOsTtsProvider implements TtsProvider {
  readonly id = "macos" as const;

  constructor(private readonly commandRunner = runCommand) {}

  async info(): Promise<TtsProviderInfo> {
    try {
      await this.commandRunner("say", ["-v", "?"], { timeoutMs: 10_000 });
      return {
        id: this.id,
        name: "Giọng đọc macOS",
        available: true,
        configured: true,
        online: false,
        supportsPitch: false,
        notice: "Xử lý hoàn toàn trên máy Mac, không gửi nội dung ra ngoài."
      };
    } catch (error) {
      return {
        id: this.id,
        name: "Giọng đọc macOS",
        available: false,
        configured: false,
        online: false,
        supportsPitch: false,
        notice: "Xử lý hoàn toàn trên máy Mac.",
        error: error instanceof Error ? error.message : "Lệnh say không khả dụng."
      };
    }
  }

  async listVoices() {
    const { stdout } = await this.commandRunner("say", ["-v", "?"], { timeoutMs: 10_000 });
    const voices = stdout
      .split("\n")
      .map((line) => line.match(/^(.*?)\s+([a-z]{2}_[A-Z]{2})\s+#/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => ({
        id: match[1]!.trim(),
        name: match[1]!.trim(),
        locale: match[2]!.replace("_", "-"),
        provider: this.id
      }));
    return [...new Map(voices.map((voice) => [`${voice.id}:${voice.locale}`, voice])).values()];
  }

  async generate(request: TtsRequest) {
    const temporaryAiff = `${request.outputPath}.${randomUUID()}.aiff`;
    try {
      await this.commandRunner("say", [
        "-v", request.voiceId,
        "-r", String(Math.round(180 * request.rate)),
        "-o", temporaryAiff,
        "--",
        request.text
      ], { timeoutMs: 120_000, signal: request.signal });
      await this.commandRunner("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", temporaryAiff,
        "-ar", "48000", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "128k",
        request.outputPath
      ], { timeoutMs: 120_000, signal: request.signal });
    } finally {
      await unlink(temporaryAiff).catch(() => undefined);
    }
  }
}

type FetchLike = typeof fetch;

function voiceStudioItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.voices)) return record.voices;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.items)) return record.items;
  return [];
}

export function parseVoiceStudioVoices(payload: unknown): VoiceInfo[] {
  const voices = voiceStudioItems(payload).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const voice = item as Record<string, unknown>;
    const id = String(voice.id ?? voice.voice_id ?? voice.profile_id ?? "").trim();
    if (!id) return [];
    const name = String(voice.name ?? voice.display_name ?? voice.label ?? id).trim();
    const locale = String(voice.locale ?? voice.language ?? voice.language_code ?? "đa ngôn ngữ").trim();
    const gender = typeof voice.gender === "string" ? voice.gender : undefined;
    return [{ id, name, locale, gender, provider: "voicestudio" as const }];
  });
  return voices.length ? voices : [{
    id: "default",
    name: "Giọng mặc định VoiceStudio",
    locale: "đa ngôn ngữ",
    provider: "voicestudio"
  }];
}

async function concatenateVoiceStudioChunks(inputPaths: string[], outputPath: string, signal?: AbortSignal) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  inputPaths.forEach((inputPath) => args.push("-i", inputPath));
  args.push(
    "-filter_complex",
    `${inputPaths.map((_inputPath, index) => `[${index}:a]`).join("")}concat=n=${inputPaths.length}:v=0:a=1[a]`,
    "-map", "[a]",
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    outputPath
  );
  await runCommand("ffmpeg", args, { timeoutMs: 150_000, signal });
}

export class VoiceStudioTtsProvider implements TtsProvider {
  readonly id = "voicestudio" as const;
  private readonly baseUrl: string;

  constructor(
    baseUrl = process.env.VOICESTUDIO_URL ?? "http://127.0.0.1:3900",
    private readonly fetcher: FetchLike = fetch,
    private readonly combineChunks: (inputPaths: string[], outputPath: string, signal?: AbortSignal) => Promise<void> = concatenateVoiceStudioChunks
  ) {
    this.baseUrl = baseUrl.replace(/\/$/u, "");
  }

  private async request(route: string, init: RequestInit = {}, timeoutMs = 8_000, signal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref();
    try {
      return await this.fetcher(`${this.baseUrl}${route}`, { ...init, signal: controller.signal });
    } catch (error) {
      const detail = error instanceof Error && error.name === "AbortError"
        ? "quá thời gian chờ"
        : compactTtsError(error);
      throw new Error(`Không kết nối được VoiceStudio Local tại ${this.baseUrl}: ${detail}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  async info(): Promise<TtsProviderInfo> {
    try {
      const response = await this.request("/health", {}, 2_500);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return {
        id: this.id,
        name: "VoiceStudio Local",
        available: true,
        configured: true,
        online: false,
        supportsPitch: false,
        notice: "Tạo giọng và voice profile hoàn toàn trên máy; model chỉ nạp khi sử dụng."
      };
    } catch (error) {
      return {
        id: this.id,
        name: "VoiceStudio Local",
        available: false,
        configured: false,
        online: false,
        supportsPitch: false,
        notice: "Kết nối cục bộ theo yêu cầu, không gửi nội dung ra Internet.",
        error: `${compactTtsError(error)} Hãy mở backend VoiceStudio rồi bấm “Tải lại kho giọng”.`
      };
    }
  }

  async listVoices() {
    const response = await this.request("/v1/audio/voices");
    if (!response.ok) throw new Error(`VoiceStudio không tải được kho giọng (HTTP ${response.status}).`);
    return parseVoiceStudioVoices(await response.json());
  }

  async generate(request: TtsRequest) {
    // OmniVoice có thể vượt ngân sách compute 305 giây trên Apple Silicon khi
    // nhận một comment dài. Chia nhỏ ở phía client giữ từng job đủ nhẹ, sau đó
    // ghép tuần tự để timeline vẫn chỉ nhận một file audio duy nhất.
    const chunks = splitNarrationText(request.text, 180);
    const outputs = chunks.map((_chunk, index) => `${request.outputPath}.${index}.wav`);
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        request.signal?.throwIfAborted();
        const response = await this.request("/v1/audio/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "tts-1",
            voice: request.voiceId,
            input: chunks[index],
            response_format: "wav",
            speed: request.rate
          })
        }, 15 * 60_000, request.signal);
        if (!response.ok) {
          const detail = compactTtsError((await response.text()).slice(0, 1_200));
          const retryHint = response.status === 429 || response.status === 503
            ? " VoiceStudio đang bận hoặc job trước chưa nhả thiết bị; hãy chờ một lát rồi thử lại."
            : "";
          throw new Error(`VoiceStudio chưa tạo được đoạn ${index + 1}/${chunks.length} (HTTP ${response.status}).${retryHint} Chi tiết: ${detail}`);
        }
        await writeFile(outputs[index]!, Buffer.from(await response.arrayBuffer()));
      }
      if (outputs.length === 1) await rename(outputs[0]!, request.outputPath);
      else await this.combineChunks(outputs, request.outputPath, request.signal);
    } finally {
      await Promise.all(outputs.map((output) => unlink(output).catch(() => undefined)));
    }
  }
}

const keychainService = "COMMENT_VIDEO_STUDIO_ELEVENLABS";

export class ElevenLabsTtsProvider implements TtsProvider {
  readonly id = "elevenlabs" as const;

  constructor(private readonly commandRunner = runCommand) {}

  async getApiKey() {
    if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
    try {
      const { stdout } = await this.commandRunner("security", [
        "find-generic-password", "-s", keychainService, "-a", "api", "-w"
      ], { timeoutMs: 10_000 });
      return stdout.trim();
    } catch {
      return undefined;
    }
  }

  async saveApiKey(apiKey: string) {
    const trimmed = apiKey.trim();
    if (!trimmed) throw new Error("API key ElevenLabs không được để trống.");
    const hexSecret = Buffer.from(trimmed, "utf8").toString("hex");
    await this.commandRunner("security", ["-i"], {
      timeoutMs: 10_000,
      stdin: `add-generic-password -U -s ${keychainService} -a api -X ${hexSecret}\n`
    });
  }

  async deleteApiKey() {
    await this.commandRunner("security", ["delete-generic-password", "-s", keychainService, "-a", "api"], { timeoutMs: 10_000 });
  }

  async info(): Promise<TtsProviderInfo> {
    const configured = Boolean(await this.getApiKey());
    return {
      id: this.id,
      name: "ElevenLabs",
      available: configured,
      configured,
      online: true,
      supportsPitch: false,
      notice: "Nội dung sẽ được gửi tới ElevenLabs và có thể tiêu tốn quota trả phí.",
      error: configured ? undefined : "Chưa lưu API key ElevenLabs."
    };
  }

  async listVoices() {
    const apiKey = await this.requireApiKey();
    const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
      headers: { "xi-api-key": apiKey }
    });
    if (!response.ok) throw new Error(`ElevenLabs không lấy được danh sách giọng (${response.status}).`);
    const payload = await response.json() as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> };
    return (payload.voices ?? []).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      locale: voice.labels?.language ?? voice.labels?.accent ?? "đa ngôn ngữ",
      gender: voice.labels?.gender,
      provider: this.id
    }));
  }

  async generate(request: TtsRequest) {
    const apiKey = await this.requireApiKey();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        signal: request.signal,
        headers: {
          "content-type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          text: request.text,
          model_id: "eleven_flash_v2_5",
          language_code: "vi",
          voice_settings: { speed: request.rate }
        })
      }
    );
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`ElevenLabs tạo audio thất bại (${response.status}): ${message.slice(0, 300)}`);
    }
    await writeFile(request.outputPath, Buffer.from(await response.arrayBuffer()));
  }

  private async requireApiKey() {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Chưa cấu hình API key ElevenLabs.");
    return apiKey;
  }
}

export interface TtsServiceOptions {
  providers?: TtsProvider[];
  probeDuration?: (filePath: string) => Promise<number>;
  processAudio?: (inputPath: string, outputPath: string, signal?: AbortSignal) => Promise<void>;
  combineAudio?: (segments: Array<{ path: string; duration: number; lead: number; pad: number }>, outputPath: string, signal?: AbortSignal) => Promise<void>;
}

export const AUDIO_PROCESSING_VERSION = 2;

export async function normalizeNarrationAudio(inputPath: string, outputPath: string, signal?: AbortSignal) {
  await runCommand("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inputPath,
    "-af", "silenceremove=start_periods=1:start_duration=0:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-60dB,areverse",
    "-ar", "48000", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "128k",
    outputPath
  ], { timeoutMs: 120_000, signal });
}

export async function combineNarrationAudio(
  segments: Array<{ path: string; duration: number; lead: number; pad: number }>,
  outputPath: string,
  signal?: AbortSignal
) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  segments.forEach((segment) => args.push("-i", segment.path));
  const filters = segments.map((segment, index) => {
    const duration = segment.lead + segment.duration + segment.pad;
    return `[${index}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,adelay=${Math.round(segment.lead * 1000)},apad=pad_dur=${segment.pad.toFixed(6)},atrim=duration=${duration.toFixed(6)}[a${index}]`;
  });
  filters.push(`${segments.map((_segment, index) => `[a${index}]`).join("")}concat=n=${segments.length}:v=0:a=1[audio]`);
  args.push("-filter_complex", filters.join(";"), "-map", "[audio]", "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", outputPath);
  await runCommand("ffmpeg", args, { timeoutMs: 120_000, signal });
}

export class TtsService {
  private readonly providers = new Map<TtsProviderId, TtsProvider>();
  private readonly activeOperations = new Map<string, Set<{ controller: AbortController; done: Promise<void> }>>();
  private readonly probeDuration: (filePath: string) => Promise<number>;
  private readonly processAudio: (inputPath: string, outputPath: string, signal?: AbortSignal) => Promise<void>;
  private readonly combineAudio: (segments: Array<{ path: string; duration: number; lead: number; pad: number }>, outputPath: string, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly store: ProjectStore, projectRoot: string, options: TtsServiceOptions = {}) {
    const providers = options.providers ?? [
      new EdgeTtsProvider(projectRoot),
      new ElevenLabsTtsProvider(),
      new MacOsTtsProvider(),
      new VoiceStudioTtsProvider()
    ];
    for (const provider of providers) this.providers.set(provider.id, provider);
    this.probeDuration = options.probeDuration ?? probeDurationWithFfprobe;
    this.processAudio = options.processAudio ?? normalizeNarrationAudio;
    this.combineAudio = options.combineAudio ?? combineNarrationAudio;
  }

  async providerInfo() {
    return Promise.all([...this.providers.values()].map((provider) => provider.info()));
  }

  async listVoices(providerId: TtsProviderId, language?: string) {
    const voices = await this.requireProvider(providerId).listVoices();
    if (!language) return voices;
    const normalized = language.toLowerCase();
    const filtered = voices.filter((voice) => voice.locale.toLowerCase().startsWith(normalized));
    return providerId === "voicestudio" && !filtered.length ? voices : filtered;
  }

  private async runProjectOperation<T>(projectId: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => { finish = resolve; });
    const operation = { controller, done };
    const operations = this.activeOperations.get(projectId) ?? new Set();
    operations.add(operation);
    this.activeOperations.set(projectId, operations);
    try {
      return await task(controller.signal);
    } finally {
      operations.delete(operation);
      if (!operations.size) this.activeOperations.delete(projectId);
      finish();
    }
  }

  async cancelProject(projectId: string) {
    const operations = [...(this.activeOperations.get(projectId) ?? [])];
    operations.forEach((operation) => operation.controller.abort());
    await Promise.all(operations.map((operation) => operation.done));
  }

  async generateComment(projectId: string, commentId: string, forceRegenerate = false) {
    return this.runProjectOperation(projectId, (signal) => (
      this.generateCommentOnce(projectId, commentId, forceRegenerate, signal)
    ));
  }

  private async generateCommentOnce(projectId: string, commentId: string, forceRegenerate = false, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const project = await this.store.get(projectId);
    const comment = project.comments.find((candidate) => candidate.id === commentId);
    if (!comment) throw new Error("Không tìm thấy comment cần tạo giọng đọc.");
    if (comment.conversation?.enabled && comment.conversation.messages.length) {
      return this.generateConversationOnce(projectId, commentId, undefined, forceRegenerate, signal);
    }
    const readableAttachmentBlocks = comment.attachment?.textBlocks
      .slice()
      .sort((left, right) => left.order - right.order)
      .filter((block) => normalizeSpeechText(block.speechText || block.text));
    if (attachmentContentType(comment.attachment) === "text" && readableAttachmentBlocks?.length) {
      return this.generateAttachmentNarration(projectId, project, comment, forceRegenerate, signal);
    }
    if (comment.attachment && attachmentContentType(comment.attachment) === "text" && !readableAttachmentBlocks?.length && comment.attachment.mode === "auto") {
      comment.attachment.detectedType = "illustration";
    }
    const speech = narrationText(comment);
    if (!speech) {
      comment.audioStatus = "error";
      comment.error = "Comment chỉ có sticker, emoji hoặc chưa có chữ để đọc.";
      await this.store.save(project);
      throw new Error(comment.error);
    }

    const providerId = comment.provider ?? project.settings.defaultProvider;
    const voiceId = comment.voiceId ?? project.settings.defaultVoiceId;
    if (!voiceId) {
      comment.audioStatus = "error";
      comment.error = "Bạn chưa chọn giọng đọc.";
      await this.store.save(project);
      throw new Error(comment.error);
    }
    const shouldForceRegeneration = forceRegenerate
      || (providerId === "voicestudio" && comment.audioStatus === "error");
    const cacheKey = this.cacheKey({
      providerId,
      voiceId,
      text: speech,
      rate: comment.rate,
      pitch: comment.pitch
    }, shouldForceRegeneration ? randomUUID() : undefined);
    const cacheFile = path.join(this.store.audioCacheRoot, `${cacheKey}.mp3`);
    const previousAudioPath = comment.audioProcessingVersion !== AUDIO_PROCESSING_VERSION && comment.audioPath
      ? this.store.resolveProjectAsset(projectId, comment.audioPath)
      : undefined;
    await mkdir(this.store.audioCacheRoot, { recursive: true });

    comment.audioStatus = "generating";
    comment.error = undefined;
    await this.store.save(project);

    try {
      if (!(await fileExists(cacheFile))) {
        const identifier = randomUUID();
        const providerOutput = `${cacheFile}.${identifier}.provider.mp3`;
        const temporary = `${cacheFile}.${identifier}.tmp.mp3`;
        try {
          if (!shouldForceRegeneration && previousAudioPath && await fileExists(previousAudioPath)) {
            await this.processAudio(previousAudioPath, temporary, signal);
          } else {
            await this.requireProvider(providerId).generate({
              text: speech,
              voiceId,
              rate: comment.rate,
              pitch: comment.pitch,
              outputPath: providerOutput,
              signal
            });
            await this.processAudio(providerOutput, temporary, signal);
          }
          signal?.throwIfAborted();
          await rename(temporary, cacheFile);
        } finally {
          await unlink(providerOutput).catch(() => undefined);
          await unlink(temporary).catch(() => undefined);
        }
      }
      const audioDuration = await this.probeDuration(cacheFile);
      comment.audioPath = await this.store.attachAudio(projectId, cacheFile, cacheKey);
      comment.audioCacheKey = cacheKey;
      comment.audioProcessingVersion = AUDIO_PROCESSING_VERSION;
      comment.audioDuration = audioDuration;
      if (comment.attachment) {
        comment.attachment.revealStartSeconds = audioDuration;
        comment.attachment.voiceStartSeconds = undefined;
        comment.attachment.audioDuration = 0;
      }
      comment.audioStatus = "ready";
      comment.error = undefined;
      return await this.store.save(project);
    } catch (error) {
      comment.audioStatus = "error";
      comment.error = error instanceof Error ? error.message : "Không tạo được audio.";
      await this.store.save(project);
      throw error;
    }
  }

  private async generateAttachmentNarration(
    projectId: string,
    project: ProjectData,
    comment: CommentItem,
    forceRegenerate = false,
    signal?: AbortSignal
  ) {
    const attachment = comment.attachment!;
    const providerId = comment.provider ?? project.settings.defaultProvider;
    const voiceId = comment.voiceId ?? project.settings.defaultVoiceId;
    if (!voiceId) throw new Error("Bạn chưa chọn giọng đọc.");
    const provider = this.requireProvider(providerId);
    const blocks = attachment.textBlocks.slice().sort((left, right) => left.order - right.order);
    const shouldForceRegeneration = forceRegenerate || (
      providerId === "voicestudio"
      && (comment.audioStatus === "error" || blocks.some((block) => block.audioStatus === "error"))
    );
    comment.audioStatus = "generating";
    comment.error = undefined;
    blocks.forEach((block) => {
      block.speechText = normalizeSpeechText(block.speechText || block.text);
      block.audioStatus = block.speechText ? "generating" : "missing";
      block.error = undefined;
    });
    await this.store.save(project);
    try {
      const segments: Array<{ path: string; duration: number; lead: number; pad: number }> = [];
      let cursor = 0;
      const introSpeech = narrationText(comment);
      if (introSpeech) {
        const intro = await this.generateUnit(projectId, {
          providerId, voiceId, text: introSpeech, rate: comment.rate, pitch: comment.pitch
        }, provider, shouldForceRegeneration, signal);
        segments.push({ path: intro.cacheFile, duration: intro.duration, lead: 0, pad: 0 });
        cursor = intro.duration;
      }
      attachment.revealStartSeconds = cursor;
      const readableBlocks = blocks.filter((block) => block.speechText);
      for (let index = 0; index < readableBlocks.length; index += 1) {
        const block = readableBlocks[index]!;
        const unit = await this.generateUnit(projectId, {
          providerId, voiceId, text: block.speechText, rate: comment.rate, pitch: comment.pitch
        }, provider, shouldForceRegeneration, signal);
        Object.assign(block, {
          audioPath: unit.audioPath,
          audioCacheKey: unit.cacheKey,
          audioProcessingVersion: AUDIO_PROCESSING_VERSION,
          audioDuration: unit.duration,
          audioStatus: "ready" as const,
          error: undefined
        });
        const lead = index === 0 && attachment.clickEnabled ? 0.1 : 0;
        const pad = index === readableBlocks.length - 1 ? 0 : 0.08;
        if (index === 0) attachment.voiceStartSeconds = cursor + lead;
        segments.push({ path: unit.cacheFile, duration: unit.duration, lead, pad });
        cursor += lead + unit.duration + pad;
      }
      if (!segments.length) throw new Error("Comment và ảnh nội dung chưa có chữ để đọc.");
      attachment.audioDuration = Math.max(0, cursor - (attachment.revealStartSeconds ?? 0));
      const combinedKey = createHash("sha256").update(JSON.stringify({
        version: AUDIO_PROCESSING_VERSION,
        kind: "attachment-text",
        reveal: attachment.revealStartSeconds,
        click: attachment.clickEnabled,
        segments: segments.map((segment) => ({ duration: segment.duration, lead: segment.lead, pad: segment.pad, path: path.basename(segment.path) }))
      })).digest("hex");
      const cacheFile = path.join(this.store.audioCacheRoot, `${combinedKey}.mp3`);
      if (!(await fileExists(cacheFile))) {
        const temporary = `${cacheFile}.${randomUUID()}.tmp.mp3`;
        try {
          await this.combineAudio(segments, temporary, signal);
          signal?.throwIfAborted();
          await rename(temporary, cacheFile);
        } finally {
          await unlink(temporary).catch(() => undefined);
        }
      }
      comment.audioPath = await this.store.attachAudio(projectId, cacheFile, combinedKey);
      comment.audioCacheKey = combinedKey;
      comment.audioProcessingVersion = AUDIO_PROCESSING_VERSION;
      comment.audioDuration = await this.probeDuration(cacheFile);
      comment.audioStatus = "ready";
      comment.error = undefined;
      return this.store.save(project);
    } catch (error) {
      blocks.filter((block) => block.audioStatus === "generating").forEach((block) => {
        block.audioStatus = "error";
        block.error = error instanceof Error ? error.message : "Không tạo được giọng cho chữ trong ảnh.";
      });
      comment.audioStatus = "error";
      comment.error = error instanceof Error ? error.message : "Không tạo được giọng cho ảnh nội dung.";
      await this.store.save(project);
      throw error;
    }
  }

  async generateConversation(projectId: string, commentId: string, messageId?: string, forceRegenerate = false) {
    return this.runProjectOperation(projectId, (signal) => (
      this.generateConversationOnce(projectId, commentId, messageId, forceRegenerate, signal)
    ));
  }

  private async generateConversationOnce(
    projectId: string,
    commentId: string,
    messageId?: string,
    forceRegenerate = false,
    signal?: AbortSignal
  ) {
    const project = await this.store.get(projectId);
    const comment = project.comments.find((candidate) => candidate.id === commentId);
    const conversation = comment?.conversation;
    if (!comment || !conversation?.enabled) throw new Error("Comment chưa bật hội thoại trong ảnh.");
    const ordered = conversation.messages.slice().sort((left, right) => left.order - right.order);
    const targets = messageId ? ordered.filter((message) => message.id === messageId) : ordered;
    if (messageId && !targets.length) throw new Error("Không tìm thấy tin nhắn cần tạo giọng đọc.");
    if (!targets.length) throw new Error("Ảnh hội thoại chưa có tin nhắn.");
    const providerId = comment.provider ?? project.settings.defaultProvider;
    const provider = this.requireProvider(providerId);
    const retryingFailedVoiceStudioComment = providerId === "voicestudio" && comment.audioStatus === "error";
    const failedMessageIds = new Set(
      providerId === "voicestudio"
        ? targets.filter((message) => message.audioStatus === "error").map((message) => message.id)
        : []
    );
    comment.audioStatus = "generating";
    comment.error = undefined;
    targets.forEach((message) => { message.audioStatus = "generating"; message.error = undefined; });
    await this.store.save(project);
    try {
      for (const message of targets) {
        const messageSpeech = normalizeSpeechText(message.text);
        if (!messageSpeech) throw new Error(`Tin nhắn ${message.order} chỉ có sticker, emoji hoặc chưa có chữ để đọc.`);
        const voiceId = message.voiceId
          || (message.speaker === "b" ? conversation.speakerBVoiceId : conversation.speakerAVoiceId)
          || comment.voiceId
          || project.settings.defaultVoiceId;
        const unit = await this.generateUnit(projectId, {
          providerId, voiceId, text: messageSpeech, rate: comment.rate, pitch: comment.pitch
        }, provider, forceRegenerate || retryingFailedVoiceStudioComment || failedMessageIds.has(message.id), signal);
        Object.assign(message, {
          audioPath: unit.audioPath,
          audioCacheKey: unit.cacheKey,
          audioProcessingVersion: AUDIO_PROCESSING_VERSION,
          audioDuration: unit.duration,
          audioStatus: "ready" as const,
          error: undefined
        });
      }
      const allReady = ordered.every((message) => message.audioStatus === "ready" && message.audioPath && message.audioDuration);
      if (!allReady) {
        comment.audioStatus = "stale";
        comment.audioDuration = undefined;
        comment.audioCacheKey = undefined;
        return this.store.save(project);
      }
      const combinedSegments: Array<{ path: string; duration: number; lead: number; pad: number }> = [];
      let cursor = 0;
      const introSpeech = narrationText(comment);
      if (conversation.mode === "after-comment" && introSpeech) {
        const voiceId = comment.voiceId ?? project.settings.defaultVoiceId;
        const intro = await this.generateUnit(projectId, {
          providerId, voiceId, text: introSpeech, rate: comment.rate, pitch: comment.pitch
        }, provider, forceRegenerate || retryingFailedVoiceStudioComment, signal);
        combinedSegments.push({ path: intro.cacheFile, duration: intro.duration, lead: 0, pad: conversation.messageGapSeconds });
        cursor = intro.duration + conversation.messageGapSeconds;
      }
      ordered.forEach((message, index) => {
        const lead = conversation.dingEnabled ? conversation.dingLeadSeconds : 0;
        const pad = index === ordered.length - 1 ? 0 : conversation.messageGapSeconds;
        message.revealStartSeconds = cursor;
        message.voiceStartSeconds = cursor + lead;
        combinedSegments.push({
          path: this.store.resolveProjectAsset(projectId, message.audioPath!),
          duration: message.audioDuration!, lead, pad
        });
        cursor += lead + message.audioDuration! + pad;
      });
      const combinedKey = createHash("sha256").update(JSON.stringify({
        version: AUDIO_PROCESSING_VERSION,
        mode: conversation.mode,
        gap: conversation.messageGapSeconds,
        lead: conversation.dingEnabled ? conversation.dingLeadSeconds : 0,
        segments: combinedSegments.map((segment) => ({ duration: segment.duration, lead: segment.lead, pad: segment.pad, path: path.basename(segment.path) }))
      })).digest("hex");
      const cacheFile = path.join(this.store.audioCacheRoot, `${combinedKey}.mp3`);
      if (!(await fileExists(cacheFile))) {
        const temporary = `${cacheFile}.${randomUUID()}.tmp.mp3`;
        try {
          await this.combineAudio(combinedSegments, temporary, signal);
          signal?.throwIfAborted();
          await rename(temporary, cacheFile);
        } finally {
          await unlink(temporary).catch(() => undefined);
        }
      }
      comment.audioPath = await this.store.attachAudio(projectId, cacheFile, combinedKey);
      comment.audioCacheKey = combinedKey;
      comment.audioProcessingVersion = AUDIO_PROCESSING_VERSION;
      comment.audioDuration = await this.probeDuration(cacheFile);
      comment.audioStatus = "ready";
      comment.error = undefined;
      return this.store.save(project);
    } catch (error) {
      targets.filter((message) => message.audioStatus === "generating").forEach((message) => {
        message.audioStatus = "error";
        message.error = error instanceof Error ? error.message : "Không tạo được audio.";
      });
      comment.audioStatus = "error";
      comment.error = error instanceof Error ? error.message : "Không tạo được hội thoại.";
      await this.store.save(project);
      throw error;
    }
  }

  async generateAll(projectId: string) {
    return this.runProjectOperation(projectId, (signal) => this.generateAllOnce(projectId, signal));
  }

  private async generateAllOnce(projectId: string, signal: AbortSignal) {
    let project = await this.store.get(projectId);
    let generated = 0;
    let skipped = 0;
    const failures: Array<{ commentId: string; order: number; error: string }> = [];
    for (const comment of project.comments.slice().sort((left, right) => left.order - right.order)) {
      signal.throwIfAborted();
      if (comment.audioStatus === "ready") {
        skipped += 1;
        continue;
      }
      try {
        project = await this.generateCommentOnce(projectId, comment.id, false, signal);
        generated += 1;
      } catch (error) {
        if (signal.aborted) throw new Error("Đã dừng tạo giọng đọc.");
        failures.push({ commentId: comment.id, order: comment.order, error: compactTtsError(error) });
        project = await this.store.get(projectId);
      }
    }
    return { project, generated, skipped, failed: failures.length, failures };
  }

  invalidateChangedAudio(previous: ProjectData, incoming: ProjectData) {
    const previousById = new Map(previous.comments.map((comment) => [comment.id, comment]));
    for (const comment of incoming.comments) {
      const old = previousById.get(comment.id);
      if (!old) continue;
      const changed = narrationText(old) !== narrationText(comment)
        || (old.provider ?? previous.settings.defaultProvider) !== (comment.provider ?? incoming.settings.defaultProvider)
        || (old.voiceId ?? previous.settings.defaultVoiceId) !== (comment.voiceId ?? incoming.settings.defaultVoiceId)
        || old.rate !== comment.rate
        || old.pitch !== comment.pitch;
      if (changed) {
        comment.audioStatus = comment.text.trim() ? "stale" : "missing";
        comment.audioDuration = undefined;
        comment.audioCacheKey = undefined;
        comment.error = undefined;
      }
      const oldAttachment = old.attachment;
      const nextAttachment = comment.attachment;
      if (nextAttachment) {
        const oldBlocks = new Map(oldAttachment?.textBlocks.map((block) => [block.id, block]) ?? []);
        let attachmentChanged = !oldAttachment
          || oldAttachment.mode !== nextAttachment.mode
          || oldAttachment.detectedType !== nextAttachment.detectedType
          || oldAttachment.clickEnabled !== nextAttachment.clickEnabled
          || oldAttachment.textBlocks.length !== nextAttachment.textBlocks.length;
        for (const block of nextAttachment.textBlocks) {
          const oldBlock = oldBlocks.get(block.id);
          if (!oldBlock || normalizeSpeechText(oldBlock.speechText || oldBlock.text) !== normalizeSpeechText(block.speechText || block.text)) {
            block.audioStatus = block.speechText.trim() || block.text.trim() ? "stale" : "missing";
            block.audioDuration = undefined;
            block.audioCacheKey = undefined;
            block.error = undefined;
            attachmentChanged = true;
          }
        }
        if (attachmentChanged) {
          comment.audioStatus = "stale";
          comment.audioDuration = undefined;
          comment.audioCacheKey = undefined;
          nextAttachment.revealStartSeconds = undefined;
          nextAttachment.voiceStartSeconds = undefined;
          nextAttachment.audioDuration = undefined;
          comment.error = undefined;
        }
      }
      const oldConversation = old.conversation;
      const nextConversation = comment.conversation;
      if (nextConversation) {
        const oldMessages = new Map(oldConversation?.messages.map((message) => [message.id, message]) ?? []);
        const structureChanged = (oldConversation?.messages.length ?? 0) !== nextConversation.messages.length
          || (oldConversation?.messages ?? []).slice().sort((left, right) => left.order - right.order).map((message) => message.id).join(":")
            !== nextConversation.messages.slice().sort((left, right) => left.order - right.order).map((message) => message.id).join(":");
        const conversationTimingChanged = !oldConversation
          || oldConversation.mode !== nextConversation.mode
          || oldConversation.messageGapSeconds !== nextConversation.messageGapSeconds
          || oldConversation.dingEnabled !== nextConversation.dingEnabled
          || oldConversation.dingLeadSeconds !== nextConversation.dingLeadSeconds
          || oldConversation.speakerAVoiceId !== nextConversation.speakerAVoiceId
          || oldConversation.speakerBVoiceId !== nextConversation.speakerBVoiceId;
        for (const message of nextConversation.messages) {
          const oldMessage = oldMessages.get(message.id);
          const voiceChanged = oldMessage && (oldMessage.voiceId ?? (oldMessage.speaker === "b" ? oldConversation?.speakerBVoiceId : oldConversation?.speakerAVoiceId))
            !== (message.voiceId ?? (message.speaker === "b" ? nextConversation.speakerBVoiceId : nextConversation.speakerAVoiceId));
          if (!oldMessage || oldMessage.text !== message.text || oldMessage.speaker !== message.speaker || voiceChanged || changed) {
            message.audioStatus = message.text.trim() ? "stale" : "missing";
            message.audioDuration = undefined;
            message.audioCacheKey = undefined;
            message.revealStartSeconds = undefined;
            message.voiceStartSeconds = undefined;
            message.error = undefined;
          }
        }
        if (conversationTimingChanged || structureChanged || changed || nextConversation.messages.some((message) => message.audioStatus !== "ready")) {
          comment.audioStatus = "stale";
          comment.audioDuration = undefined;
          comment.audioCacheKey = undefined;
          comment.error = undefined;
        }
      }
    }
    return incoming;
  }

  invalidateOutdatedAudio(project: ProjectData) {
    let changed = false;
    for (const comment of project.comments) {
      const attachmentTimingMissing = Boolean(comment.attachment && comment.attachment.revealStartSeconds === undefined);
      if (comment.audioStatus === "ready" && (comment.audioProcessingVersion !== AUDIO_PROCESSING_VERSION || attachmentTimingMissing)) {
        comment.audioStatus = "stale";
        comment.audioDuration = undefined;
        comment.audioCacheKey = undefined;
        comment.error = undefined;
        changed = true;
      }
    }
    return changed;
  }

  private cacheKey(
    input: { providerId: TtsProviderId; voiceId: string; text: string; rate: number; pitch: number },
    regenerationId?: string
  ) {
    return createHash("sha256").update(JSON.stringify({
      ...input,
      audioProcessingVersion: AUDIO_PROCESSING_VERSION,
      ...(regenerationId ? { regenerationId } : {})
    })).digest("hex");
  }

  private async generateUnit(
    projectId: string,
    input: { providerId: TtsProviderId; voiceId: string; text: string; rate: number; pitch: number },
    provider = this.requireProvider(input.providerId),
    forceRegenerate = false,
    signal?: AbortSignal
  ) {
    signal?.throwIfAborted();
    if (!input.voiceId) throw new Error("Bạn chưa chọn giọng đọc.");
    const cacheKey = this.cacheKey(input, forceRegenerate ? randomUUID() : undefined);
    const cacheFile = path.join(this.store.audioCacheRoot, `${cacheKey}.mp3`);
    await mkdir(this.store.audioCacheRoot, { recursive: true });
    if (!(await fileExists(cacheFile))) {
      const identifier = randomUUID();
      const providerOutput = `${cacheFile}.${identifier}.provider.mp3`;
      const temporary = `${cacheFile}.${identifier}.tmp.mp3`;
      try {
        await provider.generate({
          text: input.text, voiceId: input.voiceId, rate: input.rate, pitch: input.pitch, outputPath: providerOutput, signal
        });
        await this.processAudio(providerOutput, temporary, signal);
        signal?.throwIfAborted();
        await rename(temporary, cacheFile);
      } finally {
        await unlink(providerOutput).catch(() => undefined);
        await unlink(temporary).catch(() => undefined);
      }
    }
    const duration = await this.probeDuration(cacheFile);
    return {
      cacheKey,
      cacheFile,
      duration,
      audioPath: await this.store.attachAudio(projectId, cacheFile, cacheKey)
    };
  }

  private requireProvider(providerId: TtsProviderId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`TTS provider ${providerId} không được hỗ trợ.`);
    return provider;
  }
}
