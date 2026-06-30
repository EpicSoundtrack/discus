import fs from 'fs';
import path from 'path';

export const DEFAULT_CONFIG = {
  reviewFolder: 'D:\\DiscusReview',
  openaiModel: 'gpt-4o-mini',
  batchSize: 1000,
  minFileSize: 100 * 1024,  // 100 KB — files smaller than this are skipped
  ignorePaths: [
    'Windows',
    'Program Files',
    'Program Files (x86)',
    'node_modules',
    'cmder',
    '$Recycle.Bin',
    'AppData\\Local\\Temp',
    'AppData\\Roaming\\npm',
    '.git',
  ],
};

export function loadConfig(userDataDir) {
  const configPath = path.join(userDataDir, 'discus.config.json');
  try {
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULT_CONFIG, ...saved };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
