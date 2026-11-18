const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function checkServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function findRunningServer() {
  for (const port of [3000, 3001, 3002]) {
    if (await checkServer(port)) {
      return `http://localhost:${port}`;
    }
  }
  return null;
}

async function start() {
  console.log('====================================================');
  console.log('🚀 MASTERTHREADS DESKTOP LAUNCHER');
  console.log('====================================================');

  let activeUrl = await findRunningServer();
  let nextProcess = null;

  if (activeUrl) {
    console.log(`✓ Phát hiện máy chủ Next.js đang chạy sẵn tại: ${activeUrl}`);
  } else {
    console.log('⚙️ Đang khởi chạy máy chủ Next.js...');
    nextProcess = spawn('npx', ['next', 'dev'], {
      cwd: path.resolve(__dirname, '..'),
      shell: true,
      stdio: 'inherit',
    });

    nextProcess.on('error', (err) => {
      console.error('Lỗi khởi động Next.js:', err.message);
    });

    // Wait for Next.js to be ready
    console.log('⏳ Đang chờ máy chủ Next.js sẵn sàng...');
    let attempts = 0;
    while (attempts < 60) {
      attempts++;
      activeUrl = await findRunningServer();
      if (activeUrl) break;
      await new Promise((r) => setTimeout(r, 600));
    }

    if (!activeUrl) {
      console.error('❌ Hết thời gian chờ máy chủ Next.js. Vui lòng thử lại.');
      if (nextProcess) nextProcess.kill();
      process.exit(1);
    }
    console.log(`✓ Máy chủ Next.js đã sẵn sàng tại: ${activeUrl}`);
  }

  console.log('🖥️ Đang mở cửa sổ ứng dụng Desktop Electron...');
  const electronBin = require('electron');
  const electronProcess = spawn(electronBin, [path.resolve(__dirname, 'main.js')], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_START_URL: activeUrl,
    },
  });

  electronProcess.on('exit', (code) => {
    console.log('Đã đóng cửa sổ Electron Desktop.');
    if (nextProcess) {
      nextProcess.kill();
    }
    process.exit(code || 0);
  });
}

start().catch((err) => {
  console.error('Lỗi launcher:', err);
  process.exit(1);
});
