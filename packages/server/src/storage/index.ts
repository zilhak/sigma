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

const STORAGE_DIR = join(homedir(), '.sigma', 'extracted');
const MAX_COMPONENTS = 20;

// Ensure storage directory exists
async function ensureDir() {
  await mkdir(STORAGE_DIR, { recursive: true });
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

// Cleanup old components (non-blocking, fire-and-forget)
function cleanupOldComponents() {
  (async () => {
    try {
      const files = await readdir(STORAGE_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      if (jsonFiles.length <= MAX_COMPONENTS) return;

      // Get file info with creation time
      const fileInfos: { file: string; createdAt: Date }[] = [];
      for (const file of jsonFiles) {
        try {
          const filepath = join(STORAGE_DIR, file);
          const content = await readFile(filepath, 'utf-8');
          const component = JSON.parse(content) as StoredComponent;
          fileInfos.push({ file, createdAt: new Date(component.createdAt) });
        } catch {
          // Skip invalid files
        }
      }

      // Sort by creation date (oldest first)
      fileInfos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Delete oldest files until we're at MAX_COMPONENTS
      const toDelete = fileInfos.slice(0, fileInfos.length - MAX_COMPONENTS);
      for (const { file } of toDelete) {
        try {
          await unlink(join(STORAGE_DIR, file));
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
  await ensureDir();

  const id = generateId();
  const safeName = sanitizeFilename(name) || 'component';
  const filename = `${safeName}-${id}.json`;
  const filepath = join(STORAGE_DIR, filename);

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
  await ensureDir();

  const files = await readdir(STORAGE_DIR);
  const components: StoredComponent[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    try {
      const filepath = join(STORAGE_DIR, file);
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
  await ensureDir();

  const files = await readdir(STORAGE_DIR);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    if (!file.includes(id)) continue;

    try {
      const filepath = join(STORAGE_DIR, file);
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
  await ensureDir();

  const files = await readdir(STORAGE_DIR);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    if (!file.includes(id)) continue;

    try {
      const filepath = join(STORAGE_DIR, file);
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
  await ensureDir();

  const files = await readdir(STORAGE_DIR);
  let count = 0;
  let totalSize = 0;

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    try {
      const filepath = join(STORAGE_DIR, file);
      const stats = await stat(filepath);
      count++;
      totalSize += stats.size;
    } catch {
      // Skip invalid files
    }
  }

  return { count, totalSize };
}
