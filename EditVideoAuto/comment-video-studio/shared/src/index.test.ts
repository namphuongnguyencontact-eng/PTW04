import { describe, expect, it } from "vitest";
import {
  applyVoiceToAll,
  applyVoiceSettingsToAll,
  assignIllustrationVideos,
  buildCommentLabels,
  buildTimeline,
  calculateSmartLayout,
  calculateThreadedSmartLayout,
  activeConversationMessage,
  conversationViewport,
  createDefaultBrandingSettings,
  defaultProjectSettings,
  maximizeBrollVariety,
  migrateProjectData,
  narrationText,
  normalizeSpeechText,
  sanitizePlatformSpeechText,
  resolveCommentAppearanceAssetId,
  syncBrollSegments,
  type CommentItem,
  type ProjectData
} from "./index.js";

const makeComment = (id: string, order: number, audioDuration?: number, pauseAfter = 0.4): CommentItem => ({
  id,
  order,
  image: { relativePath: `${id}.png`, originalName: `${id}.png`, mimeType: "image/png", size: 1 },
  text: `Nội dung ${id}`,
  rate: 1,
  pitch: 0,
  audioDuration,
  pauseAfter,
  audioStatus: audioDuration ? "ready" : "missing"
});

describe("âm xuất hiện comment", () => {
  it("dùng tununuuuu cho cảnh đầu, mouse click cho cảnh sau và bỏ qua hội thoại", () => {
    const comments = [makeComment("reply", 3), makeComment("first", 1), makeComment("second", 2)];
    const appearance = { introAssetId: "tununuuuu", nextAssetId: "mouse-click" };
    expect(resolveCommentAppearanceAssetId(comments, "first", appearance)).toBe("tununuuuu");
    expect(resolveCommentAppearanceAssetId(comments, "second", appearance)).toBe("mouse-click");
    expect(resolveCommentAppearanceAssetId(comments, "reply", appearance)).toBe("mouse-click");

    comments[1]!.conversation = {
      enabled: true,
      image: comments[1]!.image,
      mode: "replace",
      revealMode: "scroll",
      speakerAVoiceId: "a",
      speakerBVoiceId: "b",
      messageGapSeconds: 0.08,
      dingEnabled: true,
      dingVolume: 0.25,
      dingLeadSeconds: 0.1,
      messages: []
    };
    expect(resolveCommentAppearanceAssetId(comments, "first", appearance)).toBeUndefined();
    expect(resolveCommentAppearanceAssetId(comments, "second", appearance)).toBe("mouse-click");
  });
});

describe("nội dung đọc", () => {
  it("chuẩn hóa teencode và bỏ emoji, sticker, icon trước khi gửi TTS", () => {
    expect(normalizeSpeechText("mik ko bt nx 😂🔥 [sticker] =)))")).toBe("mình không biết nữa");
    expect(normalizeSpeechText("rep ib mk nha ❤️")).toBe("trả lời nhắn riêng mình nha");
    expect(normalizeSpeechText("nma hs ko bít chuyen đó rùi")).toBe("nhưng mà học sinh không biết chuyện đó rồi");
    expect(normalizeSpeechText("khônng đươc đâu bn ơi")).toBe("không được đâu bạn ơi");
    expect(normalizeSpeechText("😂 ❤️ [GIF]")).toBe("");
  });

  it("ưu tiên nội dung đọc đã chỉnh nhưng vẫn làm sạch biểu tượng", () => {
    expect(narrationText({ text: "ko bt", speechText: "Không biết đâu 😅" })).toBe("Không biết đâu");
  });

  it("đổi từ tục thành bíp và diễn đạt trung tính cụm nhạy cảm mà không dùng ký tự lách", () => {
    expect(normalizeSpeechText("địt mẹ, nó dọa giết người rồi nói về ma túy =)))) ...."))
      .toBe("bíp, nó dọa làm hại người rồi nói về chất cấm.");
    expect(sanitizePlatformSpeechText("Tôi chỉ đang giết thời gian, không đe dọa giết ai"))
      .toBe("Tôi chỉ đang tiêu thời gian, không đe dọa làm hại ai");
    expect(normalizeSpeechText("Câu chuyện về tự tử và hiếp dâm trong tài liệu"))
      .toBe("Câu chuyện về tự làm hại bản thân và xâm hại tình dục trong tài liệu");
    expect(normalizeSpeechText("lồn cặc đéo")).toBe("bíp");
  });
});

