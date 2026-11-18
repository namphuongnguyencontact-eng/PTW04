const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

// Prevent GPU disk cache lock errors on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Custom user data directory to prevent conflicts
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'masterthreads-desktop'));
} catch {}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

let mainWindow = null;

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Helper to find the active Next.js port
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function getActiveServerUrl() {
  if (process.env.ELECTRON_START_URL) {
    return process.env.ELECTRON_START_URL;
  }
  // Check common Next.js dev ports
  const candidatePorts = [3000, 3001, 3002];
  for (const port of candidatePorts) {
    const isUp = await checkPort(port);
    if (isUp) {
      return `http://localhost:${port}`;
    }
  }
  return 'http://localhost:3000';
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MasterThreads - Threads Affiliate & Intelligence Platform',
    backgroundColor: '#FEFAF3',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Hide default menu bar for modern clean UI
  mainWindow.setMenuBarVisibility(false);

  const startUrl = await getActiveServerUrl();
  console.log(`[Electron] Loading MasterThreads from: ${startUrl}`);

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links (Threads, Shopee, external websites) in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
