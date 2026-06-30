import fs from 'fs';
import path from 'path';

export const DEFAULT_CONFIG = {
  reviewFolder: 'D:\\DiscusReview',
  openaiModel: 'gpt-4o-mini',
  batchSize: 1000,
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
