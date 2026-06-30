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

// Results panel state
const groups = [];
let wasted = 0;

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function formatDate(unixSecs) {
  return new Date(unixSecs * 1000).toLocaleDateString();
}

function renderGroup(group) {
  const card = document.createElement('div');
  card.className = 'group-card';

  const header = document.createElement('div');
  header.className = 'group-header';
  const badge = document.createElement('span');
  badge.className = 'badge ' + (group.group_type === 'exact' ? 'badge-exact' : 'badge-near');
  badge.textContent = group.group_type === 'exact' ? 'Exact Duplicate' : 'Near Duplicate (image)';
  header.appendChild(badge);
  card.appendChild(header);

  if (group.suggestion) {
    const sug = document.createElement('div');
    sug.className = 'suggestion';
    sug.textContent = '💡 ' + group.suggestion;
    card.appendChild(sug);
  }

  // Store file metadata keyed by path for size/mtime lookup
  const fileMeta = {};
  (group.fileMeta || []).forEach(f => { fileMeta[f.path] = f; });

  group.files.forEach((filePath, i) => {
    const row = document.createElement('div');
    row.className = 'file-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.path = filePath;
    // Mark all but the first file as "suggested to remove" for Select All Suggested
    cb.dataset.suggested = i > 0 ? '1' : '0';

    const meta = fileMeta[filePath] || {};
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = filePath.split('\\').pop() || filePath.split('/').pop() || filePath;

    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = meta.size != null ? humanSize(meta.size) : '';

    const pathEl = document.createElement('span');
    pathEl.className = 'file-path';
    pathEl.title = filePath;
    pathEl.textContent = filePath;

    const date = document.createElement('span');
    date.className = 'file-date';
    date.textContent = meta.mtime ? formatDate(meta.mtime) : '';

    row.appendChild(cb);
    row.appendChild(name);
    row.appendChild(size);
    row.appendChild(pathEl);
    row.appendChild(date);
    card.appendChild(row);
  });

  return card;
}

function updateSummary() {
  const summaryEl = document.getElementById('results-summary');
  const emptyEl = document.getElementById('results-empty');
  const bulkEl = document.getElementById('bulk-actions');

  if (groups.length === 0) {
    summaryEl.classList.add('hidden');
    emptyEl.style.display = '';
    bulkEl.classList.add('hidden');
    return;
  }

  summaryEl.classList.remove('hidden');
  emptyEl.style.display = 'none';
  bulkEl.classList.remove('hidden');
  document.getElementById('summary-groups').textContent = groups.length + ' duplicate group' + (groups.length !== 1 ? 's' : '') + ' found';
  document.getElementById('summary-wasted').textContent = humanSize(wasted) + ' wasted';
}

window.discus.onSidecarCrash(() => {
  const banner = document.getElementById('warning-banner');
  banner.textContent = '⚠ Sidecar process crashed. Restart the app to scan again.';
  banner.classList.remove('hidden');
});

window.discus.onSidecarMessage((msg) => {
  if (msg.type === 'group') {
    groups.push(msg);
    // Accumulate wasted space: all files in group except one (the "keep")
    const fileSizes = (msg.fileMeta || []).map(f => f.size || 0);
    if (fileSizes.length > 1) {
      const maxSize = Math.max(...fileSizes);
      wasted += fileSizes.reduce((s, x) => s + x, 0) - maxSize;
    }
    const list = document.getElementById('groups-list');
    list.appendChild(renderGroup(msg));
    updateSummary();

    // Switch to results tab if not already there
    if (!document.getElementById('panel-results').classList.contains('active')) {
      document.querySelector('.tab[data-panel="results"]').click();
    }
  } else if (msg.type === 'error') {
    const banner = document.getElementById('warning-banner');
    banner.textContent = '⚠ ' + msg.message;
    banner.classList.remove('hidden');
  }
});

// Select All Suggested
document.getElementById('select-suggested').addEventListener('click', () => {
  document.querySelectorAll('input[type=checkbox][data-suggested="1"]').forEach(cb => {
    cb.checked = true;
  });
});

// Move Selected to Review
document.getElementById('move-selected').addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('input[type=checkbox]:checked'));
  const paths = checked.map(cb => cb.dataset.path);
  if (paths.length === 0) return;

  const config = { reviewFolder: 'D:\\DiscusReview' }; // default; Task 14 will wire config
  try {
    await window.discus.moveFiles(paths, config.reviewFolder);
    // Remove moved rows from UI
    checked.forEach(cb => cb.closest('.file-row').remove());
    // Remove empty group cards
    document.querySelectorAll('.group-card').forEach(card => {
      const rows = card.querySelectorAll('.file-row');
      if (rows.length === 0) card.remove();
    });
  } catch (err) {
    alert('Move failed: ' + err.message);
  }
});

// Review Folder Panel
const REVIEW_FOLDER = 'D:\\DiscusReview';
const MANIFEST_PATH = REVIEW_FOLDER + '\\.discus-manifest.json';

function renderReviewList(entries) {
  const list = document.getElementById('review-list');
  const emptyEl = document.getElementById('review-empty');
  list.innerHTML = '';

  if (!entries || entries.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'review-row';

    const filename = document.createElement('span');
    filename.className = 'review-filename';
    const parts = entry.moved_path.split(/[\\/]/);
    filename.textContent = parts[parts.length - 1];

    const original = document.createElement('span');
    original.className = 'review-original';
    original.title = entry.original;
    original.textContent = entry.original;

    const date = document.createElement('span');
    date.className = 'review-date';
    date.textContent = new Date(entry.moved_at * 1000).toLocaleDateString();

    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      const result = await window.discus.restoreFile(entry.moved_path, MANIFEST_PATH);
      if (result && result.ok) {
        row.remove();
        const remaining = document.querySelectorAll('.review-row').length;
        if (remaining === 0) document.getElementById('review-empty').style.display = '';
      } else {
        alert('Restore failed: ' + (result?.error || 'Unknown error'));
      }
    });

    row.appendChild(filename);
    row.appendChild(original);
    row.appendChild(date);
    row.appendChild(restoreBtn);
    list.appendChild(row);
  });
}

async function loadReviewFiles() {
  try {
    const entries = await window.discus.getReviewFiles(REVIEW_FOLDER);
    renderReviewList(entries);
  } catch (err) {
    document.getElementById('review-empty').textContent = 'Error loading review folder: ' + err.message;
  }
}

document.getElementById('refresh-review').addEventListener('click', loadReviewFiles);

document.getElementById('empty-review').addEventListener('click', async () => {
  if (!confirm('Permanently delete all files in the review folder? This cannot be undone.')) return;
  try {
    await window.discus.emptyReviewFolder(REVIEW_FOLDER);
    renderReviewList([]);
  } catch (err) {
    alert('Failed to empty review folder: ' + err.message);
  }
});

// Load review files when switching to that panel
document.querySelector('.tab[data-panel="review"]').addEventListener('click', loadReviewFiles);
