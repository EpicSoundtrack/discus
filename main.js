import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { scanDrive } from './scanner.js';
import { buildManifestEntry, loadManifest, appendManifestEntry, removeManifestEntry } from './manifest.js';
import { loadConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let win = null;
let sidecar = null;
let pipeConn = null;
let pipeBuf = '';

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('renderer/index.html');
}

function startSidecar() {
  sidecar = spawn('python', ['-m', 'sidecar.main'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  let ready = false;
  sidecar.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    if (!ready && lines.some(l => l.trim() === 'DISCUS_READY')) {
      ready = true;
      connectPipe(Date.now());
    }
  });

  sidecar.on('exit', (code) => {
    if (code !== 0 && win && !win.isDestroyed()) {
      win.webContents.send('sidecar-crash');
    }
  });
}

function connectPipe(startTime, delay = 200) {
  const conn = net.createConnection({ path: '\\\\.\\pipe\\discus' });

  conn.on('connect', () => {
    pipeConn = conn;
  });

  conn.on('data', (data) => {
    pipeBuf += data.toString('utf8');
    let idx;
    while ((idx = pipeBuf.indexOf('\n')) !== -1) {
      const line = pipeBuf.slice(0, idx).trim();
      pipeBuf = pipeBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'gpu_status') {
          win?.webContents.send('gpu-status', msg.mode);
        } else if (msg.type === 'progress') {
          win?.webContents.send('sidecar-progress', msg);
        } else {
          win?.webContents.send('sidecar-message', msg);
        }
      } catch { /* ignore malformed lines */ }
    }
  });

  conn.on('error', () => {
    const elapsed = Date.now() - startTime;
    if (elapsed + delay < 10000) {
      setTimeout(() => connectPipe(startTime, Math.min(delay * 2, 2000)), delay);
    }
    // else: give up silently after 10s
  });
}

function sendToSidecar(msg) {
  if (pipeConn) {
    pipeConn.write(JSON.stringify(msg) + '\n');
  }
}

function getWindowsDrives() {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const drive = String.fromCharCode(i) + ':\\';
    try {
      fs.accessSync(drive);
      drives.push(drive);
    } catch {}
  }
  return drives;
}

app.whenReady().then(() => {
  createWindow();
  startSidecar();

  ipcMain.handle('get-drives', () => getWindowsDrives());

  ipcMain.handle('start-scan', async (_, { rootDir, config }) => {
    await scanDrive(rootDir, {
      batchSize: config.batchSize || 1000,
      minFileSize: config.minFileSize || 0,
      ignorePaths: config.ignorePaths || [],
      onBatch: (files) => sendToSidecar({ type: 'batch', files }),
      onProgress: (data) => win?.webContents.send('scan-progress', data),
      onEstimate: (n) => win?.webContents.send('scan-estimate', n),
      onDone: () => sendToSidecar({ type: 'done' }),
    });
  });

  ipcMain.handle('move-files', async (_, { files, reviewFolder }) => {
    fs.mkdirSync(reviewFolder, { recursive: true });
    const manifestPath = path.join(reviewFolder, '.discus-manifest.json');
    for (const filePath of files) {
      const entry = buildManifestEntry(filePath, reviewFolder);
      fs.renameSync(filePath, entry.moved_path);
      appendManifestEntry(manifestPath, entry);
    }
  });

  ipcMain.handle('get-review-files', (_, { reviewFolder }) => {
    const manifestPath = path.join(reviewFolder, '.discus-manifest.json');
    return loadManifest(manifestPath);
  });

  ipcMain.handle('restore-file', (_, { movedPath, manifestPath }) => {
    const entries = loadManifest(manifestPath);
    const entry = entries.find(e => e.moved_path === movedPath);
    if (!entry) return { ok: false, error: 'Entry not found in manifest' };

    try {
      const origStat = fs.statSync(entry.original);
      const movedStat = fs.statSync(movedPath);
      if (origStat.size !== movedStat.size) {
        return { ok: false, error: 'A different file now exists at the original location. Move manually.' };
      }
    } catch (err) {
      if (err.code !== 'ENOENT') return { ok: false, error: err.message };
      // original path doesn't exist — safe to restore
    }

  try {
    fs.mkdirSync(path.dirname(entry.original), { recursive: true });
    fs.renameSync(movedPath, entry.original);
    removeManifestEntry(manifestPath, movedPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
  });

  ipcMain.handle('empty-review-folder', (_, { reviewFolder }) => {
    const manifestPath = path.join(reviewFolder, '.discus-manifest.json');
    const entries = loadManifest(manifestPath);
    for (const entry of entries) {
      try { fs.unlinkSync(entry.moved_path); } catch {}
    }
    try { fs.unlinkSync(manifestPath); } catch {}
  });
});

app.on('before-quit', (e) => {
  if (pipeConn) {
    e.preventDefault();
    sendToSidecar({ type: 'shutdown' });
    setTimeout(() => {
      if (sidecar) sidecar.kill();
      app.exit(0);
    }, 2000);
    pipeConn = null; // prevent re-entry
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
