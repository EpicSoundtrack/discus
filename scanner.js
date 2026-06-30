import fs from 'fs';
import path from 'path';

const MAX_CONCURRENCY = 16;

async function estimateTotal(rootDir) {
  let dirCount = 0;
  let fileCount = 0;
  let sampled = 0;
  const queue = [rootDir];

  while (queue.length > 0 && sampled < 1000) {
    const dir = queue.shift();
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      dirCount++;
      sampled++;
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) queue.push(path.join(dir, e.name));
        else fileCount++;
      }
    } catch {
      // skip unreadable dirs
    }
  }

  if (dirCount === 0) return 0;
  const avgFilesPerDir = fileCount / dirCount;
  // Rough total dir estimate: sampled + remaining queue
  const estimatedDirs = sampled + queue.length;
  return Math.round(avgFilesPerDir * estimatedDirs);
}

export async function scanDrive(rootDir, { batchSize = 1000, onBatch, onProgress, onEstimate, onDone, minFileSize = 0, ignorePaths = [] } = {}) {
  // Estimate first
  const estimated = await estimateTotal(rootDir);
  if (onEstimate) onEstimate(estimated);

  let batch = [];
  let filesScanned = 0;
  let skipped = 0;

  const queue = [rootDir];
  let active = 0;

  async function processDir(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        skipped++;
        return;
      }
      throw err;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        const skip = ignorePaths.some(p =>
          entry.name.toLowerCase().includes(p.toLowerCase())
        );
        if (!skip) queue.push(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const filePath = path.join(dir, entry.name);
        try {
          const stat = await fs.promises.stat(filePath);
          if (stat.size < minFileSize) continue;
          batch.push({
            path: filePath,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs / 1000),
            ext: path.extname(entry.name).toLowerCase(),
          });
          filesScanned++;
          if (onProgress) onProgress({ filesScanned, currentPath: filePath });

          if (batch.length >= batchSize) {
            const toSend = batch;
            batch = [];
            if (onBatch) await onBatch(toSend);
          }
        } catch (err) {
          if (err.code === 'ENOENT') {
            // file disappeared between readdir and stat — skip silently
          } else if (err.code === 'EPERM' || err.code === 'EACCES') {
            skipped++;
          } else {
            throw err;
          }
        }
      }
    }
  }

  // Concurrency-controlled walk
  await new Promise((resolve) => {
    function tick() {
      while (active < MAX_CONCURRENCY && queue.length > 0) {
        const dir = queue.shift();
        active++;
        processDir(dir).finally(() => {
          active--;
          tick();
          if (active === 0 && queue.length === 0) resolve();
        });
      }
    }
    tick();
    if (active === 0) resolve(); // empty root
  });

  // Flush remaining batch
  if (batch.length > 0 && onBatch) {
    await onBatch(batch);
  }

  if (onDone) onDone();
  return skipped;
}
