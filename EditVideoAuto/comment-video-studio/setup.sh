#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

print_error() {
  print -u2 "LỖI: $1"
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || print_error "Ứng dụng hiện chỉ hỗ trợ macOS."
[[ "$(uname -m)" == "arm64" ]] || print "Cảnh báo: cấu hình được tối ưu cho Mac Apple Silicon."

command -v ffmpeg >/dev/null 2>&1 || print_error "Chưa có FFmpeg. Hãy cài FFmpeg rồi chạy lại setup.sh."
command -v ffprobe >/dev/null 2>&1 || print_error "Chưa có FFprobe. Hãy cài FFmpeg rồi chạy lại setup.sh."
command -v python3 >/dev/null 2>&1 || print_error "Chưa có Python 3."
xcrun --find clang >/dev/null 2>&1 || print_error "Thiếu Apple Command Line Tools để dùng OCR local. Hãy chạy xcode-select --install rồi chạy lại setup.sh."

NODE_BIN=""
for candidate in /usr/local/bin/node /opt/homebrew/bin/node "$(command -v node 2>/dev/null || true)"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    major="$($candidate -p 'Number(process.versions.node.split(".")[0])')"
    if (( major >= 22 && major < 26 )); then
      NODE_BIN="$candidate"
      break
    fi
  fi
done
[[ -n "$NODE_BIN" ]] || print_error "Cần Node.js phiên bản 22, 23, 24 hoặc 25."

NPM_BIN="${NODE_BIN:h}/npm"
[[ -x "$NPM_BIN" ]] || NPM_BIN="$(command -v npm 2>/dev/null || true)"
[[ -n "$NPM_BIN" ]] || print_error "Không tìm thấy npm."

print "[1/4] Cài dependency Node.js…"
PATH="${NODE_BIN:h}:$PATH" "$NPM_BIN" ci

print "[2/4] Tạo môi trường Python riêng cho Edge TTS…"
python3 -m venv .venv
.venv/bin/python -m pip install -r tts-providers/requirements.txt

print "[3/4] Chạy test…"
PATH="${NODE_BIN:h}:$PATH" "$NPM_BIN" test

print "[4/4] Build ứng dụng production…"
PATH="${NODE_BIN:h}:$PATH" "$NPM_BIN" run build

chmod +x start.command
print ""
print "Cài đặt hoàn tất. Từ lần sau, chỉ cần nhấp đúp start.command."