describe("calculateSmartLayout", () => {
  const settings = { enabled: true, mode: "auto" as const, gapPixels: 40, safeTopPercent: 8, safeBottomPercent: 12 };

  it("giữ khoảng cách 40px và căn giữa nhóm khi comment rất ngắn", () => {
    const layout = calculateSmartLayout(1080, 1920, 1080, 180, 16 / 9, settings);
    expect(layout.comment.width).toBe(972);
    expect(layout.gap).toBeCloseTo(40, 5);
    expect(layout.broll!.y - (layout.comment.y + layout.comment.height)).toBeCloseTo(40, 5);
    expect(layout.comment.y).toBeGreaterThanOrEqual(layout.safeTop);
    expect(layout.broll!.y + layout.broll!.height).toBeLessThanOrEqual(1920 - layout.safeBottom + 0.01);
  });

  it("scale ảnh nguồn nhỏ tới chiều rộng hiển thị mà vẫn giữ đúng tỷ lệ", () => {
    const layout = calculateSmartLayout(1080, 1920, 320, 160, 16 / 9, settings);
    expect(layout.comment.width).toBe(972);
    expect(layout.comment.width / layout.comment.height).toBeCloseTo(2, 5);
  });

  it("thu nhỏ ảnh comment dài mà không crop hoặc chồng B-roll", () => {
    const layout = calculateSmartLayout(1080, 1920, 900, 2200, 16 / 9, settings);
    expect(layout.comment.width / layout.comment.height).toBeCloseTo(900 / 2200, 5);
    expect(layout.comment.y + layout.comment.height).toBeLessThanOrEqual(layout.broll!.y);
    expect(layout.broll!.y + layout.broll!.height).toBeLessThanOrEqual(1920 - layout.safeBottom + 0.01);
  });

  it("không chừa chỗ cho B-roll khi video minh họa tắt", () => {
    const layout = calculateSmartLayout(1080, 1920, 800, 400, 16 / 9, settings, 90, 90, false);
    expect(layout.broll).toBeUndefined();
    expect(layout.gap).toBe(0);
    expect(layout.comment.y).toBeGreaterThan(500);
  });

  it("xếp comment cha, comment con và B-roll không chồng nhau", () => {
    const layout = calculateThreadedSmartLayout(1080, 1920, 900, 420, 900, 620, 16 / 9, settings);
    expect(layout.parent.y + layout.parent.height).toBeLessThanOrEqual(layout.reply.y);
    expect(layout.reply.y + layout.reply.height).toBeLessThanOrEqual(layout.broll!.y);
    expect(layout.broll!.y + layout.broll!.height).toBeLessThanOrEqual(1920 - layout.safeBottom + 0.01);
  });
});

