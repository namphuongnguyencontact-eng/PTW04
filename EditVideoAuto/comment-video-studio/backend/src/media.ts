import { runCommand } from "./command.js";

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export interface AudioMetadata {
  duration: number;
}

interface ProbePayload {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
}

async function probe(filePath: string): Promise<ProbePayload> {
  const { stdout } = await runCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json",
    filePath
  ], { timeoutMs: 30_000 });
  return JSON.parse(stdout) as ProbePayload;
}

export async function probeDuration(filePath: string) {
  const payload = await probe(filePath);
  const duration = Number.parseFloat(payload.format?.duration ?? "");
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Không đo được thời lượng audio bằng FFprobe.");
  return duration;
}

export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const payload = await probe(filePath);
  const stream = payload.streams?.find((candidate) => candidate.codec_type === "video");
  const duration = Number.parseFloat(payload.format?.duration ?? "");
  if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("File không có luồng video hợp lệ.");
  }
  return { duration, width: stream.width, height: stream.height };
}

export async function probeAudio(filePath: string): Promise<AudioMetadata> {
  const payload = await probe(filePath);
  const hasAudio = payload.streams?.some((candidate) => candidate.codec_type === "audio");
  const duration = Number.parseFloat(payload.format?.duration ?? "");
  if (!hasAudio || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("File không có luồng âm thanh hợp lệ.");
  }
  return { duration };
}

export async function probeImage(filePath: string): Promise<{ width: number; height: number }> {
  const payload = await probe(filePath);
  const stream = payload.streams?.find((candidate) => candidate.codec_type === "video");
  if (!stream?.width || !stream.height) throw new Error("Không đọc được kích thước ảnh.");
  return { width: stream.width, height: stream.height };
}

export async function createVideoThumbnail(inputPath: string, outputPath: string, duration: number) {
  await runCommand("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", Math.min(0.5, duration / 2).toFixed(3),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale=320:-2",
    outputPath
  ], { timeoutMs: 60_000 });
}

export interface MediaInspector {
  probeVideo: typeof probeVideo;
  probeAudio: typeof probeAudio;
  probeImage: typeof probeImage;
  createVideoThumbnail: typeof createVideoThumbnail;
}

export const defaultMediaInspector: MediaInspector = { probeVideo, probeAudio, probeImage, createVideoThumbnail };

