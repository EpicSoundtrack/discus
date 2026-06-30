import { strict as assert } from 'assert';
import { test } from 'node:test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { slugEncode, buildManifestEntry, loadManifest, appendManifestEntry, removeManifestEntry } from '../manifest.js';

test('slugEncode: basic path', () => {
  const result = slugEncode('C:\\Users\\charles\\Downloads\\photo.jpg');
  assert.equal(result, 'C_Users_charles_Downloads__photo.jpg');
});

test('slugEncode: escapes __ in path components', () => {
  const result = slugEncode('C:\\my__folder\\file.txt');
  assert.equal(result, 'C_my_-_folder__file.txt');
});

test('slugEncode: truncates slug to keep filename under 255 chars', () => {
  const longPath = 'C:\\' + 'a'.repeat(300) + '\\file.txt';
  const result = slugEncode(longPath);
  assert.ok(result.length <= 255, `Expected <= 255 chars, got ${result.length}`);
  assert.ok(result.endsWith('__file.txt'));
});

test('loadManifest: returns empty array when file missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discus-'));
  const entries = loadManifest(path.join(dir, '.discus-manifest.json'));
  assert.deepEqual(entries, []);
  fs.rmSync(dir, { recursive: true });
});

test('appendManifestEntry: writes and re-reads entry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discus-'));
  const manifestPath = path.join(dir, '.discus-manifest.json');
  appendManifestEntry(manifestPath, {
    original: 'C:\\test\\file.txt',
    moved_path: dir + '\\file.txt',
    moved_at: 1700000000,
  });
  const entries = loadManifest(manifestPath);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].original, 'C:\\test\\file.txt');
  fs.rmSync(dir, { recursive: true });
});

test('removeManifestEntry: removes the correct entry by moved_path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discus-'));
  const manifestPath = path.join(dir, '.discus-manifest.json');
  appendManifestEntry(manifestPath, { original: 'C:\\a.txt', moved_path: dir + '\\a.txt', moved_at: 1700000001 });
  appendManifestEntry(manifestPath, { original: 'C:\\b.txt', moved_path: dir + '\\b.txt', moved_at: 1700000002 });
  removeManifestEntry(manifestPath, dir + '\\a.txt');
  const entries = loadManifest(manifestPath);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].moved_path, dir + '\\b.txt');
  fs.rmSync(dir, { recursive: true });
});

test('removeManifestEntry: leaves other entries intact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discus-'));
  const manifestPath = path.join(dir, '.discus-manifest.json');
  appendManifestEntry(manifestPath, { original: 'C:\\x.txt', moved_path: dir + '\\x.txt', moved_at: 1700000003 });
  appendManifestEntry(manifestPath, { original: 'C:\\y.txt', moved_path: dir + '\\y.txt', moved_at: 1700000004 });
  appendManifestEntry(manifestPath, { original: 'C:\\z.txt', moved_path: dir + '\\z.txt', moved_at: 1700000005 });
  removeManifestEntry(manifestPath, dir + '\\y.txt');
  const entries = loadManifest(manifestPath);
  assert.equal(entries.length, 2);
  assert.ok(entries.some(e => e.moved_path === dir + '\\x.txt'));
  assert.ok(entries.some(e => e.moved_path === dir + '\\z.txt'));
  fs.rmSync(dir, { recursive: true });
});

test('buildManifestEntry: original equals input originalPath', () => {
  const reviewFolder = os.tmpdir();
  const originalPath = 'C:\\Users\\charles\\photo.jpg';
  const entry = buildManifestEntry(originalPath, reviewFolder);
  assert.equal(entry.original, originalPath);
});

test('buildManifestEntry: moved_path is absolute path under reviewFolder', () => {
  const reviewFolder = os.tmpdir();
  const entry = buildManifestEntry('C:\\some\\file.txt', reviewFolder);
  assert.ok(path.isAbsolute(entry.moved_path), 'moved_path should be absolute');
  assert.ok(entry.moved_path.startsWith(reviewFolder), `moved_path should start with reviewFolder: ${entry.moved_path}`);
});

test('buildManifestEntry: moved_at is a recent integer unix timestamp', () => {
  const reviewFolder = os.tmpdir();
  const entry = buildManifestEntry('C:\\some\\file.txt', reviewFolder);
  assert.ok(Number.isInteger(entry.moved_at), 'moved_at should be an integer');
  assert.ok(entry.moved_at > 1700000000, `moved_at should be > 1700000000, got ${entry.moved_at}`);
});
