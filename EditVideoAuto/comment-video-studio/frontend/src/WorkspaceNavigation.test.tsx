import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutoWorkspaceSummary, ThreadsAutoImportPanel, WorkspaceNavigation } from "./WorkspaceNavigation.js";

describe("WorkspaceNavigation", () => {
  it("đánh dấu đúng workspace đang hoạt động", () => {
    const html = renderToStaticMarkup(<WorkspaceNavigation value="manual" onChange={() => undefined} />);
    expect(html).toContain("Chỉnh sửa thủ công");
    expect(html).toContain("Auto từ Threads");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("hiển thị quy trình Auto Threads riêng và trạng thái project", () => {
    const panel = renderToStaticMarkup(<ThreadsAutoImportPanel
      url="https://www.threads.net/@demo/post/abc"
      busy=""
      onUrlChange={() => undefined}
      onOpenBrowser={() => undefined}
      onAnalyze={() => undefined}
    />);
    const summary = renderToStaticMarkup(<AutoWorkspaceSummary
      commentCount={8}
      hasBackground
      brollCount={24}
      hasWatermark
      hasLogo={false}
    />);
    expect(panel).toContain("Lấy bài viết và comment");
    expect(panel).toContain("Mở Chrome local");
    expect(panel).toContain("Phân tích bài và chọn comment hay");
    expect(panel).toContain("Dán link bài viết");
    expect(summary).toContain("8");
    expect(summary).toContain("24 clip");
    expect(summary).toContain("3/4 cài đặt");
  });

});
