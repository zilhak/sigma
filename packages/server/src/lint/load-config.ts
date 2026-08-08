/**
 * sigma_lint 의 configPath 로드/파싱/형태검증.
 * config 자체가 곧 커스텀 규칙 레지스트리다 — 서버는 별도 저장소를 관리하지 않고
 * 호출 시 지정된 경로를 매번 읽는다(Figma 파일마다 다른 config를 스코프 없이 명시 전달).
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { ALL_BUILTIN_RULE_IDS, BUILTIN_RULE_PARAMS, type LintConfig } from '@sigma/shared/lint';

/** config 최상위에 허용되는 키. 이 밖의 키는 오타로 보고 거부한다. */
const TOP_LEVEL_KEYS = ['builtins', 'custom', 'componentSpec'];

/**
 * 어느 깊이에서나 허용되는 메모 키(JSON Schema 관례). 검증만 통과시키고 **동작에는 일절 쓰지 않는다.**
 *
 * 규칙을 켜고 끈 이유를 값 옆에 적어 두는 관례가 실제로 사고를 막아 왔다 —
 * "오탐이 많아서 껐다" 는 메모에는 유효기간이 있어서, 원인이 고쳐진 뒤에도 옛 이유로
 * 계속 꺼져 있는 일이 반복됐다. 엄격 검증(011)이 그 메모까지 함께 걷어내는 바람에
 * 설정과 사유가 다른 파일로 갈라졌고, 그래서 자리를 돌려준다.
 *
 * ⚠️ `_` 접두 전체를 허용하지 않는 이유: `_enabled` 같은 오타가 조용히 통과한다.
 * **`$comment` 한 개만** 허용하는 것이 엄격함을 유지하면서 자리를 주는 방법이다.
 * 배경: docs/history/013-strict-config-left-no-room-for-notes.md
 */
const COMMENT_KEY = '$comment';

/** 거부 메시지마다 붙는 대안 안내. 우회하지 않게 "그럼 어디에 쓰나" 를 함께 준다. */
const COMMENT_HINT = `메모는 "${COMMENT_KEY}"(문자열 또는 문자열 배열)에 두세요 — 어느 깊이에서나 허용되고 동작에는 쓰이지 않습니다.`;

/** `$comment` 가 있으면 형태만 검사한다(문자열 또는 문자열 배열). */
function checkCommentValue(value: unknown, where: string, path: string): void {
  if (value === undefined) return;
  const ok = typeof value === 'string'
    || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
  if (!ok) {
    throw new LintConfigError(`${where}.${COMMENT_KEY} 는 문자열 또는 문자열 배열이어야 합니다: ${path}`);
  }
}

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

/**
 * 이미 파싱된 객체(inline config / 페이지 저장 config)를 LintConfig 로 형태검증.
 * loadLintConfig 의 파일 경로 없는 버전 — 검증 실패 시 LintConfigError.
 */
export function validateLintConfigShape(parsed: unknown, sourceLabel: string): LintConfig {
  return validateShape(parsed, sourceLabel);
}

function validateShape(parsed: unknown, path: string): LintConfig {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LintConfigError(`config 최상위는 객체여야 합니다: ${path}`);
  }
  const obj = parsed as Record<string, unknown>;

  // 모르는 키를 조용히 무시하면 "설정을 줬는데 아무 일도 안 일어남" 이 된다. 실제로
  // `{"rules":{...}}` 오타가 통과해 전 규칙 기본값으로 돌면서 응답은 성공으로 왔다.
  // 배경: docs/history/011-lint-config-typos-were-silently-ignored.md
  checkCommentValue(obj[COMMENT_KEY], 'config', path);
  const unknownTop = Object.keys(obj)
    .filter((k) => k !== COMMENT_KEY && TOP_LEVEL_KEYS.indexOf(k) === -1);
  if (unknownTop.length > 0) {
    throw new LintConfigError(
      `config 최상위에 모르는 키가 있습니다: ${unknownTop.map((k) => `"${k}"`).join(', ')} — `
      + `조용히 무시하면 설정이 반영된 것처럼 보이므로 거부합니다. 허용: ${TOP_LEVEL_KEYS.join(', ')} (${path}). ${COMMENT_HINT}`
    );
  }

  if (obj.builtins !== undefined) {
    if (typeof obj.builtins !== 'object' || obj.builtins === null || Array.isArray(obj.builtins)) {
      throw new LintConfigError(`config.builtins 는 객체여야 합니다: ${path}`);
    }
    validateBuiltins(obj.builtins as Record<string, unknown>, path);
  }

  if (obj.custom !== undefined) {
    if (!Array.isArray(obj.custom)) {
      throw new LintConfigError(`config.custom 은 배열이어야 합니다: ${path}`);
    }
    obj.custom.forEach((entry, i) => validateCustomEntry(entry, i, path));
  }

  if (obj.componentSpec !== undefined) validateComponentSpecPolicy(obj.componentSpec, path);

  return obj as LintConfig;
}

