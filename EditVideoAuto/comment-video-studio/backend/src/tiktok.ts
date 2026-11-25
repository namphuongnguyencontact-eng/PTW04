import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type ChromeProfileInfo,
  type TikTokPreflightResult,
  type TikTokPublishingSettings,
  type TikTokPublishJob
} from "@comment-video-studio/shared";
import { runCommand, type CommandOptions, type CommandResult } from "./command.js";

export const TIKTOK_UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video";

export type TikTokCommandRunner = (
  command: string,
  args: string[],
  options?: CommandOptions
) => Promise<CommandResult>;

type ChromeLocalState = {
  profile?: {
    info_cache?: Record<string, { name?: string }>;
  };
};

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeAppleScript(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function appleEventsDisabled(message: string) {
  return /javascript.{0,80}(apple events|applescript).{0,80}(disabled|turned off|bị tắt|chưa bật)/i.test(message)
    || /(allow|cho phép).{0,40}javascript.{0,40}(apple events|applescript)/i.test(message);
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Tác vụ đăng TikTok đã bị hủy."));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Tác vụ đăng TikTok đã bị hủy."));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export class ChromeProfileCatalog {
  constructor(
    private readonly localStatePath = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "Local State")
  ) {}

  async list(): Promise<ChromeProfileInfo[]> {
    const parsed = JSON.parse(await readFile(this.localStatePath, "utf8")) as ChromeLocalState;
    return Object.entries(parsed.profile?.info_cache ?? {})
      .map(([directory, profile]) => ({ directory, name: compactText(profile.name ?? directory) || directory }))
      .sort((left, right) => left.name.localeCompare(right.name, "vi", { numeric: true }));
  }

  async require(directory: string) {
    if (!directory || /[\\/\0]|\.\./.test(directory)) {
      throw new Error("Hồ sơ Chrome đã chọn không còn tồn tại. Hãy chọn lại hồ sơ trong project.");
    }
    const profile = (await this.list()).find((candidate) => candidate.directory === directory);
    if (!profile) throw new Error("Hồ sơ Chrome đã chọn không còn tồn tại. Hãy chọn lại hồ sơ trong project.");
    return profile;
  }
}

export type TikTokPublishStage = Exclude<TikTokPublishJob["status"], "waiting-for-render" | "queued" | "completed" | "failed" | "cancelled">;

export interface TikTokPublishRequest {
  projectId: string;
  renderJobId: string;
  videoPath: string;
  settings: TikTokPublishingSettings;
}

export interface TikTokAutomation {
  listProfiles(): Promise<ChromeProfileInfo[]>;
  preflight(profileDirectory: string): Promise<TikTokPreflightResult>;
  openAccessibilitySettings(): Promise<void>;
  publish(
    request: TikTokPublishRequest,
    onProgress: (stage: TikTokPublishStage, progress: number, message: string) => void,
    signal?: AbortSignal
  ): Promise<void>;
}

