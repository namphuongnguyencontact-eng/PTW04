import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

async function readWorkspaceSources() {
  const [app, workspace] = await Promise.all([
    readFile(new URL("./App.tsx", import.meta.url), "utf8"),
    readFile(new URL("./WorkspaceNavigation.tsx", import.meta.url), "utf8")
  ]);
  return `${app}\n${workspace}`;
}

describe("App", () => {
  it("render trang quản lý project bằng tiếng Việt", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("COMMENT VIDEO STUDIO");
    expect(html).toContain("Tên project mới");
    expect(html).toContain("Tạo project");
    expect(html).toContain("Chưa có project");
  });

  it("có đầy đủ điều khiển MyInstants và preview SFX", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Sound effect tự động");
    expect(source).toContain("Tự chọn SFX cho các cảnh còn thiếu");
    expect(source).toContain("không gửi nguyên văn comment");
    expect(source).toContain("soundEffectRef");
    expect(source).toContain("/sound-effects/auto");
    expect(source).toContain("Đổi SFX khác");
    expect(source).toContain("Gỡ SFX");
  });

  it("có OCR hội thoại, chỉnh từng tin, hai giọng và âm ding", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Hội thoại trong ảnh");
    expect(source).toContain("Đang nhận dạng hội thoại bằng Apple Vision");
    expect(source).toContain("Giọng Người A");
    expect(source).toContain("Giọng Người B");
    expect(source).toContain("Mở và cuộn theo lời đọc");
    expect(source).toContain("Phát “ding” khi tin nhắn xuất hiện");
    expect(source).toContain("conversationDingRef");
    expect(source).toContain("/conversation/image");
  });

  it("có luồng nhập Threads, chọn bài gốc/reply, pipeline B-roll và hai âm xuất hiện cố định", async () => {
    const source = await readWorkspaceSources();
    expect(source).toContain("Auto từ Threads");
    expect(source).toContain("Mở Chrome local");
    expect(source).toContain("/threads/browser/open");
    expect(source).toContain("Cửa sổ và phiên đăng nhập được giữ nguyên");
    expect(source).toContain("Phân tích bài và chọn comment hay");
    expect(source).toContain("Dùng bài viết gốc làm comment đầu tiên");
    expect(source).toContain("reply tự kèm comment cha");
    expect(source).toContain("không tính avatar");
    expect(source).toContain("Đã nhập Threads với đầy đủ B-roll, watermark, logo và sound effect của project");
    expect(source).toContain("attachmentLocalTime >= (previewComment?.attachment?.revealStartSeconds ?? 0)");
    expect(source).toContain("candidate.reasons");
    expect(source).toContain("/threads/analyze");
    expect(source).toContain("/threads/import");
    expect(source).toContain("tununuuuu");
    expect(source).toContain("mouse click");
    expect(source).toContain("appearanceSoundRef");
    expect(source).toContain("schedulePreviewOneShot");
    expect(source).toContain("resolveCommentAppearanceAssetId");
  });

  it("tách workspace thủ công và Auto Threads bằng hash route ổn định", async () => {
    const source = await readWorkspaceSources();
    expect(source).toContain('window.location.hash === "#auto-threads"');
    expect(source).toContain('workspace === "auto-threads" ? "auto-threads" : "manual"');
    expect(source).toContain("Chỉnh sửa thủ công");
    expect(source).toContain("Auto từ Threads");
    expect(source).toContain("Luồng này được tách riêng, không thay đổi cách dựng video thủ công");
    expect(source).toContain("isAutoWorkspace && <ThreadsAutoImportPanel");
    expect(source).toContain("isAutoWorkspace && selected && <section");
    expect(source).toContain("isAutoWorkspace && threadsAnalysis");
  });

  it("đưa viewport về đầu trang khi mở project", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("window.scrollTo({ top: 0, left: 0 })");
    expect(source).toContain("[project?.id]");
  });

  it("giữ giao diện thủ công theo mốc trước Auto Threads", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain('isAutoWorkspace ? "Nội dung comment gốc" : "Nội dung đọc"');
    expect(source).toContain('isAutoWorkspace && <><div className="section-title-row narration-heading"');
    expect(source).toContain('isAutoWorkspace && project.comments.length > 0');
    expect(source).toContain('isAutoWorkspace && <div className="appearance-sound-card"');
    expect(source).toContain('!showConversationImage && !showPreviewAttachment');
    expect(source).toContain('const previewAttachment = isAutoWorkspace ?');
    expect(source).toContain('"Tạo tất cả giọng đọc"');
    expect(source).toContain('"Xóa toàn bộ giọng đọc"');
    expect(source).toContain('"Dừng và xóa toàn bộ giọng đọc"');
    expect(source).toContain('/tts`, { method: "DELETE" }');
    expect(source).toContain("ttsOperationVersionRef");
  });

  it("cho phép xóa từng project hoặc xóa toàn bộ với xác nhận", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Xóa vĩnh viễn project");
    expect(source).toContain("Xóa tất cả");
    expect(source).toContain('api<void>(`/api/projects/${item.id}`, { method: "DELETE" })');
    expect(source).toContain('api<{ deleted: number }>("/api/projects", { method: "DELETE" })');
    expect(source).toContain("aria-label={`Xóa project ${item.name}`}");
  });

  it("có ảnh nội dung tự phân loại, sửa OCR và giữ ảnh sau lời đọc", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Ảnh nội dung sau comment");
    expect(source).toContain("/content-image");
    expect(source).toContain("Tự động theo kết quả nhận dạng");
    expect(source).toContain("OCR gốc");
    expect(source).toContain("Nội dung sẽ đọc");
    expect(source).toContain("Giữ ảnh sau khi đọc");
    expect(source).toContain("Phát tiếng click khi chuyển sang ảnh");
    expect(source).toContain("attachmentClickRef");
  });

  it("tách nội dung gốc và nội dung đọc, có chuẩn hóa teencode, lọc an toàn và bỏ biểu tượng", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Nội dung comment gốc");
    expect(source).toContain("Nội dung đọc cho TTS");
    expect(source).toContain("Chuẩn hóa & lọc an toàn");
    expect(source).toContain("Từ tục được đổi thành “bíp”");
    expect(source).toContain("bỏ biểu tượng");
    expect(source).toContain("normalizeSpeechText");
  });

  it("có nút xóa hết comment nhưng giữ nguyên setting của project", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Xóa hết comment");
    expect(source).toContain("các setting khác vẫn được giữ nguyên");
    expect(source).toContain("method: \"DELETE\"");
    expect(source).toContain("/comments`");
  });

  it("chỉ tạo audio thiếu hoặc lỗi, báo kết quả batch và có fallback macOS", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Tạo giọng đọc còn thiếu hoặc bị lỗi");
    expect(source).toContain("Bỏ qua ${result.skipped} audio sẵn sàng");
    expect(source).toContain("Còn lỗi ${result.failed}");
    expect(source).toContain("Chuyển comment này sang giọng macOS");
  });

  it("tích hợp VoiceStudio bằng backend local, báo trạng thái và phân giọng đa dạng", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("VoiceStudio Local");
    expect(source).toContain("Chưa kết nối cổng 3900");
    expect(source).toContain("Kiểm tra lại");
    expect(source).toContain("Phân giọng đa dạng");
    expect(source).toContain("assignDiverseVoiceStudioVoices");
    expect(source).toContain("Chưa tải được danh sách giọng");
  });

  it("cho phép dùng giọng của mọi nhà cung cấp cho toàn bộ comment", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Áp dụng giọng đọc cho toàn bộ comment");
    expect(source).toContain("Áp dụng cho tất cả");
    expect(source).toContain("provider?.name");
    expect(source).toContain("selectedVoice?.name");
    expect(source).toContain("assignSelectedVoiceToAllComments");
    expect(source).toContain("applyVoiceToAll(project, providerId, voiceId)");
    expect(source).toContain("audio cũ được đánh dấu cần tạo lại");
    expect(source).not.toContain('providerId === "voicestudio" && voices.length > 0 && <div className="voice-one-for-all"');
    expect(source).toContain("Áp dụng thông số giọng cho tất cả comment");
  });

  it("cấu hình hồ sơ Chrome thật và xác nhận trước khi tự đăng TikTok", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("Đăng TikTok tự động");
    expect(source).toContain("Hồ sơ Chrome đã đăng nhập TikTok");
    expect(source).toContain("Mở & kiểm tra đúng hồ sơ");
    expect(source).toContain("Kiểm tra lại quyền Chrome");
    expect(source).toContain("Đang tự kiểm tra quyền Chrome cho project");
    expect(source).toContain("fetchTikTokPreflight(profileDirectory, controller.signal)");
    expect(source).toContain("Caption / mô tả video");
    expect(source).toContain("Đăng bây giờ");
    expect(source).toContain("Lên lịch");
    expect(source).toContain("Xác nhận lần cuối");
    expect(source).toContain("Đây là thao tác đăng nội dung ra ngoài");
    expect(source).toContain("/api/tiktok/chrome-profiles");
    expect(source).toContain("/api/tiktok/preflight");
    expect(source).toContain("Cách bật quyền để tool tự tải video");
    expect(source).toContain("Mở Cài đặt Trợ năng");
    expect(source).toContain("/api/tiktok/accessibility-settings");
    expect(source).toContain("Chrome chưa đủ quyền để tự tải video");
    expect(source).toContain("publishConfirmed: publishToTikTok");
  });

  it("truyền cờ bắt buộc tạo mới khi bấm tạo lại giọng đọc", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain('audioStatus === "ready" || comment?.audioStatus === "error"');
    expect(source).toContain("tts?forceRegenerate=${forceRegenerate}");
    expect(source).toContain('audioStatus === "ready" || message?.audioStatus === "error"');
  });
});
