import { describe, expect, it } from "vitest";
import { classifyImageContent, groupChatObservations, sortObservationsForReading } from "./conversation.js";

describe("OCR hội thoại", () => {
  it("lọc giao diện, ghép dòng trong cùng bong bóng và phân hai người", () => {
    const messages = groupChatObservations([
      { text: "Tìm nội dung liên quan", confidence: 1, x: 0.08, y: 0.04, width: 0.4, height: 0.03 },
      { text: "Thứ 4, 14 thg 10", confidence: 1, x: 0.4, y: 0.22, width: 0.2, height: 0.02 },
      { text: "c ơi", confidence: 0.98, x: 0.18, y: 0.27, width: 0.12, height: 0.03 },
      { text: "đơn xa c làm ơn típ dùm em", confidence: 0.91, x: 0.18, y: 0.34, width: 0.34, height: 0.025 },
      { text: "10-50k tùy tâm nhé", confidence: 0.87, x: 0.18, y: 0.37, width: 0.28, height: 0.025 },
      { text: "e còn đúng 127k :))", confidence: 0.95, x: 0.57, y: 0.44, width: 0.28, height: 0.025 },
      { text: "em là hs đang đi học\n11:11 SA-", confidence: 0.93, x: 0.57, y: 0.47, width: 0.3, height: 0.025 },
      { text: "THU SA", confidence: 0.3, x: 0.54, y: 0.5, width: 0.08, height: 0.01 },
      { text: "Threadslite. DN", confidence: 0.7, x: 0.2, y: 0.8, width: 0.4, height: 0.05 }
    ]);
    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.speaker)).toEqual(["a", "a", "b"]);
    expect(messages[1]?.text).toBe("đơn xa c làm ơn típ dùm em\n10-50k tùy tâm nhé");
    expect(messages[2]?.text).toBe("e còn đúng 127k :))\nem là hs đang đi học");
    expect(messages[1]?.box.height).toBeGreaterThan(0.04);
  });
});

describe("phân loại ảnh nội dung", () => {
  it("không nhận nhầm danh sách đánh số thành hội thoại", () => {
    const result = classifyImageContent([
      { text: "1. Thời gian rảnh anh thường làm gì?", confidence: 0.98, x: 0.12, y: 0.2, width: 0.7, height: 0.04 },
      { text: "2. Nếu được tự xây một căn nhà", confidence: 0.96, x: 0.12, y: 0.26, width: 0.68, height: 0.04 },
      { text: "3. Cách anh thể hiện tình cảm", confidence: 0.97, x: 0.12, y: 0.32, width: 0.62, height: 0.04 }
    ]);
    expect(result.type).toBe("text");
    expect(result.textBlocks.map((block) => block.order)).toEqual([1, 2, 3]);
  });

  it("chỉ nhận hội thoại khi có đối đáp hai phía rõ ràng", () => {
    const result = classifyImageContent([
      { text: "Chào bạn", confidence: 0.98, x: 0.08, y: 0.22, width: 0.26, height: 0.05 },
      { text: "Chào bạn nhé", confidence: 0.97, x: 0.64, y: 0.36, width: 0.28, height: 0.05 },
      { text: "Hôm nay thế nào?", confidence: 0.96, x: 0.08, y: 0.5, width: 0.32, height: 0.05 },
      { text: "Rất vui", confidence: 0.95, x: 0.68, y: 0.64, width: 0.22, height: 0.05 }
    ]);
    expect(result.type).toBe("conversation");
    expect(result.messages).toHaveLength(4);
  });

  it("đọc từ trên xuống và từ trái sang phải trên cùng một hàng", () => {
    const ordered = sortObservationsForReading([
      { text: "phải", confidence: 1, x: 0.6, y: 0.2, width: 0.2, height: 0.04 },
      { text: "dưới", confidence: 1, x: 0.1, y: 0.4, width: 0.2, height: 0.04 },
      { text: "trái", confidence: 1, x: 0.1, y: 0.205, width: 0.2, height: 0.04 }
    ]);
    expect(ordered.map((item) => item.text)).toEqual(["trái", "phải", "dưới"]);
  });
});
