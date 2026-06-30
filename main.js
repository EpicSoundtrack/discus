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
      preload: path.join(__dirname, 'preload.js'),
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
    const text = data.toString();
    if (!ready && text.includes('DISCUS_READY')) {
      ready = true;
      connectPipe();
    }
  });

  sidecar.on('exit', () => {
    if (win) win.webContents.send('sidecar-crash');
  });
}

function connectPipe(attempt = 0) {
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
        } else {
          win?.webContents.send('sidecar-message', msg);
        }
      } catch {}
    }
  });

  conn.on('error', () => {
    if (attempt < 10) {
      setTimeout(() => connectPipe(attempt + 1), 1000);
    }
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
      if (origStat.size !== movedStat.size || Math.floor(origStat.mtimeMs / 1000) !== entry.moved_at) {
        return { ok: false, error: 'A different file now exists at the original location. Move manually.' };
      }
    } catch (err) {
      if (err.code !== 'ENOENT') return { ok: false, error: err.message };
      // original path doesn't exist — safe to restore
    }

    fs.mkdirSync(path.dirname(entry.original), { recursive: true });
    fs.renameSync(movedPath, entry.original);
    removeManifestEntry(manifestPath, movedPath);
    return { ok: true };
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
    sendToSidecar({ type: 'shutdown' });
  }
  setTimeout(() => {
    if (sidecar) sidecar.kill();
  }, 2000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
