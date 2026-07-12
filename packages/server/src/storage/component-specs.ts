import { mkdir, readdir, readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ComponentSpecRecord } from '@sigma/shared';

/**
 * 컴포넌트 스펙 레지스트리 저장소
 *
 * extracted/screenshots와 달리 **TTL 정리 대상이 아니다** — 스펙은 영속적인
 * 카탈로그 항목이며, 삭제는 sigma_delete_component_spec으로만 한다.
 * alias는 검증기(^[a-z][a-z0-9_]*$)를 통과한 값이므로 파일명으로 안전하다.
 */

const BASE_DIR = join(homedir(), '.sigma');
const COMPONENT_SPECS_DIR = join(BASE_DIR, 'component-specs');

async function ensureDir(): Promise<void> {
  await mkdir(COMPONENT_SPECS_DIR, { recursive: true });
}

function specPath(alias: string): string {
  return join(COMPONENT_SPECS_DIR, `${alias}.json`);
}

export async function saveComponentSpec(record: ComponentSpecRecord): Promise<void> {
  await ensureDir();
  await writeFile(specPath(record.alias), JSON.stringify(record, null, 2), 'utf-8');
}

export async function getComponentSpec(alias: string): Promise<ComponentSpecRecord | null> {
  try {
    const content = await readFile(specPath(alias), 'utf-8');
    return JSON.parse(content) as ComponentSpecRecord;
  } catch {
    return null;
  }
}

export async function listComponentSpecs(): Promise<ComponentSpecRecord[]> {
  await ensureDir();
  const files = await readdir(COMPONENT_SPECS_DIR);
  const records: ComponentSpecRecord[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await readFile(join(COMPONENT_SPECS_DIR, file), 'utf-8');
      records.push(JSON.parse(content) as ComponentSpecRecord);
    } catch {
      // 손상된 파일은 건너뜀
    }
  }

  records.sort((a, b) => a.alias.localeCompare(b.alias));
  return records;
}

export async function deleteComponentSpec(alias: string): Promise<boolean> {
  try {
    await unlink(specPath(alias));
    return true;
  } catch {
    return false;
  }
}
