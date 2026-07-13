import { mkdir, readdir, readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ComponentSpecRecord } from '@sigma/shared';

/**
 * 컴포넌트 스펙 레지스트리 저장소
 *
 * extracted/screenshots와 달리 **TTL 정리 대상이 아니다** — 스펙은 영속적인
 * 카탈로그 항목이며, 삭제는 sigma_delete_component_spec으로만 한다.
 *
 * 유일성 키는 (namespace, alias) — 같은 역할·다른 스타일 체계(기획/디자인 등)를
 * namespace로 구분한다. 파일명: `<namespace>__<alias>.json`
 * (레거시 `<alias>.json`은 namespace 'default'로 취급).
 * namespace/alias는 검증기(^[a-z][a-z0-9_]*$)를 통과한 값이므로 파일명으로 안전하다.
 */

const BASE_DIR = join(homedir(), '.sigma');
const COMPONENT_SPECS_DIR = join(BASE_DIR, 'component-specs');

export const DEFAULT_NAMESPACE = 'default';

async function ensureDir(): Promise<void> {
  await mkdir(COMPONENT_SPECS_DIR, { recursive: true });
}

function specPath(namespace: string, alias: string): string {
  return join(COMPONENT_SPECS_DIR, `${namespace}__${alias}.json`);
}

/** 레거시 파일(alias.json) 경로 — namespace 'default' 전용 */
function legacySpecPath(alias: string): string {
  return join(COMPONENT_SPECS_DIR, `${alias}.json`);
}

function normalizeRecord(record: ComponentSpecRecord): ComponentSpecRecord {
  if (!record.namespace) {
    record.namespace = DEFAULT_NAMESPACE;
  }
  return record;
}

export async function saveComponentSpec(record: ComponentSpecRecord): Promise<void> {
  await ensureDir();
  normalizeRecord(record);
  await writeFile(specPath(record.namespace, record.alias), JSON.stringify(record, null, 2), 'utf-8');
  // 레거시 파일이 남아 있으면 정리 (default namespace로 재저장된 경우)
  if (record.namespace === DEFAULT_NAMESPACE) {
    try { await unlink(legacySpecPath(record.alias)); } catch { /* 없으면 무시 */ }
  }
}

export async function getComponentSpec(
  namespace: string,
  alias: string
): Promise<ComponentSpecRecord | null> {
  try {
    const content = await readFile(specPath(namespace, alias), 'utf-8');
    return normalizeRecord(JSON.parse(content) as ComponentSpecRecord);
  } catch {
    // default namespace는 레거시 파일도 조회
    if (namespace === DEFAULT_NAMESPACE) {
      try {
        const content = await readFile(legacySpecPath(alias), 'utf-8');
        return normalizeRecord(JSON.parse(content) as ComponentSpecRecord);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function listComponentSpecs(namespace?: string): Promise<ComponentSpecRecord[]> {
  await ensureDir();
  const files = await readdir(COMPONENT_SPECS_DIR);
  const records: ComponentSpecRecord[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await readFile(join(COMPONENT_SPECS_DIR, file), 'utf-8');
      records.push(normalizeRecord(JSON.parse(content) as ComponentSpecRecord));
    } catch {
      // 손상된 파일은 건너뜀
    }
  }

  const filtered = namespace ? records.filter((r) => r.namespace === namespace) : records;
  filtered.sort((a, b) =>
    a.namespace === b.namespace
      ? a.alias.localeCompare(b.alias)
      : a.namespace.localeCompare(b.namespace)
  );
  return filtered;
}

/** alias로 전 네임스페이스 검색 (namespace 미지정 use의 모호성 해소용) */
export async function findComponentSpecsByAlias(alias: string): Promise<ComponentSpecRecord[]> {
  const all = await listComponentSpecs();
  return all.filter((r) => r.alias === alias);
}

export async function deleteComponentSpec(namespace: string, alias: string): Promise<boolean> {
  let deleted = false;
  try {
    await unlink(specPath(namespace, alias));
    deleted = true;
  } catch { /* 없으면 레거시 시도 */ }
  if (!deleted && namespace === DEFAULT_NAMESPACE) {
    try {
      await unlink(legacySpecPath(alias));
      deleted = true;
    } catch { /* 없음 */ }
  }
  return deleted;
}
