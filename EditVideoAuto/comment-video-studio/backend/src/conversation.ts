import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeSpeechText, type AttachmentTextBlock, type ConversationBox, type ConversationMessage, type ConversationSpeaker } from "@comment-video-studio/shared";
import { runCommand } from "./command.js";

export interface OcrObservation {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  language: string;
  supportedLanguages: string[];
  observations: OcrObservation[];
}

export interface ConversationOcr {
  recognize(imagePath: string): Promise<OcrResult>;
}

function exists(filePath: string) {
  return access(filePath).then(() => true).catch(() => false);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function speakerFor(observation: OcrObservation): ConversationSpeaker {
  const center = observation.x + observation.width / 2;
  if (center < 0.48) return "a";
  if (center > 0.52) return "b";
  return "system";
}

function unionBox(left: ConversationBox, right: ConversationBox): ConversationBox {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const rightEdge = Math.max(left.x + left.width, right.x + right.width);
  const bottom = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: rightEdge - x, height: bottom - y };
}

function isInterfaceNoise(text: string, observation: OcrObservation) {
  const normalized = text.trim();
  if (!normalized) return true;
  if (observation.y < 0.18) return true;
  if (/^(?:(?:thứ|chủ nhật).+\d|\d{1,2}[:.]\d{2}(?:\s*(?:sa|ch|am|pm))?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|đã xem|seen)$/iu.test(normalized)) return true;
  if (/threadsli|tìm nội dung liên quan|\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/iu.test(normalized)) return true;
  return false;
}

function cleanRecognizedText(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/\b\d{1,2}:\d{2}\s*(?:sa|ch|am|pm)[-–—]?\s*$/iu, "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function usefulObservations(observations: OcrObservation[]) {
  return observations
    .map((observation) => ({ ...observation, text: cleanRecognizedText(observation.text) }))
    .filter((observation) => observation.confidence >= 0.45 && !isInterfaceNoise(observation.text, observation));
}

export function sortObservationsForReading(observations: OcrObservation[]) {
  const rows: OcrObservation[][] = [];
  for (const observation of usefulObservations(observations).sort((left, right) => left.y - right.y || left.x - right.x)) {
    const centerY = observation.y + observation.height / 2;
    const row = rows.find((items) => {
      const reference = items[0]!;
      const referenceCenter = reference.y + reference.height / 2;
      return Math.abs(centerY - referenceCenter) <= Math.max(0.012, Math.max(reference.height, observation.height) * 0.55);
    });
    if (row) row.push(observation);
    else rows.push([observation]);
  }
  return rows
    .sort((left, right) => Math.min(...left.map((item) => item.y)) - Math.min(...right.map((item) => item.y)))
    .flatMap((row) => row.sort((left, right) => left.x - right.x));
}

export function buildAttachmentTextBlocks(observations: OcrObservation[]): AttachmentTextBlock[] {
  return sortObservationsForReading(observations).map((observation, index) => ({
    id: randomUUID(),
    order: index + 1,
    text: observation.text.trim(),
    speechText: normalizeSpeechText(observation.text),
    box: {
      x: clamp(observation.x), y: clamp(observation.y),
      width: clamp(observation.width), height: clamp(observation.height)
    },
    confidence: observation.confidence,
    audioStatus: "missing"
  }));
}

export interface ImageContentClassification {
  type: "illustration" | "text" | "conversation";
  confidence: number;
  messages: ConversationMessage[];
  textBlocks: AttachmentTextBlock[];
}

