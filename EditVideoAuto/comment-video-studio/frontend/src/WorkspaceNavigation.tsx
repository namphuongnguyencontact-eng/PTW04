export type StudioWorkspace = "manual" | "auto-threads";

type WorkspaceNavigationProps = {
  value: StudioWorkspace;
  onChange: (workspace: StudioWorkspace) => void;
};

function ManualIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path d="M4 7.5h16M7.5 4v7M16.5 13v7M4 16.5h16" />
    <circle cx="7.5" cy="16.5" r="2" />
    <circle cx="16.5" cy="7.5" r="2" />
  </svg>;
}

function AutoIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path d="M8 6.5h8M8 11.5h5M8 16.5h3" />
    <path d="M18.5 13v6m-3-3h6" />
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
  </svg>;
}

export function WorkspaceNavigation({ value, onChange }: WorkspaceNavigationProps) {
  return <nav className="workspace-navigation" aria-label="Chế độ làm việc">
    <button type="button" aria-pressed={value === "manual"} className={value === "manual" ? "active" : ""} onClick={() => onChange("manual")}>
      <ManualIcon />
      <span><strong>Chỉnh sửa thủ công</strong><small>Ảnh, giọng đọc và timeline</small></span>
    </button>
    <button type="button" aria-pressed={value === "auto-threads"} className={value === "auto-threads" ? "active" : ""} onClick={() => onChange("auto-threads")}>
      <AutoIcon />
      <span><strong>Auto từ Threads</strong><small>Dán link, chọn comment và reply</small></span>
    </button>
  </nav>;
}

type ThreadsAutoImportPanelProps = {
  url: string;
  busy: string;
  onUrlChange: (url: string) => void;
  onOpenBrowser: () => void;
  onAnalyze: () => void;
};

export function ThreadsAutoImportPanel({ url, busy, onUrlChange, onOpenBrowser, onAnalyze }: ThreadsAutoImportPanelProps) {
  return <section className="settings-section threads-import-section auto-import-card" aria-labelledby="threads-import-title">
    <div className="auto-import-heading">
      <span className="workspace-label">Auto Threads</span>
      <h3 id="threads-import-title">Lấy bài viết và comment</h3>
      <p>Luồng này được tách riêng, không thay đổi cách dựng video thủ công.</p>
    </div>
    <ol className="auto-flow-steps" aria-label="Các bước nhập từ Threads">
      <li><span>1</span><div><strong>Mở Chrome local</strong><small>Đăng nhập Threads một lần.</small></div></li>
      <li><span>2</span><div><strong>Dán link bài viết</strong><small>Tool đọc bài, comment và reply.</small></div></li>
      <li><span>3</span><div><strong>Chọn nội dung phù hợp</strong><small>Kiểm tra trước khi nhập vào project.</small></div></li>
    </ol>
    <label htmlFor="threads-url">Link bài Threads</label>
    <input id="threads-url" type="url" inputMode="url" autoComplete="url" placeholder="https://www.threads.net/@.../post/..." value={url} onChange={(event) => onUrlChange(event.target.value)} />
    <div className="auto-import-actions">
      <button type="button" className="secondary" onClick={onOpenBrowser} disabled={busy === "threads-browser"}>
        {busy === "threads-browser" ? "Đang mở Chrome local…" : "Mở Chrome local"}
      </button>
      <button type="button" className="primary" onClick={onAnalyze} disabled={!url.trim() || busy === "threads-analyze"}>
        {busy === "threads-analyze" ? "Đang đọc Threads…" : "Phân tích bài và chọn comment hay"}
      </button>
    </div>
    <p className="provider-notice offline">Mở Chrome local, đăng nhập Threads rồi quay lại phân tích. Cửa sổ và phiên đăng nhập được giữ nguyên trên máy; tool không lưu mật khẩu. Comment ngắn vẫn được giữ nếu phù hợp hoặc có nhiều lượt thích.</p>
  </section>;
}

type AutoWorkspaceSummaryProps = {
  commentCount: number;
  hasBackground: boolean;
  brollCount: number;
  hasWatermark: boolean;
  hasLogo: boolean;
};

export function AutoWorkspaceSummary({ commentCount, hasBackground, brollCount, hasWatermark, hasLogo }: AutoWorkspaceSummaryProps) {
  const readyCount = [hasBackground, brollCount > 0, hasWatermark, hasLogo].filter(Boolean).length;
  return <section className="auto-workspace-summary" aria-label="Trạng thái quy trình Auto Threads">
    <div>
      <span className="workspace-label">Workspace riêng</span>
      <strong>Auto Threads</strong>
      <small>Dữ liệu Auto dùng cùng engine xuất video, nhưng màn hình nhập và xử lý được tách khỏi chế độ thủ công.</small>
    </div>
    <dl>
      <div><dt>Comment</dt><dd>{commentCount}</dd></div>
      <div><dt>Video nền</dt><dd className={hasBackground ? "ready" : "pending"}>{hasBackground ? "Đã chọn" : "Chưa có"}</dd></div>
      <div><dt>B-roll</dt><dd className={brollCount ? "ready" : "pending"}>{brollCount ? `${brollCount} clip` : "Chưa có"}</dd></div>
      <div><dt>Nhận diện</dt><dd>{readyCount}/4 cài đặt</dd></div>
    </dl>
  </section>;
}
