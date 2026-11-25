import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "./command.js";
import { ProjectStore } from "./storage.js";
import { TtsService, type TtsProvider, type TtsRequest } from "./tts.js";

class ToneProvider implements TtsProvider {
  readonly id = "test" as const;
  async info() { return { id: this.id, name: "Tone", available: true, configured: true, online: false, supportsPitch: false, notice: "test" }; }
  async listVoices() { return [{ id: "tone", name: "Tone", locale: "vi-VN", provider: this.id }]; }
  async generate(request: TtsRequest) {
    const frequency = request.text.includes("hai") ? 900 : 600;
    await runCommand("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      `sine=frequency=${frequency}:sample_rate=48000:duration=0.45`,
      "-c:a", "libmp3lame", "-b:a", "128k", request.outputPath
    ]);
  }
}

let dataRoot: string;

beforeAll(async () => { dataRoot = await mkdtemp(path.join(tmpdir(), "conversation-tts-integration-")); });
afterAll(async () => { await rm(dataRoot, { recursive: true, force: true }); });

describe("nghiệm thu audio hội thoại thực tế", () => {
  it("tạo, cắt im lặng và ghép hai tin thành một narration MP3 hợp lệ", async () => {
    const store = new ProjectStore(dataRoot);
    await store.initialize();
    const project = await store.create("Audio hội thoại");
    project.settings.defaultProvider = "test";
    project.settings.defaultVoiceId = "tone";
    project.comments = [{
      id: "chat", order: 1,
      image: { relativePath: "assets/comments/a.png", originalName: "a.png", mimeType: "image/png", size: 1 },
      text: "", provider: "test", voiceId: "tone", rate: 1, pitch: 0, pauseAfter: 0.1, audioStatus: "missing",
      conversation: {
        enabled: true,
        image: { relativePath: "assets/conversations/a.png", originalName: "a.png", mimeType: "image/png", size: 1 },
        mode: "replace", revealMode: "scroll", speakerAVoiceId: "tone", speakerBVoiceId: "tone",
        messageGapSeconds: 0.08, dingEnabled: true, dingVolume: 0.25, dingLeadSeconds: 0.1,
        messages: [
          { id: "m1", order: 1, speaker: "a", text: "tin một", box: { x: 0.1, y: 0.2, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "missing" },
          { id: "m2", order: 2, speaker: "b", text: "tin hai", box: { x: 0.5, y: 0.4, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "missing" }
        ]
      }
    }];
    await store.save(project);
    const generated = await new TtsService(store, process.cwd(), { providers: [new ToneProvider()] }).generateComment(project.id, "chat");
    expect(generated.comments[0]?.audioStatus).toBe("ready");
    expect(generated.comments[0]?.audioDuration).toBeGreaterThan(1);
    expect(generated.comments[0]?.conversation?.messages[1]?.revealStartSeconds).toBeGreaterThan(0.5);
    expect(generated.comments[0]?.audioPath).toMatch(/^audio\/[a-f0-9]{64}\.mp3$/);
  }, 30_000);
});
