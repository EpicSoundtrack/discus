import { strict as assert } from 'assert';
import { test } from 'node:test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { loadConfig, DEFAULT_CONFIG } from '../config.js';

test('returns defaults when no config file exists', () => {
  const cfg = loadConfig(path.join(os.tmpdir(), 'nonexistent-dir-discus-test'));
  assert.equal(cfg.reviewFolder, DEFAULT_CONFIG.reviewFolder);
  assert.equal(cfg.openaiModel, 'gpt-4o-mini');
  assert.equal(cfg.batchSize, 1000);
});

test('merges saved config over defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discus-'));
  fs.writeFileSync(path.join(dir, 'discus.config.json'), JSON.stringify({ batchSize: 500 }));
  const cfg = loadConfig(dir);
  assert.equal(cfg.batchSize, 500);
  assert.equal(cfg.openaiModel, 'gpt-4o-mini'); // default preserved
  fs.rmSync(dir, { recursive: true });
});
