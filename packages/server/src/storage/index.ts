import { mkdir, readdir, readFile, writeFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ExtractedNode } from '@sigma/shared';

export interface StoredComponent {
  id: string;
  name: string;
  data: ExtractedNode;
  createdAt: string;
  updatedAt: string;
}

const BASE_DIR = join(homedir(), '.sigma');
const EXTRACTED_DIR = join(BASE_DIR, 'extracted');
const SCREENSHOTS_DIR = join(BASE_DIR, 'screenshots');
const MAX_COMPONENTS = 100;

// Cleanup thresholds
const TTL_DAYS = 7;
const STARTUP_SIZE_THRESHOLD = 100 * 1024 * 1024; // 100MB
const STARTUP_SIZE_TARGET = 50 * 1024 * 1024;      // 50MB

// Ensure directory exists
async function ensureDir(dir: string = EXTRACTED_DIR) {
  await mkdir(dir, { recursive: true });
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Sanitize filename
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// === Auto Cleanup ===

interface FileInfo {
  file: string;
  filepath: string;
  size: number;
  mtime: Date;
}

// Get file info list for a directory
async function getFileInfoList(dir: string): Promise<FileInfo[]> {
  try {
    await ensureDir(dir);
    const files = await readdir(dir);
    const infos: FileInfo[] = [];

    for (const file of files) {
      try {
        const filepath = join(dir, file);
        const stats = await stat(filepath);
        if (stats.isFile()) {
          infos.push({
            file,
            filepath,
            size: stats.size,
            mtime: stats.mtime,
          });
        }
      } catch {
        // Skip inaccessible files
      }
    }

    return infos;
  } catch {
    return [];
  }
}

// Delete files older than TTL days (fire-and-forget)
async function cleanupExpiredFiles(dir: string): Promise<{ deleted: number; freedBytes: number }> {
  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000);
  const files = await getFileInfoList(dir);
  let deleted = 0;
  let freedBytes = 0;

  for (const info of files) {
    if (info.mtime < cutoff) {
      try {
        await unlink(info.filepath);
        deleted++;
        freedBytes += info.size;
      } catch {
        // Skip
      }
    }
  }

  return { deleted, freedBytes };
}

// Trim directory to target size, keeping newest files
async function trimToSize(dir: string, targetBytes: number): Promise<{ deleted: number; freedBytes: number }> {
  const files = await getFileInfoList(dir);

  // Sort newest first
  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  let totalSize = files.reduce((sum, f) => sum + f.size, 0);
  let deleted = 0;
  let freedBytes = 0;

  // Delete from oldest (end of array) until under target
  for (let i = files.length - 1; i >= 0 && totalSize > targetBytes; i--) {
    try {
      await unlink(files[i].filepath);
      totalSize -= files[i].size;
      freedBytes += files[i].size;
      deleted++;
    } catch {
      // Skip
    }
  }

  return { deleted, freedBytes };
}

/**
 * 서버 시작 시 호출: 전체 용량이 100MB를 넘으면 50MB 이하로 정리
 * + 7일 지난 파일 삭제
 */
