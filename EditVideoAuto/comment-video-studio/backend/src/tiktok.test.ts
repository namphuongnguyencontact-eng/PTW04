import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChooseVideoScript,
  buildUploadStartedScript,
  ChromeProfileCatalog,
  MacChromeTikTokAutomation,
  TikTokPublishQueue,
  type TikTokCommandRunner,
  type TikTokPublishRequest
} from "./tiktok.js";

let root: string;
let localStatePath: string;
let videoPath: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "comment-video-tiktok-test-"));
  localStatePath = path.join(root, "Local State");
  videoPath = path.join(root, "video.mp4");
  await writeFile(localStatePath, JSON.stringify({
    profile: {
      info_cache: {
        "Profile 2": { name: "Kenh Demo" },
        Default: { name: "creator" }
      }
    }
  }));
  await writeFile(videoPath, "video");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function request(mode: "now" | "schedule" = "now"): TikTokPublishRequest {
  return {
    projectId: "project-1",
    renderJobId: "render-1",
    videoPath,
    settings: {
      enabled: true,
      chromeProfileDirectory: "Profile 2",
      chromeProfileName: "Kenh Demo",
      caption: "Caption tiếng Việt #viral",
      mode,
      scheduledAt: mode === "schedule" ? "2026-10-23T20:30" : undefined
    }
  };
}

describe("ChromeProfileCatalog", () => {
  it("chỉ đọc tên và thư mục của các hồ sơ Chrome thật", async () => {
    const profiles = await new ChromeProfileCatalog(localStatePath).list();
    expect(profiles).toEqual([
      { directory: "Default", name: "creator" },
      { directory: "Profile 2", name: "Kenh Demo" }
    ]);
  });

  it("từ chối thư mục hồ sơ không có trong Chrome Local State", async () => {
    await expect(new ChromeProfileCatalog(localStatePath).require("../../khác")).rejects.toThrow("không còn tồn tại");
  });
});

