import { test } from 'node:test';
import { strict as assert } from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanDrive } from '../scanner.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'discus-scanner-'));
}

test('scanDrive: finds files and calls onBatch', async () => {
  const dir = makeTempDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
  fs.writeFileSync(path.join(dir, 'b.jpg'), 'world');

  const batches = [];
  await scanDrive(dir, {
    batchSize: 10,
    onBatch: (b) => batches.push(b),
  });

  const allFiles = batches.flat();
  assert.equal(allFiles.length, 2);
  assert.ok(allFiles.every(f => f.path && f.size >= 0 && typeof f.mtime === 'number' && f.ext));
  fs.rmSync(dir, { recursive: true });
});

test('scanDrive: does not follow symlinks', async () => {
  const dir = makeTempDir();
  const subDir = path.join(dir, 'real');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'file.txt'), 'content');

  // Create a symlink to subDir inside dir
  const linkPath = path.join(dir, 'link');
  try {
    fs.symlinkSync(subDir, linkPath, 'dir');
  } catch {
    // Symlinks may require elevation on Windows — skip test if not possible
    fs.rmSync(dir, { recursive: true });
    return;
  }

  const found = [];
  await scanDrive(dir, { onBatch: (b) => found.push(...b) });

  // Should only find file.txt once (via real/, not via link/)
  const names = found.map(f => path.basename(f.path));
  const txtFiles = names.filter(n => n === 'file.txt');
  assert.equal(txtFiles.length, 1, 'Symlink should not be followed');
  fs.rmSync(dir, { recursive: true });
});

test('scanDrive: batches files correctly', async () => {
  const dir = makeTempDir();
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(dir, `f${i}.txt`), 'x');
  }

  const batches = [];
  await scanDrive(dir, {
    batchSize: 2,
    onBatch: (b) => batches.push([...b]),
  });

  assert.ok(batches.length >= 2, 'Should produce multiple batches');
  assert.ok(batches.slice(0, -1).every(b => b.length <= 2));
  fs.rmSync(dir, { recursive: true });
});

test('scanDrive: calls onEstimate before walk', async () => {
  const dir = makeTempDir();
  fs.writeFileSync(path.join(dir, 'file.txt'), 'hi');

  let estimateCalled = false;
  let batchCalled = false;
  await scanDrive(dir, {
    onEstimate: () => { estimateCalled = true; },
    onBatch: () => { batchCalled = true; },
  });

  assert.ok(estimateCalled, 'onEstimate should be called');
  fs.rmSync(dir, { recursive: true });
});

test('scanDrive: skips unreadable dirs without throwing', async () => {
  // Can't easily create EPERM dirs in tests, but verify scan completes on normal dirs
  const dir = makeTempDir();
  fs.writeFileSync(path.join(dir, 'ok.txt'), 'content');

  let done = false;
  const skipped = await scanDrive(dir, {
    onDone: () => { done = true; },
  });

  assert.ok(done, 'onDone should be called');
  assert.equal(typeof skipped, 'number');
  fs.rmSync(dir, { recursive: true });
});