export async function startupCleanup(): Promise<{
  expired: { extracted: { deleted: number; freedBytes: number }; screenshots: { deleted: number; freedBytes: number } };
  sizeTrim: { extracted: { deleted: number; freedBytes: number }; screenshots: { deleted: number; freedBytes: number } } | null;
}> {
  console.log('[storage] Running startup cleanup...');

  // 1. TTL cleanup (7일)
  const expiredExtracted = await cleanupExpiredFiles(EXTRACTED_DIR);
  const expiredScreenshots = await cleanupExpiredFiles(SCREENSHOTS_DIR);

  if (expiredExtracted.deleted > 0) {
    console.log(`[storage] TTL cleanup (extracted): ${expiredExtracted.deleted} files, ${(expiredExtracted.freedBytes / 1024 / 1024).toFixed(1)}MB freed`);
  }
  if (expiredScreenshots.deleted > 0) {
    console.log(`[storage] TTL cleanup (screenshots): ${expiredScreenshots.deleted} files, ${(expiredScreenshots.freedBytes / 1024 / 1024).toFixed(1)}MB freed`);
  }

  // 2. Size check after TTL cleanup
  const extractedFiles = await getFileInfoList(EXTRACTED_DIR);
  const screenshotFiles = await getFileInfoList(SCREENSHOTS_DIR);
  const extractedSize = extractedFiles.reduce((sum, f) => sum + f.size, 0);
  const screenshotSize = screenshotFiles.reduce((sum, f) => sum + f.size, 0);
  const totalSize = extractedSize + screenshotSize;

  console.log(`[storage] Current size: extracted=${(extractedSize / 1024 / 1024).toFixed(1)}MB, screenshots=${(screenshotSize / 1024 / 1024).toFixed(1)}MB, total=${(totalSize / 1024 / 1024).toFixed(1)}MB`);

  let sizeTrim = null;

  if (totalSize > STARTUP_SIZE_THRESHOLD) {
    console.log(`[storage] Total size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds ${STARTUP_SIZE_THRESHOLD / 1024 / 1024}MB threshold, trimming to ${STARTUP_SIZE_TARGET / 1024 / 1024}MB...`);

    // Proportionally distribute target between extracted and screenshots
    const extractedRatio = extractedSize / totalSize;
    const extractedTarget = Math.floor(STARTUP_SIZE_TARGET * extractedRatio);
    const screenshotTarget = STARTUP_SIZE_TARGET - extractedTarget;

    const trimExtracted = await trimToSize(EXTRACTED_DIR, extractedTarget);
    const trimScreenshots = await trimToSize(SCREENSHOTS_DIR, screenshotTarget);

    sizeTrim = { extracted: trimExtracted, screenshots: trimScreenshots };

    const totalDeleted = trimExtracted.deleted + trimScreenshots.deleted;
    const totalFreed = trimExtracted.freedBytes + trimScreenshots.freedBytes;
    console.log(`[storage] Size trim: ${totalDeleted} files deleted, ${(totalFreed / 1024 / 1024).toFixed(1)}MB freed`);
  }

  console.log('[storage] Startup cleanup complete');

  return {
    expired: { extracted: expiredExtracted, screenshots: expiredScreenshots },
    sizeTrim,
  };
}

// Cleanup old components: count limit + TTL (non-blocking, fire-and-forget)
function cleanupOldComponents() {
  (async () => {
    try {
      // TTL cleanup
      await cleanupExpiredFiles(EXTRACTED_DIR);

      // Count limit cleanup
      const files = await readdir(EXTRACTED_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      if (jsonFiles.length <= MAX_COMPONENTS) return;

      const fileInfos: { file: string; createdAt: Date }[] = [];
      for (const file of jsonFiles) {
        try {
          const filepath = join(EXTRACTED_DIR, file);
          const content = await readFile(filepath, 'utf-8');
          const component = JSON.parse(content) as StoredComponent;
          fileInfos.push({ file, createdAt: new Date(component.createdAt) });
        } catch {
          // Skip invalid files
        }
      }

      fileInfos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const toDelete = fileInfos.slice(0, fileInfos.length - MAX_COMPONENTS);
      for (const { file } of toDelete) {
        try {
          await unlink(join(EXTRACTED_DIR, file));
        } catch (err) {
          console.warn(`[storage] Failed to delete old component: ${file}`, err);
        }
      }
    } catch (err) {
      console.warn('[storage] Cleanup failed', err);
    }
  })();
}

// Save extracted component
export async function saveComponent(name: string, data: ExtractedNode): Promise<StoredComponent> {
  await ensureDir(EXTRACTED_DIR);

  const id = generateId();
  const safeName = sanitizeFilename(name) || 'component';
  const filename = `${safeName}-${id}.json`;
  const filepath = join(EXTRACTED_DIR, filename);

  const component: StoredComponent = {
    id,
    name,
    data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(filepath, JSON.stringify(component, null, 2), 'utf-8');

  // Fire-and-forget cleanup (non-blocking)
  cleanupOldComponents();

  return component;
}

// List all saved components
export async function listComponents(): Promise<StoredComponent[]> {
  await ensureDir(EXTRACTED_DIR);

  const files = await readdir(EXTRACTED_DIR);
  const components: StoredComponent[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    try {
      const filepath = join(EXTRACTED_DIR, file);
      const content = await readFile(filepath, 'utf-8');
      const component = JSON.parse(content) as StoredComponent;
      components.push(component);
    } catch {
      // Skip invalid files
    }
  }

  // Sort by creation date (newest first)
  components.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return components;
}

// Get component by ID
export async function getComponent(id: string): Promise<StoredComponent | null> {
  await ensureDir(EXTRACTED_DIR);

  const files = await readdir(EXTRACTED_DIR);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    if (!file.includes(id)) continue;

    try {
      const filepath = join(EXTRACTED_DIR, file);
      const content = await readFile(filepath, 'utf-8');
      const component = JSON.parse(content) as StoredComponent;
      if (component.id === id) {
        return component;
      }
    } catch {
      // Skip invalid files
    }
  }

  return null;
}

// Get component by name (first match)
export async function getComponentByName(name: string): Promise<StoredComponent | null> {
  const components = await listComponents();
  return components.find((c) => c.name === name) || null;
}

// Delete component by ID
export async function deleteComponent(id: string): Promise<boolean> {
  await ensureDir(EXTRACTED_DIR);

  const files = await readdir(EXTRACTED_DIR);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    if (!file.includes(id)) continue;

    try {
      const filepath = join(EXTRACTED_DIR, file);
      const content = await readFile(filepath, 'utf-8');
      const component = JSON.parse(content) as StoredComponent;

      if (component.id === id) {
        await unlink(filepath);
        return true;
      }
    } catch {
      // Continue searching
    }
  }

  return false;
}

