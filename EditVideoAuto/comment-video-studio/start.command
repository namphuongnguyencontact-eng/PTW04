#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

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

if [[ -z "$NODE_BIN" ]]; then
  print "Không tìm thấy Node.js 22–25. Hãy chạy setup.sh trước."
  read -k 1 "?Nhấn phím bất kỳ để đóng…"
  exit 1
fi

if [[ ! -f backend/bundle/server.cjs || ! -f frontend/dist/index.html ]]; then
  print "Ứng dụng chưa được build. Hãy chạy setup.sh trước."
  read -k 1 "?Nhấn phím bất kỳ để đóng…"
  exit 1
fi

export HOST="127.0.0.1"
export PORT="43123"
export CVS_PROJECT_ROOT="$PROJECT_DIR"
mkdir -p data

if curl -fsS "http://$HOST:$PORT/api/health" >/dev/null 2>&1; then
  open "http://$HOST:$PORT"
  exit 0
fi

"$NODE_BIN" backend/bundle/server.cjs >> data/app.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM EXIT

print "Đang nạp ứng dụng; lần đầu sau khi build có thể mất tới vài phút…"
for attempt in {1..1200}; do
  if curl -fsS "http://$HOST:$PORT/api/health" >/dev/null 2>&1; then
    open "http://$HOST:$PORT"
    print "COMMENT VIDEO STUDIO đang chạy tại http://$HOST:$PORT"
    print "Giữ cửa sổ này mở trong khi sử dụng. Nhấn Control+C để dừng."
    wait "$SERVER_PID"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    print "Ứng dụng không khởi động được. Xem lỗi tại data/app.log"
    read -k 1 "?Nhấn phím bất kỳ để đóng…"
    exit 1
  fi
  sleep 0.25
done

print "Ứng dụng khởi động quá thời gian chờ. Xem lỗi tại data/app.log"
exit 1
