import { strict as assert } from 'assert';
import { test } from 'node:test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { slugEncode, buildManifestEntry, loadManifest, appendManifestEntry } from '../manifest.js';

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