describe("syncBrollSegments", () => {
  const projectWithDurations = (duration: number, videoCount = 3) => {
    const project = migrateProjectData({
      ...oldProject(),
      comments: [makeComment("mot", 1, duration, 0)]
    });
    project.illustrations.enabled = true;
    project.illustrations.mode = "multi";
    project.illustrations.intervalSeconds = 4;
    project.illustrations.videos = Array.from({ length: videoCount }, (_value, index) => ({
      id: `v${index}`,
      relativePath: `v${index}.mp4`, originalName: `v${index}.mp4`, mimeType: "video/mp4", size: 1,
      duration: 2, width: 320, height: 180
    }));
    return project;
  };

  it.each([[3, 1], [12, 3], [21, 6]])("chia comment %s giây thành %s segment", (duration, expected) => {
    const result = syncBrollSegments(projectWithDurations(duration), { seed: 11 });
    expect(result.illustrations.segments).toHaveLength(expected);
    if (duration === 21) expect(result.illustrations.segments.at(-1)?.durationSeconds).toBe(1);
  });

  it("dùng hai clip không lặp liền và không random lại khi đồng bộ", () => {
    const first = syncBrollSegments(projectWithDurations(21, 2), { seed: 23 });
    const ids = first.illustrations.segments.map((segment) => segment.videoAssetId);
    expect(ids.every((id, index) => index === 0 || id !== ids[index - 1])).toBe(true);
    expect(syncBrollSegments(first).illustrations.segments).toEqual(first.illustrations.segments);
  });

  it("giữ segment khóa và cập nhật số đoạn khi audio đổi thời lượng", () => {
    const first = syncBrollSegments(projectWithDurations(12), { seed: 7 });
    first.illustrations.segments[0]!.locked = true;
    first.comments[0]!.audioDuration = 21;
    const updated = syncBrollSegments(first);
    expect(updated.illustrations.segments).toHaveLength(6);
    expect(updated.illustrations.segments[0]).toMatchObject({
      id: first.illustrations.segments[0]!.id,
      videoAssetId: first.illustrations.segments[0]!.videoAssetId,
      locked: true
    });
  });

  it("dùng toàn bộ 58 video trước khi lặp và tự chọn nhịp cắt an toàn", () => {
    const result = maximizeBrollVariety(projectWithDurations(147, 58), { seed: 29 });
    const ids = result.illustrations.segments.map((segment) => segment.videoAssetId);
    expect(result.illustrations.intervalSeconds).toBe(2.5);
    expect(new Set(ids.slice(0, 58)).size).toBe(58);
    expect(new Set(ids).size).toBe(58);
  });

  it("giới hạn mục tiêu ở 80 video khác nhau để lệnh render không quá nặng", () => {
    const result = maximizeBrollVariety(projectWithDurations(400, 120), { seed: 31 });
    const ids = result.illustrations.segments.map((segment) => segment.videoAssetId);
    expect(result.illustrations.intervalSeconds).toBe(5);
    expect(ids).toHaveLength(80);
    expect(new Set(ids).size).toBe(80);
  });

  it("phát hết clip nguồn rồi mới đổi và nối tiếp qua ranh giới comment", () => {
    const project = projectWithDurations(3, 1);
    project.comments.push(makeComment("hai", 2, 3, 0));
    project.illustrations.timingMode = "source-duration";
    project.illustrations.videos[0]!.duration = 5;
    const result = syncBrollSegments(project, { seed: 41, randomizeAll: true });
    expect(result.illustrations.segments.map(({ commentId, durationSeconds, sourceStartSeconds }) => ({ commentId, durationSeconds, sourceStartSeconds }))).toEqual([
      { commentId: "mot", durationSeconds: 3, sourceStartSeconds: 0 },
      { commentId: "hai", durationSeconds: 2, sourceStartSeconds: 3 },
      { commentId: "hai", durationSeconds: 1, sourceStartSeconds: 0 }
    ]);
  });
});

describe("comment dạng chuỗi", () => {
  it("đánh số cha và con thành 1, 1.1, 1.2, 2", () => {
    const comments = [
      makeComment("cha-1", 1, 2),
      { ...makeComment("con-1", 2, 2), parentCommentId: "cha-1" },
      { ...makeComment("con-2", 3, 2), parentCommentId: "cha-1" },
      makeComment("cha-2", 4, 2)
    ];
    expect([...buildCommentLabels(comments).values()]).toEqual(["1", "1.1", "1.2", "2"]);
  });
});

describe("applyVoiceSettingsToAll", () => {
  it("đánh dấu stale khi đổi tốc độ nhưng chỉ đổi timeline khi đổi nghỉ", () => {
    const project = migrateProjectData({ ...oldProject(), comments: [makeComment("a", 1, 2), makeComment("b", 2, 3)] });
    const pauseOnly = applyVoiceSettingsToAll(project, { rate: 1.2, pitch: 0, pauseAfter: 0.1 }, { rate: false, pitch: false, pauseAfter: true });
    expect(pauseOnly.comments.every((comment) => comment.audioStatus === "ready" && comment.audioDuration)).toBe(true);
    const rateChanged = applyVoiceSettingsToAll(project, { rate: 1.2, pitch: 0, pauseAfter: 0.1 }, { rate: true, pitch: false, pauseAfter: false });
    expect(rateChanged.comments.every((comment) => comment.audioStatus === "stale" && comment.audioDuration === undefined)).toBe(true);
  });
});