// Get storage stats
export async function getStorageStats(): Promise<{ count: number; totalSize: number }> {
  await ensureDir(EXTRACTED_DIR);

  const files = await readdir(EXTRACTED_DIR);
  let count = 0;
  let totalSize = 0;

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    try {
      const filepath = join(EXTRACTED_DIR, file);
      const stats = await stat(filepath);
      count++;
      totalSize += stats.size;
    } catch {
      // Skip invalid files
    }
  }

  return { count, totalSize };
}

// Get full storage stats (extracted + screenshots)
export async function getFullStorageStats(): Promise<{
  extracted: { count: number; totalSize: number };
  screenshots: { count: number; totalSize: number };
  total: { count: number; totalSize: number };
}> {
  const extractedFiles = await getFileInfoList(EXTRACTED_DIR);
  const screenshotFiles = await getFileInfoList(SCREENSHOTS_DIR);

  const extracted = {
    count: extractedFiles.length,
    totalSize: extractedFiles.reduce((sum, f) => sum + f.size, 0),
  };
  const screenshots = {
    count: screenshotFiles.length,
    totalSize: screenshotFiles.reduce((sum, f) => sum + f.size, 0),
  };

  return {
    extracted,
    screenshots,
    total: {
      count: extracted.count + screenshots.count,
      totalSize: extracted.totalSize + screenshots.totalSize,
    },
  };
}

/**
 * 조건부 일괄 정리
 */
export async function cleanup(options: {
  olderThanDays?: number;
  category?: 'extracted' | 'screenshots' | 'all';
}): Promise<{ deleted: number; freedBytes: number }> {
  const category = options.category || 'all';
  const olderThanDays = options.olderThanDays || TTL_DAYS;
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;
  let totalFreed = 0;

  const dirs: string[] = [];
  if (category === 'extracted' || category === 'all') dirs.push(EXTRACTED_DIR);
  if (category === 'screenshots' || category === 'all') dirs.push(SCREENSHOTS_DIR);

  for (const dir of dirs) {
    const files = await getFileInfoList(dir);
    for (const info of files) {
      if (info.mtime < cutoff) {
        try {
          await unlink(info.filepath);
          totalDeleted++;
          totalFreed += info.size;
        } catch {
          // Skip
        }
      }
    }
  }

  return { deleted: totalDeleted, freedBytes: totalFreed };
}

// === Screenshot Storage ===

export interface ScreenshotInfo {
  filename: string;
  path: string;
  size: number;
  createdAt: string;
}

// Save screenshot: base64 → file, return absolute path
export async function saveScreenshot(base64Data: string, filename: string): Promise<string> {
  await ensureDir(SCREENSHOTS_DIR);

  const safeFilename = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, '-');
  const filepath = join(SCREENSHOTS_DIR, safeFilename);

  const buffer = Buffer.from(base64Data, 'base64');
  await writeFile(filepath, buffer);

  return filepath;
}

// List screenshots
export async function listScreenshots(): Promise<ScreenshotInfo[]> {
  await ensureDir(SCREENSHOTS_DIR);

  const files = await readdir(SCREENSHOTS_DIR);
  const screenshots: ScreenshotInfo[] = [];

  for (const file of files) {
    try {
      const filepath = join(SCREENSHOTS_DIR, file);
      const stats = await stat(filepath);
      screenshots.push({
        filename: file,
        path: filepath,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by creation date (newest first)
  screenshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return screenshots;
}

// Delete screenshot by filename
export async function deleteScreenshot(filename: string): Promise<boolean> {
  const filepath = join(SCREENSHOTS_DIR, filename);
  try {
    await unlink(filepath);
    return true;
  } catch {
    return false;
  }
}
