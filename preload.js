const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('discus', {
  startScan: (rootDir, config) => ipcRenderer.invoke('start-scan', { rootDir, config }),
  getDrives: () => ipcRenderer.invoke('get-drives'),
  moveFiles: (files, reviewFolder) => ipcRenderer.invoke('move-files', { files, reviewFolder }),
  getReviewFiles: (reviewFolder) => ipcRenderer.invoke('get-review-files', { reviewFolder }),
  restoreFile: (movedPath, manifestPath) => ipcRenderer.invoke('restore-file', { movedPath, manifestPath }),
  emptyReviewFolder: (reviewFolder) => ipcRenderer.invoke('empty-review-folder', { reviewFolder }),
  onSidecarMessage: (cb) => ipcRenderer.on('sidecar-message', (_, msg) => cb(msg)),
  onScanProgress: (cb) => ipcRenderer.on('scan-progress', (_, data) => cb(data)),
  onScanEstimate: (cb) => ipcRenderer.on('scan-estimate', (_, n) => cb(n)),
  onSidecarCrash: (cb) => ipcRenderer.on('sidecar-crash', () => cb()),
  onGpuStatus: (cb) => ipcRenderer.on('gpu-status', (_, mode) => cb(mode)),
  onShowWarning: (cb) => ipcRenderer.on('show-warning', (_, msg) => cb(msg)),
});