/**
 * config.builtins — 규칙 id 와 규칙별 파라미터 이름을 카탈로그(`BUILTIN_RULE_PARAMS`)와 대조한다.
 * id 오타(`child_overflowss`)든 파라미터 오타(`paddin`)든 결과는 같다 — 그 설정이 통째로
 * 무시된 채 기본값으로 돌고, 응답은 성공으로 온다. 둘 다 여기서 막는다.
 */
function validateBuiltins(builtins: Record<string, unknown>, path: string): void {
  for (const [id, value] of Object.entries(builtins)) {
    if (ALL_BUILTIN_RULE_IDS.indexOf(id as never) === -1) {
      throw new LintConfigError(
        `config.builtins 에 없는 규칙 id: "${id}" — 오타를 조용히 무시하면 규칙이 안 켜진 채 "위반 0건" 으로 보입니다. `
        + `사용 가능: ${ALL_BUILTIN_RULE_IDS.join(', ')} (${path})`
      );
    }
    if (value === undefined) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new LintConfigError(`config.builtins.${id} 는 객체여야 합니다: ${path}`);
    }
    checkCommentValue((value as Record<string, unknown>)[COMMENT_KEY], `config.builtins.${id}`, path);
    const accepted = BUILTIN_RULE_PARAMS[id as keyof typeof BUILTIN_RULE_PARAMS];
    const unknown = Object.keys(value)
      .filter((k) => k !== 'enabled' && k !== COMMENT_KEY && accepted.indexOf(k) === -1);
    if (unknown.length > 0) {
      throw new LintConfigError(
        `config.builtins.${id} 가 모르는 파라미터를 받았습니다: ${unknown.map((k) => `"${k}"`).join(', ')} — `
        + `사용 가능: ${['enabled', ...accepted].join(', ')} (${path}). ${COMMENT_HINT}`
      );
    }
  }
}

/**
 * config.componentSpec — 스펙 등록 시 경고 정책.
 *
 * 조건은 aliasPattern(이름) 과 htmlPattern(스펙 HTML 내용) 두 축이고 **최소 하나**가 필요하다.
 * 예전엔 aliasPattern 을 필수로 요구했는데, 그러면 htmlPattern 단독 규칙이 저장 자체가 안 됐다 —
 * 정작 그게 도구 설명이 대표 용례로 제시한 형태였다(아이콘 창작 금지는 alias 로 못 잡는다.
 * 위반이 다른 컴포넌트 HTML 안에 묻힌 inline <svg> 로 들어오기 때문). 타입 정의·판정 로직은
 * 처음부터 선택으로 다뤘고 이 검증만 달랐다.
 */
function validateComponentSpecPolicy(value: unknown, path: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LintConfigError(`config.componentSpec 은 객체여야 합니다: ${path}`);
  }
  const warn = (value as Record<string, unknown>).warn;
  if (warn === undefined) return;
  if (!Array.isArray(warn)) {
    throw new LintConfigError(`config.componentSpec.warn 은 배열이어야 합니다: ${path}`);
  }
  warn.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new LintConfigError(`config.componentSpec.warn[${i}] 는 객체여야 합니다: ${path}`);
    }
    const e = entry as Record<string, unknown>;
    checkCommentValue(e[COMMENT_KEY], `config.componentSpec.warn[${i}]`, path);
    // 선택 문자열 필드는 "있으면 비어 있지 않은 문자열" 로만 본다. 여기서 안 막으면 숫자·빈
    // 문자열이 통과한 뒤 policy.ts 의 new RegExp 에서야 문제가 된다(등록 시점이라 늦다).
    for (const key of ['aliasPattern', 'htmlPattern', 'unlessDescription', 'namespace'] as const) {
      if (e[key] !== undefined && (typeof e[key] !== 'string' || !e[key])) {
        throw new LintConfigError(`config.componentSpec.warn[${i}].${key} 는 비어 있지 않은 문자열이어야 합니다: ${path}`);
      }
    }
    // 조건이 하나도 없으면 전 스펙에 매칭돼 경고가 무의미해진다. policy.ts 가 런타임에도
    // 걸러 주지만 그건 등록 시점이라, config 를 넣는 순간 막는다.
    if (e.aliasPattern === undefined && e.htmlPattern === undefined) {
      throw new LintConfigError(`config.componentSpec.warn[${i}] 는 aliasPattern 과 htmlPattern 중 최소 하나가 필요합니다: ${path}`);
    }
    if (typeof e.message !== 'string' || !e.message) {
      throw new LintConfigError(`config.componentSpec.warn[${i}].message 는 필수 문자열입니다: ${path}`);
    }
  });
}

function validateCustomEntry(entry: unknown, index: number, path: string): void {
  if (typeof entry !== 'object' || entry === null) {
    throw new LintConfigError(`config.custom[${index}] 는 객체여야 합니다: ${path}`);
  }
  const e = entry as Record<string, unknown>;
  checkCommentValue(e[COMMENT_KEY], `config.custom[${index}]`, path);
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
