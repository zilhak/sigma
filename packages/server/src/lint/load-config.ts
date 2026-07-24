/**
 * sigma_lint 의 configPath 로드/파싱/형태검증.
 * config 자체가 곧 커스텀 규칙 레지스트리다 — 서버는 별도 저장소를 관리하지 않고
 * 호출 시 지정된 경로를 매번 읽는다(Figma 파일마다 다른 config를 스코프 없이 명시 전달).
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { LintConfig } from '@sigma/shared';

export class LintConfigError extends Error {}

export async function loadLintConfig(configPath: string): Promise<LintConfig> {
  const absPath = resolve(configPath);
  let raw: string;
  try {
    raw = await readFile(absPath, 'utf-8');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new LintConfigError(`config 파일을 읽을 수 없습니다: ${absPath} (${msg})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new LintConfigError(`config 파일이 올바른 JSON이 아닙니다: ${absPath} (${msg})`);
  }

  return validateShape(parsed, absPath);
}

function validateShape(parsed: unknown, path: string): LintConfig {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LintConfigError(`config 최상위는 객체여야 합니다: ${path}`);
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.builtins !== undefined) {
    if (typeof obj.builtins !== 'object' || obj.builtins === null || Array.isArray(obj.builtins)) {
      throw new LintConfigError(`config.builtins 는 객체여야 합니다: ${path}`);
    }
  }

  if (obj.custom !== undefined) {
    if (!Array.isArray(obj.custom)) {
      throw new LintConfigError(`config.custom 은 배열이어야 합니다: ${path}`);
    }
    obj.custom.forEach((entry, i) => validateCustomEntry(entry, i, path));
  }

  return obj as LintConfig;
}

function validateCustomEntry(entry: unknown, index: number, path: string): void {
  if (typeof entry !== 'object' || entry === null) {
    throw new LintConfigError(`config.custom[${index}] 는 객체여야 합니다: ${path}`);
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) {
    throw new LintConfigError(`config.custom[${index}].id 는 필수 문자열입니다: ${path}`);
  }
  const kind = e.kind !== undefined ? e.kind : 'match';
  if (kind === 'match') {
    if (typeof e.select !== 'object' || e.select === null) {
      throw new LintConfigError(`config.custom[${index}] ("${e.id}", kind:match) 는 select 객체가 필요합니다: ${path}`);
    }
    if (typeof e.check !== 'object' || e.check === null) {
      throw new LintConfigError(`config.custom[${index}] ("${e.id}", kind:match) 는 check 객체가 필요합니다: ${path}`);
    }
  } else if (kind === 'predicate') {
    if (typeof e.code !== 'string' || !e.code.trim()) {
      throw new LintConfigError(`config.custom[${index}] ("${e.id}", kind:predicate) 는 code(문자열)가 필요합니다: ${path}`);
    }
  } else {
    throw new LintConfigError(`config.custom[${index}].kind 는 "match" 또는 "predicate" 여야 합니다 (현재: ${String(kind)}): ${path}`);
  }
}