describe("applyVoiceToAll", () => {
  it.each(["edge", "macos", "voicestudio", "elevenlabs"] as const)("áp dụng provider %s cho mọi comment", (providerId) => {
    const project = migrateProjectData({ ...oldProject(), comments: [makeComment("a", 1, 2), makeComment("b", 2, 3)] });

    const updated = applyVoiceToAll(project, providerId, `${providerId}-voice`);

    expect(updated.settings).toMatchObject({ defaultProvider: providerId, defaultVoiceId: `${providerId}-voice` });
    expect(updated.comments.every((comment) => comment.provider === providerId && comment.voiceId === `${providerId}-voice`)).toBe(true);
    expect(updated.comments.every((comment) => comment.audioStatus === "stale" && comment.audioDuration === undefined)).toBe(true);
  });

  it("áp dụng cùng provider và voice cho comment, hội thoại và nội dung OCR", () => {
    const project = migrateProjectData({ ...oldProject(), comments: [makeComment("a", 1, 2), makeComment("b", 2, 3)] });
    project.comments[0]!.conversation = {
      enabled: true,
      image: project.comments[0]!.image,
      mode: "replace",
      revealMode: "step",
      speakerAVoiceId: "old-a",
      speakerBVoiceId: "old-b",
      messageGapSeconds: 0.1,
      dingEnabled: true,
      dingVolume: 0.5,
      dingLeadSeconds: 0,
      messages: [{
        id: "message-a",
        order: 1,
        speaker: "a",
        text: "Xin chào",
        box: { x: 0, y: 0, width: 1, height: 1 },
        confidence: 1,
        voiceId: "old-message",
        audioStatus: "ready",
        audioDuration: 1
      }]
    };
    project.comments[1]!.attachment = {
      kind: "image",
      asset: project.comments[1]!.image,
      mode: "text",
      detectedType: "text",
      classificationConfidence: 1,
      holdAfterSeconds: 2,
      clickEnabled: true,
      textBlocks: [{
        id: "block-b",
        order: 1,
        text: "Nội dung ảnh",
        speechText: "Nội dung ảnh",
        box: { x: 0, y: 0, width: 1, height: 1 },
        confidence: 1,
        audioStatus: "ready",
        audioDuration: 1
      }]
    };

    const updated = applyVoiceToAll(project, "voicestudio", "voice-shared");

    expect(updated.settings).toMatchObject({ defaultProvider: "voicestudio", defaultVoiceId: "voice-shared" });
    expect(updated.comments.every((comment) => comment.provider === "voicestudio" && comment.voiceId === "voice-shared")).toBe(true);
    expect(updated.comments.every((comment) => comment.audioStatus === "stale" && comment.audioDuration === undefined)).toBe(true);
    expect(updated.comments[0]!.conversation).toMatchObject({ speakerAVoiceId: "voice-shared", speakerBVoiceId: "voice-shared" });
    expect(updated.comments[0]!.conversation!.messages[0]).toMatchObject({ voiceId: "voice-shared", audioStatus: "stale", audioDuration: undefined });
    expect(updated.comments[1]!.attachment!.textBlocks[0]).toMatchObject({ audioStatus: "stale", audioDuration: undefined });
  });
});

