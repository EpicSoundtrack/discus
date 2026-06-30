// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    tab.classList.add('active');
    const panel = document.getElementById('panel-' + tab.dataset.panel);
    panel.style.display = 'block';
    panel.classList.add('active');
  });
});

// GPU status
window.discus.onGpuStatus((mode) => {
  const badge = document.getElementById('gpu-badge');
  if (mode === 'gpu') {
    badge.textContent = '⬡ Warp GPU Active';
    badge.classList.add('active');
  } else {
    badge.textContent = 'CPU Mode';
    badge.classList.remove('active');
  }
});

// Warning banner
window.discus.onShowWarning((msg) => {
  const banner = document.getElementById('warning-banner');
  banner.textContent = '⚠ ' + msg;
  banner.classList.remove('hidden');
});

// Populate drives
window.discus.getDrives().then(drives => {
  const sel = document.getElementById('drive-select');
  drives.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    sel.appendChild(opt);
  });
});

// Scan state
let scanStartTime = null;
let elapsedTimer = null;
let estimatedTotal = 0;

window.discus.onScanEstimate((n) => {
  estimatedTotal = n;
});

window.discus.onScanProgress(({ filesScanned, currentPath }) => {
  const progressEl = document.getElementById('scan-progress');
  const progressText = document.getElementById('progress-text');
  const currentPathEl = document.getElementById('current-path');

  if (estimatedTotal > 0) {
    progressEl.value = Math.min(filesScanned / estimatedTotal * 100, 99);
  }
  progressText.textContent = `${filesScanned.toLocaleString()} / ~${estimatedTotal.toLocaleString()} files`;
  currentPathEl.textContent = currentPath;
});

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

document.getElementById('start-scan').addEventListener('click', async () => {
  const btn = document.getElementById('start-scan');
  const drive = document.getElementById('drive-select').value;
  if (!drive) return;

  btn.disabled = true;
  btn.textContent = 'Scanning…';
  document.getElementById('progress-area').style.display = 'flex';
  estimatedTotal = 0;
  scanStartTime = Date.now();

  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    document.getElementById('elapsed-time').textContent = formatElapsed(Date.now() - scanStartTime);
  }, 1000);

  try {
    await window.discus.startScan(drive, { batchSize: 1000 });
  } finally {
    clearInterval(elapsedTimer);
    btn.disabled = false;
    btn.textContent = 'Start Scan';
    document.getElementById('scan-progress').value = 100;
    document.getElementById('current-path').textContent = 'Scan complete';
  }
});