export function classifyImageContent(observations: OcrObservation[]): ImageContentClassification {
  const ordered = sortObservationsForReading(observations);
  const textBlocks = buildAttachmentTextBlocks(observations);
  if (!ordered.length) return { type: "illustration", confidence: 1, messages: [], textBlocks: [] };

  const messages = groupChatObservations(observations);
  const conversational = messages.filter((message) => message.speaker !== "system");
  const sides = conversational.map((message) => message.speaker);
  const leftCount = sides.filter((side) => side === "a").length;
  const rightCount = sides.filter((side) => side === "b").length;
  const alternations = sides.slice(1).filter((side, index) => side !== sides[index]).length;
  const narrowRatio = conversational.length
    ? conversational.filter((message) => message.box.width <= 0.62).length / conversational.length
    : 0;
  const numberedListRatio = ordered.filter((observation) => /^\s*(?:\d+[.)]|[-•])\s+/u.test(observation.text)).length / ordered.length;
  const verticalSpan = ordered.at(-1)!.y + ordered.at(-1)!.height - ordered[0]!.y;
  let conversationScore = 0;
  if (conversational.length >= 3) conversationScore += 1;
  if (leftCount >= 1 && rightCount >= 1) conversationScore += 1;
  if (alternations >= 2) conversationScore += 1;
  if (narrowRatio >= 0.75) conversationScore += 1;
  if (verticalSpan >= 0.12) conversationScore += 1;
  if (numberedListRatio >= 0.35) conversationScore -= 3;
  if (ordered.some((observation) => observation.width >= 0.78)) conversationScore -= 1;

  if (conversationScore >= 5) {
    return { type: "conversation", confidence: Math.min(0.99, 0.72 + conversationScore * 0.05), messages, textBlocks };
  }
  return {
    type: "text",
    confidence: Math.max(0.55, Math.min(0.96, ordered.reduce((sum, item) => sum + item.confidence, 0) / ordered.length)),
    messages: [],
    textBlocks
  };
}

export function groupChatObservations(observations: OcrObservation[]): ConversationMessage[] {
  const ordered = usefulObservations(observations)
    .map((observation) => ({ ...observation, speaker: speakerFor(observation) }))
    .sort((left, right) => left.y - right.y || left.x - right.x);
  const messages: ConversationMessage[] = [];
  for (const observation of ordered) {
    const box: ConversationBox = {
      x: clamp(observation.x), y: clamp(observation.y),
      width: clamp(observation.width), height: clamp(observation.height)
    };
    const previous = messages.at(-1);
    const verticalGap = previous ? box.y - (previous.box.y + previous.box.height) : Number.POSITIVE_INFINITY;
    const center = box.x + box.width / 2;
    const previousCenter = previous ? previous.box.x + previous.box.width / 2 : 0;
    const sameBubble = previous
      && previous.speaker === observation.speaker
      && verticalGap >= -0.008
      && verticalGap <= Math.max(0.02, Math.max(box.height, previous.box.height) * 0.9)
      && Math.abs(center - previousCenter) <= 0.22;
    if (sameBubble) {
      previous.text = `${previous.text}\n${observation.text.trim()}`;
      previous.box = unionBox(previous.box, box);
      previous.confidence = Math.min(previous.confidence, observation.confidence);
    } else {
      messages.push({
        id: randomUUID(),
        order: messages.length + 1,
        speaker: observation.speaker,
        text: observation.text.trim(),
        box,
        confidence: observation.confidence,
        audioStatus: "missing"
      });
    }
  }
  return messages;
}

export class AppleVisionOcr implements ConversationOcr {
  private readonly sourcePath: string;
  private readonly binaryPath: string;

  constructor(projectRoot: string, cacheRoot: string) {
    this.sourcePath = path.join(projectRoot, "backend", "native", "ocr_vision.m");
    this.binaryPath = path.join(cacheRoot, "ocr-vision");
  }

  async recognize(imagePath: string): Promise<OcrResult> {
    await this.ensureBinary();
    const { stdout } = await runCommand(this.binaryPath, [imagePath], { timeoutMs: 120_000 });
    const result = JSON.parse(stdout) as OcrResult;
    if (!Array.isArray(result.observations)) throw new Error("Apple Vision trả về dữ liệu OCR không hợp lệ.");
    return result;
  }

  private async ensureBinary() {
    const source = await stat(this.sourcePath);
    const binary = await stat(this.binaryPath).catch(() => undefined);
    if (binary && binary.mtimeMs >= source.mtimeMs) return;
    await mkdir(path.dirname(this.binaryPath), { recursive: true });
    const temporary = `${this.binaryPath}.${createHash("sha1").update(String(source.mtimeMs)).digest("hex")}.tmp`;
    await runCommand("xcrun", ["clang", "-fobjc-arc", this.sourcePath, "-o", temporary, "-framework", "Vision", "-framework", "AppKit", "-framework", "Foundation"], { timeoutMs: 180_000 });
    const { rename, chmod, unlink } = await import("node:fs/promises");
    await chmod(temporary, 0o755);
    await unlink(this.binaryPath).catch(() => undefined);
    await rename(temporary, this.binaryPath);
    if (!(await exists(this.binaryPath))) throw new Error("Không biên dịch được bộ OCR Apple Vision.");
  }
}