describe("buildTimeline", () => {
  it("xếp comment theo thứ tự và tính chính xác ví dụ 21 giây", () => {
    const timeline = buildTimeline([
      makeComment("ba", 3, 5.1),
      makeComment("mot", 1, 6.2),
      makeComment("hai", 2, 8.5)
    ]);

    expect(timeline.durationSeconds).toBe(21);
    expect(timeline.segments.map((segment) => segment.commentId)).toEqual(["mot", "hai", "ba"]);
    expect(timeline.segments.map((segment) => segment.startSeconds)).toEqual([0, 6.6, 15.5]);
  });

  it("làm tròn lên theo frame để không cắt cuối audio", () => {
    const timeline = buildTimeline([makeComment("mot", 1, 1.001, 0)], 30);
    expect(timeline.durationFrames).toBe(31);
    expect(timeline.durationSeconds).toBeCloseTo(1.0333, 3);
  });

  it("giữ ảnh nội dung thêm 2 giây sau khi giọng đọc kết thúc", () => {
    const comment = makeComment("anh-noi-dung", 1, 3, 0.1);
    comment.attachment = {
      kind: "image",
      asset: comment.image,
      mode: "auto",
      detectedType: "illustration",
      classificationConfidence: 1,
      textBlocks: [],
      revealStartSeconds: 3,
      holdAfterSeconds: 2,
      clickEnabled: true
    };
    expect(buildTimeline([comment], 30).durationSeconds).toBe(5.1);
  });

  it("mặc định project mới nghỉ 0,1 giây sau khi audio kết thúc", () => {
    const timeline = buildTimeline([
      makeComment("mot", 1, 1.295792, defaultProjectSettings.defaultPauseAfter),
      makeComment("hai", 2, 1, defaultProjectSettings.defaultPauseAfter)
    ], 30);
    expect(defaultProjectSettings.defaultPauseAfter).toBe(0.1);
    expect(defaultProjectSettings.defaultRate).toBe(1.2);
    expect(timeline.segments[1]!.startFrame).toBe(42);
    expect(timeline.segments[1]!.startSeconds - 1.395792).toBeLessThan(1 / 30);
  });

  it("từ chối comment chưa có audio", () => {
    expect(() => buildTimeline([makeComment("mot", 1)])).toThrow("chưa có thời lượng audio hợp lệ");
  });
});