export function buildChooseVideoScript() {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const win = el.ownerDocument?.defaultView || window;
      const s = win.getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const enabled = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    const tagOf = (el) => String(el.tagName || '').toUpperCase();
    const isNav = (el) => Boolean(el.closest?.('nav,aside,header')) || (tagOf(el) === 'A' && Boolean(el.getAttribute('href')));
    const roots = [];
    const visited = new Set();
    const collectRoots = (root) => {
      if (!root || visited.has(root)) return;
      visited.add(root);
      roots.push(root);
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collectRoots(el.shadowRoot);
        if (tagOf(el) === 'IFRAME') {
          try { if (el.contentDocument) collectRoots(el.contentDocument); } catch {}
        }
      }
    };
    collectRoots(document);
    const labels = ['chọn video', 'select video', 'choose video', 'chọn tệp', 'select file', 'chọn tệp tin', 'chọn video từ máy'];
    const text = (item) => normalize(item.innerText || item.textContent || item.getAttribute('aria-label'));
    const allControls = roots
      .flatMap((root) => [...root.querySelectorAll('button,[role="button"]')])
      .filter((el) => visible(el) && enabled(el));
    const mainControls = allControls.filter((el) => !isNav(el));
    const hasNestedControl = (el) => mainControls.some((other) => other !== el && el.contains(other));
    const orderedControls = [
      ...mainControls.filter((el) => tagOf(el) === 'BUTTON' && !hasNestedControl(el)),
      ...mainControls.filter((el) => tagOf(el) === 'BUTTON' && hasNestedControl(el)),
      ...mainControls.filter((el) => tagOf(el) !== 'BUTTON' && !hasNestedControl(el)),
      ...mainControls.filter((el) => tagOf(el) !== 'BUTTON' && hasNestedControl(el))
    ];
    const fileInputs = roots.flatMap((root) => [...root.querySelectorAll('input[type="file"]')]);
    const fileInput = fileInputs.find((input) => /video/i.test(input.getAttribute('accept') || '')) || fileInputs[0];
    const findNearFileInput = () => {
      if (!fileInput) return undefined;
      let ancestor = fileInput.parentElement;
      for (let depth = 0; ancestor && depth < 6 && ancestor !== ancestor.ownerDocument?.body && tagOf(ancestor) !== 'MAIN'; depth += 1, ancestor = ancestor.parentElement) {
        const inside = orderedControls.filter((item) => ancestor.contains(item));
        if (!inside.length) continue;
        const keywordMatch = inside.find((item) => /(?:chọn|select|choose|upload|tải|browse)/i.test(text(item)));
        if (keywordMatch) return keywordMatch;
        if (inside.length === 1 && depth < 4) return inside[0];
      }
      return undefined;
    };
    const control = orderedControls.find((item) => labels.includes(text(item)))
      || findNearFileInput()
      || orderedControls.find((item) => /(?:chọn|select|choose).{0,24}(?:video|tệp|file)/i.test(text(item)));
    if (!control) {
      const bodyText = normalize(document.body?.innerText || document.body?.textContent || '');
      if (/\\/login\\b/i.test(location.pathname || '') || (!fileInput && /(?:đăng nhập vào tiktok|log in to tiktok)/i.test(bodyText))) {
        return 'login-required';
      }
      return 'missing';
    }
    control.ownerDocument?.defaultView?.focus?.();
    control.scrollIntoView({ block: 'center', inline: 'center' });
    if (typeof control.tabIndex === 'number' && control.tabIndex < 0) control.setAttribute('tabindex', '0');
    control.focus({ preventScroll: true });
    const rootNode = control.getRootNode?.();
    const active = (rootNode && 'activeElement' in rootNode && rootNode.activeElement) || control.ownerDocument.activeElement;
    return active === control || control.contains(active) ? 'focused' : 'not-focused';
  })()`;
}

export function buildUploadStartedScript(videoPath: string) {
  const fileName = path.basename(videoPath).toLowerCase();
  return `(() => {
    const fileName = ${JSON.stringify(fileName)};
    const tagOf = (el) => String(el.tagName || '').toUpperCase();
    const roots = [];
    const visited = new Set();
    const collectRoots = (root) => {
      if (!root || visited.has(root)) return;
      visited.add(root);
      roots.push(root);
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collectRoots(el.shadowRoot);
        if (tagOf(el) === 'IFRAME') {
          try { if (el.contentDocument) collectRoots(el.contentDocument); } catch {}
        }
      }
    };
    collectRoots(document);
    const inputs = roots.flatMap((root) => [...root.querySelectorAll('input[type="file"]')]);
    const selected = inputs.some((input) => input.files && input.files.length > 0);
    const hasEditor = roots.some((root) => root.querySelector('textarea,[contenteditable="true"]') !== null);
    const pageText = roots
      .map((root) => String((root.body ? (root.body.innerText || root.body.textContent) : root.textContent) || ''))
      .join(' ')
      .toLowerCase();
    return selected || hasEditor || (fileName && pageText.includes(fileName)) ? 'selected' : 'waiting';
  })()`;
}

export class MacChromeTikTokAutomation implements TikTokAutomation {
  constructor(
    private readonly profiles = new ChromeProfileCatalog(),
    private readonly runner: TikTokCommandRunner = runCommand,
    private readonly chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ) {}

  listProfiles() {
    return this.profiles.list();
  }

  async openAccessibilitySettings() {
    await this.runner("/usr/bin/open", [
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    ], { timeoutMs: 10_000 });
  }

  private uploadUrl(jobId: string) {
    const url = new URL(TIKTOK_UPLOAD_URL);
    url.searchParams.set("cvs_upload_job", jobId);
    return url.toString();
  }

  private async openProfile(profileDirectory: string, jobId: string, signal?: AbortSignal) {
    await access(this.chromeExecutable);
    await this.profiles.require(profileDirectory);
    await this.runner("/usr/bin/open", [
      "-na",
      "Google Chrome",
      "--args",
      `--profile-directory=${profileDirectory}`,
      "--new-window",
      this.uploadUrl(jobId)
    ], { timeoutMs: 15_000, signal });
  }

  private tabScript(jobId: string, javascript: string) {
    const marker = escapeAppleScript(`cvs_upload_job=${jobId}`);
    const encodedMarker = escapeAppleScript(`cvs_upload_job%3D${jobId}`);
    const source = escapeAppleScript(javascript);
    return [
      'tell application "Google Chrome"',
      "repeat with browserWindow in windows",
      "repeat with tabNumber from 1 to (count of tabs of browserWindow)",
      "set browserTab to tab tabNumber of browserWindow",
      `if ((URL of browserTab contains "${marker}") or (URL of browserTab contains "${encodedMarker}")) then`,
      "set index of browserWindow to 1",
      "set active tab index of browserWindow to tabNumber",
      "activate",
      `return execute browserTab javascript "${source}"`,
      "end if",
      "end repeat",
      "end repeat",
      "end tell",
      'error "Không tìm thấy tab TikTok do COMMENT VIDEO STUDIO mở."'
    ];
  }

  private async osascript(lines: string[], options: CommandOptions = {}) {
    const args = lines.flatMap((line) => ["-e", line]);
    const result = await this.runner("/usr/bin/osascript", args, { timeoutMs: 20_000, ...options });
    return compactText(result.stdout);
  }

  private execute(jobId: string, javascript: string, signal?: AbortSignal) {
    return this.osascript(this.tabScript(jobId, javascript), { signal });
  }

  private async waitFor(
    jobId: string,
    javascript: string,
    expected: string,
    timeoutMs: number,
    signal?: AbortSignal,
    failOn?: { value: string; consecutive: number; message: string }
  ) {
    const started = Date.now();
    let last = "";
    let matchedFailureCount = 0;
    while (Date.now() - started < timeoutMs) {
      try {
        last = await this.execute(jobId, javascript, signal);
        if (last === expected) return;
        if (failOn && last === failOn.value) {
          matchedFailureCount += 1;
          if (matchedFailureCount >= failOn.consecutive) {
            throw new Error(failOn.message);
          }
        } else {
          matchedFailureCount = 0;
        }
      } catch (error) {
        if (failOn && error instanceof Error && error.message === failOn.message) {
          throw error;
        }
        last = error instanceof Error ? error.message : String(error);
        matchedFailureCount = 0;
        if (appleEventsDisabled(last)) {
          throw new Error("Chrome đang tắt ‘Cho phép JavaScript từ Apple Events’. Trong Chrome, chọn Xem > Nhà phát triển, bật mục này rồi thử lại.");
        }
      }
      await abortableDelay(1_500, signal);
    }
    throw new Error(`TikTok chưa sẵn sàng (${last || "không nhận được trạng thái"}). Tab được giữ mở để bạn kiểm tra.`);
  }

  private async accessibilityReady(signal?: AbortSignal) {
    try {
      return (await this.osascript([
        'tell application "System Events"',
        "if not UI elements enabled then return false",
        'tell process "Google Chrome" to return (count of windows) > 0',
        "end tell"
      ], { signal })) === "true";
    } catch {
      return false;
    }
  }

  async preflight(profileDirectory: string): Promise<TikTokPreflightResult> {
    const profile = await this.profiles.require(profileDirectory);
    const jobId = `check-${randomUUID()}`;
    await this.openProfile(profileDirectory, jobId);
    let appleEventsReady = false;
    try {
      await this.waitFor(jobId, "document.readyState === 'complete' ? 'ready' : 'loading'", "ready", 20_000);
      appleEventsReady = true;
    } catch {
      appleEventsReady = false;
    }
    const accessibilityReady = await this.accessibilityReady();
    const ready = appleEventsReady && accessibilityReady;
    return {
      profile,
      chromeOpened: true,
      appleEventsReady,
      accessibilityReady,
      message: ready
        ? "Chrome đã sẵn sàng. Hãy giữ hồ sơ này đăng nhập đúng tài khoản TikTok."
        : "Chrome đã mở nhưng còn thiếu quyền. Bật Chrome > Xem > Nhà phát triển > Cho phép JavaScript từ Apple Events và cấp quyền Trợ năng cho ứng dụng chạy tool."
    };
  }

  private async chooseVideoFile(jobId: string, videoPath: string, signal?: AbortSignal) {
    const loginErrorMessage = "Hồ sơ Chrome này chưa đăng nhập TikTok. Hãy đăng nhập TikTok trong tab đang mở rồi bấm Thử lại.";
    // TikTok Studio là SPA: readyState 'complete' xong vẫn mất vài giây mới vẽ nút, nên phải chờ thay vì thử một lần.
    await this.waitFor(jobId, buildChooseVideoScript(), "focused", 45_000, signal, {
      value: "login-required",
      consecutive: 4,
      message: loginErrorMessage
    }).catch((error) => {
      if (error instanceof Error && error.message === loginErrorMessage) throw error;
      throw new Error(`Không kích hoạt được nút Chọn video của TikTok. Kiểm tra hồ sơ Chrome đã đăng nhập TikTok và trang tải lên đã hiện nút Chọn video. Tab được giữ mở để bạn kiểm tra. Chi tiết: ${error instanceof Error ? error.message : String(error)}`);
    });

    const safePath = escapeAppleScript(videoPath);
    await this.osascript([
      "try",
      "set previousClipboard to the clipboard",
      "on error",
      'set previousClipboard to ""',
      "end try",
      `set the clipboard to "${safePath}"`,
      'tell application "Google Chrome" to activate',
      "delay 0.4",
      "try",
      'tell application "System Events"',
      // Phím Enter là thao tác người dùng thật; TikTok/Chrome chặn input.click() từ JavaScript.
      "key code 36",
      // Máy yếu có thể cần vài giây để Open Panel nhận bàn phím.
      "delay 2.5",
      'keystroke "g" using {command down, shift down}',
      "delay 1.5",
      // Dán một lần để đường dẫn dài không bị macOS làm rơi ký tự khi keystroke quá nhanh.
      'keystroke "v" using {command down}',
      "delay 0.8",
      "key code 36",
      "delay 2",
      "key code 36",
      "end tell",
      "on error errorMessage number errorNumber",
      "set the clipboard to previousClipboard",
      "error errorMessage number errorNumber",
      "end try",
      "set the clipboard to previousClipboard"
    ], { timeoutMs: 30_000, signal });
  }

  private uploadStartedScript(videoPath: string) {
    return buildUploadStartedScript(videoPath);
  }

  private captionEditorPrelude(videoPath: string) {
    const extension = path.extname(videoPath);
    const fileStem = path.basename(videoPath, extension).toLowerCase();
    return `
      const fileStem = ${JSON.stringify(fileStem)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const readValue = (el) => String(('value' in el ? el.value : el.innerText || el.textContent) || '');
      const candidates = [...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"],input:not([type="file"])')]
        .filter((el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      const score = (el) => {
        const r = el.getBoundingClientRect();
        const attributes = [el.getAttribute('placeholder'), el.getAttribute('aria-placeholder'), el.getAttribute('aria-label'), el.getAttribute('name')].join(' ');
        const nearby = [el.parentElement?.innerText, el.parentElement?.parentElement?.innerText].join(' ').slice(0, 800);
        const label = normalize(attributes + ' ' + nearby);
        const value = normalize(readValue(el));
        let result = Math.min(2000, (r.width * r.height) / 100);
        if (/chú thích|mô tả|caption|description/.test(label)) result += 10000;
        if (fileStem && value.includes(fileStem)) result += 20000;
        if (el.getAttribute('contenteditable') === 'true' || el.tagName === 'TEXTAREA') result += 1000;
        if (/vị trí|location|search|tìm kiếm/.test(label)) result -= 15000;
        return result;
      };
      const editor = candidates.sort((left, right) => score(right) - score(left))[0];`;
  }

  private editorReadyScript(videoPath: string) {
    return `(() => {${this.captionEditorPrelude(videoPath)}
      return editor ? 'ready' : 'waiting';
    })()`;
  }

  private focusCaptionScript(videoPath: string) {
    return `(() => {${this.captionEditorPrelude(videoPath)}
      if (!editor) return 'missing';
      editor.scrollIntoView({ block: 'center', inline: 'center' });
      editor.focus({ preventScroll: true });
      return document.activeElement === editor || editor.contains(document.activeElement) ? 'focused' : 'not-focused';
    })()`;
  }

  private captionMatchesScript(videoPath: string, caption: string, blurWhenMatched = false) {
    return `(() => {${this.captionEditorPrelude(videoPath)}
      const expectedCaption = ${JSON.stringify(caption)};
      if (!editor) return 'missing';
      const matched = normalize(readValue(editor)) === normalize(expectedCaption);
      if (matched && ${blurWhenMatched ? "true" : "false"}) editor.blur();
      return matched ? 'matched' : 'mismatch:' + readValue(editor).slice(0, 120);
    })()`;
  }

  private async replaceCaption(jobId: string, videoPath: string, caption: string, signal?: AbortSignal) {
    const focusResult = await this.execute(jobId, this.focusCaptionScript(videoPath), signal);
    if (focusResult !== "focused") {
      throw new Error(`Không focus được ô Chú thích TikTok (${focusResult || "không nhận được trạng thái"}). Video chưa bị đăng.`);
    }

    const safeCaption = escapeAppleScript(caption);
    const pasteCaption = caption ? ['keystroke "v" using {command down}', "delay 0.8"] : [];
    await this.osascript([
      "try",
      "set previousClipboard to the clipboard",
      "on error",
      'set previousClipboard to ""',
      "end try",
      `set the clipboard to "${safeCaption}"`,
      'tell application "Google Chrome" to activate',
      "delay 0.5",
      "try",
      'tell application "System Events"',
      'keystroke "a" using {command down}',
      "key code 51",
      ...pasteCaption,
      "end tell",
      "on error errorMessage number errorNumber",
      "set the clipboard to previousClipboard",
      "error errorMessage number errorNumber",
      "end try",
      "set the clipboard to previousClipboard"
    ], { timeoutMs: 20_000, signal });

    await this.waitFor(jobId, this.captionMatchesScript(videoPath, caption, true), "matched", 15_000, signal).catch((error) => {
      throw new Error(`TikTok chưa nhận đúng caption nên tool đã dừng trước khi đăng. Chi tiết: ${error instanceof Error ? error.message : String(error)}`);
    });
    // Đọc lại sau khi blur để chắc chắn TikTok đã lưu state, không chỉ đổi chữ trên DOM.
    await abortableDelay(1_500, signal);
    await this.waitFor(jobId, this.captionMatchesScript(videoPath, caption), "matched", 8_000, signal).catch((error) => {
      throw new Error(`Caption TikTok bị đổi lại sau khi nhập nên tool đã dừng trước khi đăng. Chi tiết: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private clickScheduleScript() {
    return `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const scheduleLabel = [...document.querySelectorAll('label,button,[role="radio"],span')].find((el) => visible(el) && /^(lên lịch|schedule)$/.test(normalize(el.textContent)));
      if (!scheduleLabel) return 'missing';
      scheduleLabel.click();
      return 'clicked';
    })()`;
  }

  private scheduleFieldsReadyScript() {
    return `(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const inputs = [...document.querySelectorAll('input')].filter(visible);
      const dateInput = inputs.find((input) => input.type === 'date' || /date|ngày/i.test(input.placeholder || input.getAttribute('aria-label') || ''));
      const timeInput = inputs.find((input) => input.type === 'time' || /time|giờ/i.test(input.placeholder || input.getAttribute('aria-label') || ''));
      return dateInput && timeInput ? 'ready' : 'waiting';
    })()`;
  }

  private setScheduleScript(scheduledAt: string) {
    const [date = "", time = ""] = scheduledAt.split("T");
    return `(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const setValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, value); else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const inputs = [...document.querySelectorAll('input')].filter(visible);
      const dateInput = inputs.find((input) => input.type === 'date' || /date|ngày/i.test(input.placeholder || input.getAttribute('aria-label') || ''));
      const timeInput = inputs.find((input) => input.type === 'time' || /time|giờ/i.test(input.placeholder || input.getAttribute('aria-label') || ''));
      if (!dateInput || !timeInput) return 'missing-fields';
      setValue(dateInput, ${JSON.stringify(date)});
      setValue(timeInput, ${JSON.stringify(time.slice(0, 5))});
      return 'set';
    })()`;
  }

  private copyrightCheckConfirmationScript() {
    return `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const copyrightIncomplete = (value) => /kiểm tra bản quyền chưa hoàn tất|kiểm tra bản quyền chưa xong|copyright check.{0,50}(?:not complete|incomplete|still in progress|hasn't finished)/i.test(normalize(value));
      const confirmLabels = ['đăng ngay', 'post now', 'continue posting', 'post anyway', 'lên lịch ngay', 'schedule now', 'continue scheduling'];
      const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
      const confirmation = buttons.find((button) => confirmLabels.includes(normalize(button.textContent)));
      if (confirmation) {
        let container = confirmation;
        for (let depth = 0; container && depth < 9; depth += 1, container = container.parentElement) {
          if (copyrightIncomplete(container.innerText || container.textContent)) {
            confirmation.click();
            return 'clicked';
          }
        }
      }
      const dialogs = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible);
      return dialogs.some((dialog) => copyrightIncomplete(dialog.innerText || dialog.textContent)) ? 'waiting' : 'absent';
    })()`;
  }

  private async confirmIncompleteCopyrightCheck(jobId: string, signal?: AbortSignal) {
    let absentChecks = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await this.execute(jobId, this.copyrightCheckConfirmationScript(), signal);
      if (result === "clicked") return true;
      if (result === "absent") {
        absentChecks += 1;
        if (absentChecks >= 3) return false;
      } else {
        absentChecks = 0;
      }
      await abortableDelay(750, signal);
    }
    throw new Error("TikTok đang báo kiểm tra bản quyền chưa hoàn tất nhưng chưa hiện nút ‘Đăng ngay’. Tab được giữ mở để bạn kiểm tra.");
  }

  private submitScript(mode: TikTokPublishingSettings["mode"]) {
    const expected = mode === "schedule" ? ["lên lịch", "schedule"] : ["đăng", "post"];
    return `(() => {
      const expected = ${JSON.stringify(expected)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const buttons = [...document.querySelectorAll('button')].filter((button) => visible(button) && !button.disabled);
      const button = buttons.find((candidate) => expected.includes(normalize(candidate.textContent)));
      if (!button) return 'missing';
      button.click();
      return 'clicked';
    })()`;
  }

  async publish(
    request: TikTokPublishRequest,
    onProgress: (stage: TikTokPublishStage, progress: number, message: string) => void,
    signal?: AbortSignal
  ) {
    const profileDirectory = request.settings.chromeProfileDirectory;
    if (!profileDirectory) throw new Error("Project chưa chọn hồ sơ Chrome để đăng TikTok.");
    const profile = await this.profiles.require(profileDirectory);
    if (request.settings.mode === "schedule" && !request.settings.scheduledAt) {
      throw new Error("Project chưa chọn ngày giờ lên lịch TikTok.");
    }
    await access(request.videoPath);

    onProgress("opening-chrome", 10, `Đang mở hồ sơ Chrome “${profile.name}”…`);
    await this.openProfile(profileDirectory, request.renderJobId, signal);
    if (!(await this.accessibilityReady(signal))) {
      throw new Error("Chưa có quyền Trợ năng để chọn file video. Hãy bật Terminal (ứng dụng chạy start.command) trong Cài đặt hệ thống > Quyền riêng tư & Bảo mật > Trợ năng, rồi bấm Thử lại.");
    }
    await this.waitFor(request.renderJobId, "document.readyState === 'complete' ? 'ready' : 'loading'", "ready", 45_000, signal).catch((error) => {
      throw new Error(`Không điều khiển được Chrome. Bật Xem > Nhà phát triển > Cho phép JavaScript từ Apple Events. Chi tiết: ${error instanceof Error ? error.message : String(error)}`);
    });

    onProgress("uploading", 28, "Đang chọn video vừa xuất và tải lên TikTok…");
    await this.chooseVideoFile(request.renderJobId, request.videoPath, signal);
    await this.waitFor(request.renderJobId, this.uploadStartedScript(request.videoPath), "selected", 45_000, signal).catch((error) => {
      throw new Error(`Chrome chưa chọn được file video. Hãy giữ tab TikTok ở phía trước và kiểm tra quyền Trợ năng cho ứng dụng chạy tool. Chi tiết: ${error instanceof Error ? error.message : String(error)}`);
    });
    await this.waitFor(request.renderJobId, this.editorReadyScript(request.videoPath), "ready", 8 * 60_000, signal);

    onProgress("configuring", 72, "Đang điền caption và thời điểm đăng…");
    await this.replaceCaption(request.renderJobId, request.videoPath, request.settings.caption, signal);
    if (request.settings.mode === "schedule") {
      const clickResult = await this.execute(request.renderJobId, this.clickScheduleScript(), signal);
      if (clickResult !== "clicked") throw new Error("Không tìm thấy lựa chọn Lên lịch trên TikTok. Tab được giữ mở và video không bị đăng.");
      await this.waitFor(request.renderJobId, this.scheduleFieldsReadyScript(), "ready", 20_000, signal);
      const scheduleResult = await this.execute(request.renderJobId, this.setScheduleScript(request.settings.scheduledAt!), signal);
      if (scheduleResult !== "set") {
        throw new Error(`Không cài được lịch đăng trên TikTok (${scheduleResult}). Tab được giữ mở và video không bị đăng.`);
      }
    }

    await this.waitFor(
      request.renderJobId,
      this.captionMatchesScript(request.videoPath, request.settings.caption),
      "matched",
      8_000,
      signal
    ).catch((error) => {
      throw new Error(`Caption chưa đúng nên tool không bấm đăng/lên lịch. Chi tiết: ${error instanceof Error ? error.message : String(error)}`);
    });
    onProgress("submitting", 92, request.settings.mode === "schedule" ? "Đang xác nhận lên lịch…" : "Đang xác nhận đăng video…");
    const submitResult = await this.execute(request.renderJobId, this.submitScript(request.settings.mode), signal);
    if (submitResult !== "clicked") throw new Error("TikTok chưa cho phép bấm nút đăng/lên lịch. Hãy kiểm tra cảnh báo trong tab TikTok; video chưa bị đăng.");
    const confirmedPendingCopyright = await this.confirmIncompleteCopyrightCheck(request.renderJobId, signal);
    if (confirmedPendingCopyright) {
      onProgress("submitting", 96, "Kiểm tra bản quyền chưa xong; đã xác nhận Đăng ngay theo lựa chọn của bạn…");
    }
    await abortableDelay(2_000, signal);
  }
}

type QueueEntry = {
  job: TikTokPublishJob;
  request: TikTokPublishRequest;
};

export class TikTokPublishQueue {
  private readonly jobs = new Map<string, QueueEntry>();
  private readonly pending: string[] = [];
  private active?: { jobId: string; controller: AbortController };

  constructor(private readonly automation: TikTokAutomation = new MacChromeTikTokAutomation()) {}

  listProfiles() {
    return this.automation.listProfiles();
  }

  preflight(profileDirectory: string) {
    return this.automation.preflight(profileDirectory);
  }

  openAccessibilitySettings() {
    return this.automation.openAccessibilitySettings();
  }

  list() {
    return [...this.jobs.values()].map((entry) => entry.job).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  enqueue(request: TikTokPublishRequest) {
    const profileName = request.settings.chromeProfileName || request.settings.chromeProfileDirectory || "Chưa chọn";
    const job: TikTokPublishJob = {
      id: randomUUID(),
      projectId: request.projectId,
      renderJobId: request.renderJobId,
      status: "queued",
      progress: 0,
      message: "Đang chờ mở Chrome",
      chromeProfileName: profileName,
      mode: request.settings.mode,
      scheduledAt: request.settings.scheduledAt,
      createdAt: new Date().toISOString()
    };
    this.jobs.set(job.id, { job, request });
    this.pending.push(job.id);
    void this.processNext();
    return job;
  }

  cancel(jobId: string) {
    const entry = this.require(jobId);
    if (entry.job.status === "queued") {
      const index = this.pending.indexOf(jobId);
      if (index >= 0) this.pending.splice(index, 1);
      entry.job.status = "cancelled";
      entry.job.message = "Đã hủy tác vụ đăng TikTok";
      entry.job.completedAt = new Date().toISOString();
    } else if (this.active?.jobId === jobId) {
      this.active.controller.abort();
    }
    return entry.job;
  }

  cancelProject(projectId: string) {
    return this.list()
      .filter((job) => job.projectId === projectId && !["completed", "failed", "cancelled"].includes(job.status))
      .map((job) => this.cancel(job.id));
  }

  retry(jobId: string) {
    const entry = this.require(jobId);
    if (entry.job.status !== "failed" && entry.job.status !== "cancelled") throw new Error("Chỉ có thể thử lại tác vụ TikTok lỗi hoặc đã hủy.");
    return this.enqueue(entry.request);
  }

  private require(jobId: string) {
    const entry = this.jobs.get(jobId);
    if (!entry) throw new Error("Không tìm thấy tác vụ đăng TikTok.");
    return entry;
  }

  private async processNext(): Promise<void> {
    if (this.active) return;
    const jobId = this.pending.shift();
    if (!jobId) return;
    const entry = this.require(jobId);
    const controller = new AbortController();
    this.active = { jobId, controller };
    entry.job.startedAt = new Date().toISOString();
    try {
      await this.automation.publish(entry.request, (stage, progress, message) => {
        entry.job.status = stage;
        entry.job.progress = progress;
        entry.job.message = message;
      }, controller.signal);
      entry.job.status = "completed";
      entry.job.progress = 100;
      entry.job.message = entry.job.mode === "schedule" ? "Đã gửi lệnh lên lịch TikTok" : "Đã gửi lệnh đăng TikTok";
    } catch (error) {
      entry.job.status = controller.signal.aborted ? "cancelled" : "failed";
      entry.job.error = error instanceof Error ? error.message : "Đăng TikTok thất bại.";
      entry.job.message = controller.signal.aborted ? "Đã hủy tác vụ đăng TikTok" : "Cần bạn kiểm tra tab TikTok";
    } finally {
      entry.job.completedAt = new Date().toISOString();
      this.active = undefined;
      void this.processNext();
    }
  }
}
