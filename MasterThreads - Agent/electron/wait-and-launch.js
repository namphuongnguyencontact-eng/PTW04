const { spawn } = require('child_process');
const http = require('http');

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer() {
  console.log('[Electron Launcher] Đang chờ Next.js khởi động...');
  const maxAttempts = 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    for (const port of [3000, 3001, 3002]) {
      const url = `http://localhost:${port}`;
      const isReady = await checkUrl(url);
      if (isReady) {
        console.log(`[Electron Launcher] Next.js đã sẵn sàng tại ${url}! Đang mở cửa sổ Electron...`);
        
        // Spawn Electron
        const electronBin = require('electron');
        const child = spawn(electronBin, ['.'], {
          stdio: 'inherit',
          env: {
            ...process.env,
            ELECTRON_START_URL: url,
          },
        });

        child.on('exit', (code) => {
          process.exit(code || 0);
        });

        return;
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  console.error('[Electron Launcher] Hết thời gian chờ Next.js khởi động (timeout 36s).');
  process.exit(1);
}

waitForServer();