describe("timeline hội thoại", () => {
  it("chọn đúng tin đang đọc và tạo cửa sổ cuộn giữ tin hiện tại", () => {
    const comment = makeComment("chat", 1, 5);
    comment.conversation = {
      enabled: true,
      image: comment.image,
      mode: "replace",
      revealMode: "scroll",
      speakerAVoiceId: "a",
      speakerBVoiceId: "b",
      messageGapSeconds: 0.08,
      dingEnabled: true,
      dingVolume: 0.25,
      dingLeadSeconds: 0.1,
      messages: [
        { id: "m1", order: 1, speaker: "a", text: "Một", box: { x: 0.1, y: 0.2, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "ready", revealStartSeconds: 0 },
        { id: "m2", order: 2, speaker: "b", text: "Hai", box: { x: 0.5, y: 0.82, width: 0.4, height: 0.08 }, confidence: 1, audioStatus: "ready", revealStartSeconds: 2 }
      ]
    };
    expect(activeConversationMessage(comment, 1)?.id).toBe("m1");
    expect(activeConversationMessage(comment, 2.1)?.id).toBe("m2");
    const viewport = conversationViewport(comment.conversation.messages, "m2", 0.5);
    expect(viewport.top).toBeCloseTo(0.425, 6);
    expect(viewport.bottom).toBeCloseTo(0.925, 6);
  });
});

function oldProject(): ProjectData { return {
  id: "du-an-cu",
  name: "Dự án cũ",
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  comments: [makeComment("mot", 1, 2)],
  settings: {
    ...defaultProjectSettings,
    overlay: { ...defaultProjectSettings.overlay, topPercent: 9 }
  }
} as ProjectData; }

describe("migrateProjectData", () => {
  it("mở được project cũ và giữ nguyên bố cục đã lưu", () => {
    const migrated = migrateProjectData(oldProject());
    expect(migrated.settings.overlay.topPercent).toBe(9);
    expect(migrated.illustrations.enabled).toBe(false);
    expect(migrated.illustrations.videos).toEqual([]);
    expect(migrated.music).toMatchObject({ enabled: false, volume: 0.1, ducking: true });
    expect(migrated.soundEffects).toEqual({
      enabled: true,
      volume: 0.2,
      assets: [],
      events: [],
      appearance: { enabled: true, volume: 0.35, leadSeconds: 0.08 }
    });
    expect(migrated.branding).toEqual(createDefaultBrandingSettings());
    expect(migrated.settings.tiktok).toEqual({ enabled: false, caption: "", mode: "now" });
  });

  it("bổ sung cài đặt TikTok cho project cũ và giữ cấu hình đã chọn", () => {
    const legacy = oldProject();
    delete (legacy.settings as Partial<ProjectData["settings"]>).tiktok;
    expect(migrateProjectData(legacy).settings.tiktok).toEqual({ enabled: false, caption: "", mode: "now" });

    const configured = migrateProjectData({
      ...oldProject(),
      settings: {
        ...oldProject().settings,
        tiktok: {
          enabled: true,
          chromeProfileDirectory: "Profile 2",
          chromeProfileName: "Kenh Demo",
          caption: "Caption #viral",
          mode: "schedule",
          scheduledAt: "2026-10-23T20:30"
        }
      }
    });
    expect(configured.settings.tiktok).toMatchObject({ enabled: true, chromeProfileDirectory: "Profile 2", mode: "schedule" });
  });

  it("giữ nguyên cấu hình watermark và logo đã lưu", () => {
    const migrated = migrateProjectData({
      ...oldProject(),
      branding: {
        watermark: { enabled: true, text: "@kenh", opacity: 0.4, xPercent: 44, yPercent: 90, fontSize: 48 },
        logo: {
          enabled: true, opacity: 0.7, xPercent: 82, yPercent: 16, widthPercent: 18,
          asset: { relativePath: "assets/branding/logo.png", originalName: "logo.png", mimeType: "image/png", size: 10 }
        }
      }
    });
    expect(migrated.branding.watermark).toMatchObject({ enabled: true, text: "@kenh", opacity: 0.4 });
    expect(migrated.branding.logo).toMatchObject({ enabled: true, xPercent: 82, opacity: 0.7 });
  });
});

describe("assignIllustrationVideos", () => {
  const projectWithVideos = (): ProjectData => {
    const project = migrateProjectData({
      ...oldProject(),
      comments: [1, 2, 3, 4, 5].map((order) => makeComment(`c${order}`, order, 2))
    });
    project.illustrations.videos = ["a", "b", "c"].map((id) => ({
      id,
      relativePath: `assets/illustrations/${id}.mp4`,
      originalName: `${id}.mp4`,
      mimeType: "video/mp4",
      size: 10,
      duration: 10,
      width: 720,
      height: 1280
    }));
    return project;
  };

  it("cùng seed tạo cùng kết quả và không lặp video liền nhau", () => {
    const first = assignIllustrationVideos(projectWithVideos(), 1234);
    const second = assignIllustrationVideos(projectWithVideos(), 1234);
    const ids = first.comments.map((comment) => comment.illustrationVideoId);
    expect(ids).toEqual(second.comments.map((comment) => comment.illustrationVideoId));
    expect(ids.every((id, index) => index === 0 || id !== ids[index - 1])).toBe(true);
  });

  it("giữ phân bổ đã khóa và chỉ chọn điểm bắt đầu hợp lệ", () => {
    const project = projectWithVideos();
    project.comments[0] = {
      ...project.comments[0]!,
      illustrationVideoId: "b",
      illustrationStartSeconds: 1.25,
      illustrationLocked: true
    };
    const assigned = assignIllustrationVideos(project, 9);
    expect(assigned.comments[0]).toMatchObject({
      illustrationVideoId: "b",
      illustrationStartSeconds: 1.25,
      illustrationLocked: true
    });
    for (const comment of assigned.comments.slice(1)) {
      expect(comment.illustrationStartSeconds).toBeGreaterThanOrEqual(0);
      expect(comment.illustrationStartSeconds).toBeLessThanOrEqual(7.6);
    }
  });
});