describe("MacChromeTikTokAutomation", () => {
  it("mở đúng trang cài đặt Trợ năng của macOS", async () => {
    const runner: TikTokCommandRunner = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const automation = new MacChromeTikTokAutomation(new ChromeProfileCatalog(localStatePath), runner, path.join(root, "Chrome"));

    await automation.openAccessibilitySettings();

    expect(runner).toHaveBeenCalledWith("/usr/bin/open", [
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    ], { timeoutMs: 10_000 });
  });

  it("dừng kiểm tra ngay và hướng dẫn ngắn gọn khi Chrome chặn Apple Events", async () => {
    const runner: TikTokCommandRunner = vi.fn(async (command, args) => {
      if (command === "/usr/bin/open") return { stdout: "", stderr: "" };
      const script = args.join(" ");
      if (script.includes("execute browserTab javascript")) {
        throw new Error("Google Chrome gặp lỗi: Tùy chọn thực thi JavaScript qua AppleScript đã bị tắt.");
      }
      if (script.includes("UI elements enabled")) return { stdout: "true\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const chromeExecutable = path.join(root, "Google Chrome");
    await writeFile(chromeExecutable, "chrome");
    const automation = new MacChromeTikTokAutomation(new ChromeProfileCatalog(localStatePath), runner, chromeExecutable);

    const result = await automation.preflight("Profile 2");

    expect(result).toMatchObject({ chromeOpened: true, appleEventsReady: false, accessibilityReady: true });
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("mở đúng hồ sơ thật, chọn video, điền caption và chỉ bấm đúng nút đăng", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: TikTokCommandRunner = vi.fn(async (command, args) => {
      calls.push({ command, args });
      const script = args.join("\n");
      if (script.includes("UI elements enabled")) return { stdout: "true\n", stderr: "" };
      if (script.includes("const labels =")) return { stdout: "focused\n", stderr: "" };
      if (script.includes("const selected =")) return { stdout: "selected\n", stderr: "" };
      if (script.includes("return editor ? 'ready' : 'waiting'")) return { stdout: "ready\n", stderr: "" };
      if (script.includes("editor.focus")) return { stdout: "focused\n", stderr: "" };
      if (script.includes("const expectedCaption =")) return { stdout: "matched\n", stderr: "" };
      if (script.includes("const copyrightIncomplete =")) return { stdout: "clicked\n", stderr: "" };
      if (script.includes("const expected =")) return { stdout: "clicked\n", stderr: "" };
      if (script.includes("document.readyState")) return { stdout: "ready\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const chromeExecutable = path.join(root, "Google Chrome");
    await writeFile(chromeExecutable, "chrome");
    const automation = new MacChromeTikTokAutomation(new ChromeProfileCatalog(localStatePath), runner, chromeExecutable);
    const stages: string[] = [];

    await automation.publish(request(), (stage) => stages.push(stage));

    expect(calls.some((call) => call.command === "/usr/bin/open" && call.args.includes("--profile-directory=Profile 2"))).toBe(true);
    const fileChooserCall = calls.find((call) => call.command === "/usr/bin/osascript" && call.args.join(" ").includes(videoPath));
    expect(fileChooserCall?.args.join(" ")).toContain("key code 36");
    expect(fileChooserCall?.args.join(" ")).toContain('keystroke "g" using {command down, shift down}');
    expect(fileChooserCall?.args.join(" ")).toContain(`set the clipboard to "${videoPath}"`);
    expect(fileChooserCall?.args.join(" ")).toContain('keystroke "v" using {command down}');
    expect(fileChooserCall?.args.join(" ")).toContain("delay 2.5");
    expect(fileChooserCall?.args.join(" ")).toContain("set the clipboard to previousClipboard");
    expect(fileChooserCall?.args.join(" ")).not.toContain(`keystroke "${videoPath}"`);
    const captionPasteCall = calls.find((call) => call.command === "/usr/bin/osascript" && call.args.join(" ").includes('set the clipboard to "Caption tiếng Việt #viral"'));
    expect(captionPasteCall?.args.join(" ")).toContain('keystroke "a" using {command down}');
    expect(captionPasteCall?.args.join(" ")).toContain("key code 51");
    expect(captionPasteCall?.args.join(" ")).toContain('keystroke "v" using {command down}');
    expect(captionPasteCall?.args.join(" ")).toContain("set the clipboard to previousClipboard");
    expect(calls.some((call) => call.args.join(" ").includes("set active tab index of browserWindow to tabNumber"))).toBe(true);
    expect(calls.some((call) => call.args.join(" ").includes("input.files && input.files.length > 0"))).toBe(true);
    expect(calls.some((call) => call.args.join(" ").includes("Caption tiếng Việt #viral"))).toBe(true);
    const captionChecks = calls
      .map((call, index) => call.args.join(" ").includes("const expectedCaption =") ? index : -1)
      .filter((index) => index >= 0);
    const submitIndex = calls.findIndex((call) => call.args.join(" ").includes("const expected ="));
    expect(captionChecks.length).toBeGreaterThanOrEqual(3);
    expect(captionChecks.every((index) => index < submitIndex)).toBe(true);
    expect(calls.some((call) => {
      const script = call.args.join(" ");
      return script.includes("const copyrightIncomplete =")
        && script.includes("kiểm tra bản quyền chưa hoàn tất")
        && script.includes("đăng ngay")
        && script.includes("confirmation.click()");
    })).toBe(true);
    expect(stages).toEqual(["opening-chrome", "uploading", "configuring", "submitting", "submitting"]);
  });

  it("điền ngày và giờ trước khi bấm nút lên lịch", async () => {
    const scripts: string[] = [];
    const runner: TikTokCommandRunner = vi.fn(async (_command, args) => {
      const script = args.join("\n");
      scripts.push(script);
      if (script.includes("UI elements enabled")) return { stdout: "true\n", stderr: "" };
      if (script.includes("const labels =")) return { stdout: "focused\n", stderr: "" };
      if (script.includes("const selected =")) return { stdout: "selected\n", stderr: "" };
      if (script.includes("return editor ? 'ready' : 'waiting'")) return { stdout: "ready\n", stderr: "" };
      if (script.includes("editor.focus")) return { stdout: "focused\n", stderr: "" };
      if (script.includes("const expectedCaption =")) return { stdout: "matched\n", stderr: "" };
      if (script.includes("const copyrightIncomplete =")) return { stdout: "absent\n", stderr: "" };
      if (script.includes("scheduleLabel")) return { stdout: "clicked\n", stderr: "" };
      if (script.includes("dateInput && timeInput")) return { stdout: "ready\n", stderr: "" };
      if (script.includes("2026-10-23")) return { stdout: "set\n", stderr: "" };
      if (script.includes("const expected =")) return { stdout: "clicked\n", stderr: "" };
      if (script.includes("document.readyState")) return { stdout: "ready\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const chromeExecutable = path.join(root, "Google Chrome");
    await writeFile(chromeExecutable, "chrome");
    const automation = new MacChromeTikTokAutomation(new ChromeProfileCatalog(localStatePath), runner, chromeExecutable);

    await automation.publish(request("schedule"), () => undefined);
    expect(scripts.some((script) => script.includes("2026-10-23") && script.includes("20:30"))).toBe(true);
    expect(scripts.some((script) => script.includes("lên lịch") && script.includes("schedule"))).toBe(true);
  }, 10_000);

  it("chờ nút Chọn video hiện muộn thay vì báo lỗi missing ngay", async () => {
    let lookups = 0;
    const runner: TikTokCommandRunner = vi.fn(async (_command, args) => {
      const script = args.join("\n");
      if (script.includes("UI elements enabled")) return { stdout: "true\n", stderr: "" };
      if (script.includes("const labels =")) return { stdout: ++lookups < 2 ? "missing\n" : "focused\n", stderr: "" };
      if (script.includes("const selected =")) return { stdout: "selected\n", stderr: "" };
      if (script.includes("return editor ? 'ready' : 'waiting'")) return { stdout: "ready\n", stderr: "" };
      if (script.includes("editor.focus")) return { stdout: "focused\n", stderr: "" };
      if (script.includes("const expectedCaption =")) return { stdout: "matched\n", stderr: "" };
      if (script.includes("const copyrightIncomplete =")) return { stdout: "absent\n", stderr: "" };
      if (script.includes("const expected =")) return { stdout: "clicked\n", stderr: "" };
      if (script.includes("document.readyState")) return { stdout: "ready\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const chromeExecutable = path.join(root, "Google Chrome");
    await writeFile(chromeExecutable, "chrome");
    const automation = new MacChromeTikTokAutomation(new ChromeProfileCatalog(localStatePath), runner, chromeExecutable);

    await automation.publish(request(), () => undefined);
    expect(lookups).toBe(2);
  }, 10_000);

  it("nhận diện tab TikTok cả khi URL redirect mã hóa dấu = thành %3D và dừng sớm nếu chưa đăng nhập", async () => {
    const scripts: string[] = [];
    let loginChecks = 0;
    const runner: TikTokCommandRunner = vi.fn(async (_command, args) => {
      const script = args.join("\n");
      scripts.push(script);
      if (script.includes("UI elements enabled")) return { stdout: "true\n", stderr: "" };
      if (script.includes("const labels =")) {
        loginChecks += 1;
        return { stdout: "login-required\n", stderr: "" };
      }
      if (script.includes("document.readyState")) return { stdout: "ready\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const chromeExecutable = path.join(root, "Google Chrome");
    await writeFile(chromeExecutable, "chrome");
    const automation = new MacChromeTikTokAutomation(new ChromeProfileCatalog(localStatePath), runner, chromeExecutable);

    await expect(automation.publish(request(), () => undefined)).rejects.toThrow("chưa đăng nhập TikTok");
    expect(loginChecks).toBe(4);
    expect(scripts.some((script) => script.includes("cvs_upload_job%3Drender-1"))).toBe(true);
  }, 15_000);
});

type FakeElementOptions = {
  tagName: string;
  text?: string;
  attrs?: Record<string, string>;
  disabled?: boolean;
  hidden?: boolean;
  tabIndex?: number;
  files?: unknown[];
  children?: FakeElement[];
  shadowChildren?: FakeElement[];
  iframeDoc?: FakeRoot;
};

type FakeRoot = {
  body?: FakeElement;
  activeElement: FakeElement | null;
  defaultView?: {
    getComputedStyle: (el: FakeElement) => { visibility: string; display: string };
    focus: ReturnType<typeof vi.fn>;
  };
  querySelectorAll: (selector: string) => FakeElement[];
  querySelector: (selector: string) => FakeElement | null;
  textContent: string;
};

class FakeElement {
  tagName: string;
  textContent: string;
  innerText: string;
  disabled: boolean;
  hidden: boolean;
  tabIndex: number;
  files: unknown[];
  attrs: Map<string, string>;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  ownerDocument!: FakeRoot;
  rootNode!: FakeRoot;
  shadowRoot?: FakeRoot;
  contentDocument?: FakeRoot;
  scrolled = false;

  constructor(options: FakeElementOptions) {
    this.tagName = options.tagName.toUpperCase();
    this.textContent = options.text ?? "";
    this.innerText = options.text ?? "";
    this.disabled = Boolean(options.disabled);
    this.hidden = Boolean(options.hidden);
    this.tabIndex = options.tabIndex ?? (this.tagName === "BUTTON" || this.tagName === "INPUT" ? 0 : -1);
    this.files = options.files ?? [];
    this.attrs = new Map(Object.entries(options.attrs ?? {}));
    this.contentDocument = options.iframeDoc;
    for (const child of options.children ?? []) {
      this.appendChild(child);
    }
    if (options.shadowChildren) {
      this.shadowRoot = createRoot(options.shadowChildren);
    }
  }

  appendChild(child: FakeElement) {
    child.parentElement = this;
    this.children.push(child);
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
    if (name === "tabindex") this.tabIndex = Number(value);
  }

  contains(target: FakeElement | null): boolean {
    if (!target) return false;
    if (target === this) return true;
    return this.children.some((child) => child.contains(target));
  }

  closest(selector: string): FakeElement | null {
    const tags = selector.split(",").map((part) => part.trim().toUpperCase());
    let current: FakeElement | null = this;
    while (current) {
      if (tags.includes(current.tagName)) return current;
      current = current.parentElement;
    }
    return null;
  }

  getBoundingClientRect() {
    return this.hidden ? { width: 0, height: 0 } : { width: 120, height: 40 };
  }

  scrollIntoView() {
    this.scrolled = true;
  }

  focus() {
    if (this.tabIndex >= 0) {
      this.rootNode.activeElement = this;
      if (this.rootNode !== this.ownerDocument) {
        this.ownerDocument.activeElement = this;
      }
    }
  }

  getRootNode() {
    return this.rootNode;
  }

  fullText(): string {
    return [this.textContent, ...this.children.map((child) => child.fullText())].filter(Boolean).join(" ");
  }
}

function matchesSelector(el: FakeElement, selector: string) {
  return selector.split(",").some((part) => {
    const trimmed = part.trim();
    if (trimmed === "*") return true;
    if (trimmed === "button") return el.tagName === "BUTTON";
    if (trimmed === '[role="button"]') return el.getAttribute("role") === "button";
    if (trimmed === 'input[type="file"]') return el.tagName === "INPUT" && el.getAttribute("type") === "file";
    if (trimmed === "textarea") return el.tagName === "TEXTAREA";
    if (trimmed === '[contenteditable="true"]') return el.getAttribute("contenteditable") === "true";
    return false;
  });
}

function createRoot(children: FakeElement[], isDocument = false): FakeRoot {
  const body = new FakeElement({ tagName: "body", children });
  const winFocus = vi.fn();
  const root: FakeRoot = {
    body: isDocument ? body : undefined,
    activeElement: null,
    defaultView: isDocument
      ? {
          getComputedStyle: (el) => ({
            visibility: el.hidden ? "hidden" : "visible",
            display: el.hidden ? "none" : "block"
          }),
          focus: winFocus
        }
      : undefined,
    querySelectorAll(selector: string) {
      const found: FakeElement[] = [];
      const walk = (node: FakeElement) => {
        if (matchesSelector(node, selector)) found.push(node);
        for (const child of node.children) walk(child);
      };
      for (const child of body.children) walk(child);
      return found;
    },
    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null;
    },
    get textContent() {
      return body.fullText();
    }
  };

  const attach = (node: FakeElement, doc: FakeRoot, rootNode: FakeRoot) => {
    node.ownerDocument = doc;
    node.rootNode = rootNode;
    if (!node.textContent && node.children.length) {
      node.textContent = node.fullText();
      node.innerText = node.textContent;
    }
    for (const child of node.children) attach(child, doc, rootNode);
    if (node.shadowRoot) {
      for (const shadowChild of node.shadowRoot.querySelectorAll("*")) {
        shadowChild.ownerDocument = doc;
        shadowChild.rootNode = node.shadowRoot;
      }
    }
  };
  body.ownerDocument = root;
  body.rootNode = root;
  for (const child of body.children) attach(child, root, root);
  body.textContent = body.fullText();
  body.innerText = body.textContent;
  return root;
}

function runInjectedScript(script: string, doc: FakeRoot, pathname = "/tiktokstudio/upload") {
  const runner = new Function("document", "window", "location", `return (${script});`);
  return runner(doc, doc.defaultView, { pathname }) as string;
}

describe("TikTok browser scripts", () => {
  it("không chọn nhầm nút Tải lên ở sidebar khi trang tải lên chưa vẽ xong nút Chọn video", () => {
    const sidebarUpload = new FakeElement({ tagName: "button", text: "Tải video lên" });
    const sidebarLink = new FakeElement({ tagName: "a", text: "Upload video", attrs: { role: "button", href: "/tiktokstudio/upload" } });
    const doc = createRoot([
      new FakeElement({ tagName: "aside", children: [sidebarUpload, sidebarLink] }),
      new FakeElement({ tagName: "div", children: [new FakeElement({ tagName: "button", text: "Upload video" })] })
    ], true);

    expect(runInjectedScript(buildChooseVideoScript(), doc)).toBe("missing");
    expect(doc.activeElement).toBeNull();
  });

  it("ưu tiên nút button Chọn video bên trong thay vì khung dropzone div[role=button] bên ngoài", () => {
    const innerButton = new FakeElement({ tagName: "button", text: "Chọn video để tải lên" });
    const outerStage = new FakeElement({
      tagName: "div",
      attrs: { role: "button" },
      text: "Chọn video để tải lên Hoặc kéo và thả tệp",
      children: [innerButton]
    });
    const doc = createRoot([
      new FakeElement({ tagName: "aside", children: [new FakeElement({ tagName: "button", text: "Chọn video" })] }),
      new FakeElement({ tagName: "main", children: [outerStage] })
    ], true);

    expect(runInjectedScript(buildChooseVideoScript(), doc)).toBe("focused");
    expect(doc.activeElement).toBe(innerButton);
    expect(innerButton.scrolled).toBe(true);
  });

  it("tìm được nút chọn tệp trong cùng khung chứa input[type=file] ngay cả khi TikTok đổi chữ", () => {
    const uploadButton = new FakeElement({ tagName: "button", text: "Tải từ máy" });
    const fileInput = new FakeElement({ tagName: "input", attrs: { type: "file", accept: "video/*" }, hidden: true });
    const card = new FakeElement({
      tagName: "div",
      children: [
        new FakeElement({ tagName: "div", children: [new FakeElement({ tagName: "div", children: [fileInput] })] }),
        new FakeElement({ tagName: "div", children: [uploadButton] })
      ]
    });
    const doc = createRoot([new FakeElement({ tagName: "main", children: [card] })], true);

    expect(runInjectedScript(buildChooseVideoScript(), doc)).toBe("focused");
    expect(doc.activeElement).toBe(uploadButton);
  });

  it("tìm và focus được nút Chọn video nằm trong iframe cùng nguồn và nhận biết upload bắt đầu trong iframe", () => {
    const iframeButton = new FakeElement({ tagName: "button", text: "Select video" });
    const iframeInput = new FakeElement({ tagName: "input", attrs: { type: "file", accept: "video/*" }, hidden: true, files: [{ name: "video.mp4" }] });
    const iframeDoc = createRoot([new FakeElement({ tagName: "div", children: [iframeInput, iframeButton] })], true);
    const doc = createRoot([new FakeElement({ tagName: "iframe", iframeDoc })], true);

    expect(runInjectedScript(buildChooseVideoScript(), doc)).toBe("focused");
    expect(iframeDoc.activeElement).toBe(iframeButton);
    expect(iframeDoc.defaultView?.focus).toHaveBeenCalledTimes(1);
    expect(runInjectedScript(buildUploadStartedScript("/tmp/video.mp4"), doc)).toBe("selected");
  });

  it("bỏ qua nút đang disabled và trả về login-required khi bị chuyển về trang đăng nhập", () => {
    const disabledButton = new FakeElement({ tagName: "button", text: "Chọn video", disabled: true });
    const doc = createRoot([
      new FakeElement({ tagName: "main", children: [disabledButton, new FakeElement({ tagName: "div", text: "Đăng nhập vào TikTok" })] })
    ], true);

    expect(runInjectedScript(buildChooseVideoScript(), doc, "/login")).toBe("login-required");
  });
});

describe("TikTokPublishQueue", () => {
  it("xếp hàng tuần tự và lưu lỗi an toàn khi tự động hóa thất bại", async () => {
    const automation = {
      listProfiles: vi.fn(async () => []),
      preflight: vi.fn(),
      openAccessibilitySettings: vi.fn(),
      publish: vi.fn(async () => { throw new Error("TikTok đổi giao diện"); })
    };
    const queue = new TikTokPublishQueue(automation);
    const job = queue.enqueue(request());
    await vi.waitFor(() => expect(queue.list()[0]?.status).toBe("failed"));
    expect(queue.list()[0]).toMatchObject({ id: job.id, progress: 0, error: "TikTok đổi giao diện" });
  });
});
