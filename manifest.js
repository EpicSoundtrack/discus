import fs from 'fs';
import path from 'path';

export function slugEncode(absolutePath) {
  const ext = path.extname(absolutePath);
  const base = path.basename(absolutePath);
  const dir = path.dirname(absolutePath);
  // Strip drive colon: "C:\Users\..." -> "C\Users\..."
  const noDrive = dir.replace(/^([A-Za-z]):/, '$1');
  // Escape existing __ in path components
  const escaped = noDrive.replace(/__/g, '_-_');
  // Replace all backslashes with underscores
  const slug = escaped.replace(/\\/g, '_');
  const desired = `${slug}__${base}`;
  if (desired.length <= 255) return desired;
  // Truncate slug prefix to fit, preserving __<base>
  const suffix = `__${base}`;
  const maxSlug = 255 - suffix.length;
  return slug.slice(0, maxSlug) + suffix;
}

export function buildManifestEntry(originalPath, reviewFolder) {
  const slugName = slugEncode(originalPath);
  return {
    original: originalPath,
    moved_path: path.join(reviewFolder, slugName),
    moved_at: Math.floor(Date.now() / 1000),
  };
}

export function loadManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
}

export function appendManifestEntry(manifestPath, entry) {
  const entries = loadManifest(manifestPath);
  entries.push(entry);
  fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2));
}

export function removeManifestEntry(manifestPath, movedPath) {
  const entries = loadManifest(manifestPath);
  const filtered = entries.filter(e => e.moved_path !== movedPath);
  fs.writeFileSync(manifestPath, JSON.stringify(filtered, null, 2));
}
