/**
 * sigma_lint 의 페이지별 유효 config 해석.
 * scope=file / configMode(uniform|per-page|merge) 조합에서 각 페이지에 적용할
 * LintConfig 를 결정한다. 저장 config 는 페이지/문서 노드의 sharedPluginData("sigma","lint").
 */
import type { LintConfig } from '@sigma/shared/lint';
import { validateLintConfigShape, LintConfigError } from './load-config.js';
import type { FigmaWebSocketServer } from '../websocket/server.js';

export type ConfigMode = 'uniform' | 'per-page' | 'merge';

/** 페이지에 적용된 config 의 출처(리포트/응답 표기용) */
export type ConfigSource =
  | 'base'          // 명시 base(inline/파일/문서) 그대로
  | 'page-stored'   // 그 페이지에 저장된 config
  | 'merged'        // base + 페이지 저장 config 병합
  | 'skipped';      // 적용할 config 없음(per-page 인데 저장·base 모두 없음)

export interface ResolvedPageConfig {
  config: LintConfig | null;   // null = skip
  source: ConfigSource;
  error?: string;              // 저장 config 파싱/검증 실패 시(그 페이지만 표기하고 계속)
}

/**
 * builtins·custom 모두 **rule id 단위로** override 한다(페이지가 base 를 덮음).
 *
 * ⚠️ 예전엔 custom 을 통째로 교체했다. 그러면 페이지가 규칙 하나만 얹어도 **base 의 나머지
 * 커스텀 규칙이 그 페이지에서 전부 사라진다** — 응답에 아무 표시가 없어 "규칙이 돌았는데 0건"
 * 으로 읽힌다. 실사고: 오타 블록리스트를 담은 규칙이 파일 config 에만 있어, 자기 config 를 가진
 * 페이지들에서 통째로 무효였고 오타 11건이 그대로 통과했다.
 * id 가 같으면 페이지 쪽이 이기고, base 에만 있는 규칙은 살아남는다.
 */
export function mergeConfigs(base: LintConfig | null, override: LintConfig | null): LintConfig {
  const b = base || {};
  const o = override || {};
  const byId = new Map<string, NonNullable<LintConfig['custom']>[number]>();
  for (const r of b.custom || []) byId.set(r.id, r);
  for (const r of o.custom || []) byId.set(r.id, r);
  const custom = [...byId.values()];
  return {
    builtins: { ...(b.builtins || {}), ...(o.builtins || {}) },
    custom: custom.length > 0 ? custom : undefined,
  };
}

/**
 * 페이지/문서 노드에 저장된 "lint" config 를 읽어 파싱·검증한다.
 * 없으면 null, 파싱/검증 실패 시 { error } (throw 하지 않음 — 부분 실패 허용).
 */
export async function readStoredConfig(
  wsServer: FigmaWebSocketServer,
  pageId: string,
  pluginId: string | undefined,
): Promise<{ config: LintConfig | null; error?: string }> {
  let raw: string | null = null;
  try {
    const res = await wsServer.getPageData({ key: 'lint', pageId }, pluginId);
    raw = (res.value ?? null) as string | null;
  } catch (error) {
    return { config: null, error: error instanceof Error ? error.message : String(error) };
  }
  if (raw === null || raw === '') return { config: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { config: null, error: `저장된 lint config 가 JSON 이 아닙니다 (page ${pageId})` };
  }
  try {
    return { config: validateLintConfigShape(parsed, `page:${pageId}`) };
  } catch (error) {
    const msg = error instanceof LintConfigError ? error.message : String(error);
    return { config: null, error: msg };
  }
}

/**
 * 한 페이지에 대해 configMode 규칙으로 유효 config 를 해석한다.
 */
export async function resolvePageConfig(
  wsServer: FigmaWebSocketServer,
  pageId: string,
  mode: ConfigMode,
  base: LintConfig | null,
  pluginId: string | undefined,
): Promise<ResolvedPageConfig> {
  if (mode === 'uniform') {
    return { config: base, source: 'base' };
  }

  const stored = await readStoredConfig(wsServer, pageId, pluginId);
  const storeErr = stored.error;

  if (mode === 'per-page') {
    if (stored.config) return { config: stored.config, source: 'page-stored', error: storeErr };
    if (base) return { config: base, source: 'base', error: storeErr };
    return { config: null, source: 'skipped', error: storeErr };
  }

  // merge
  if (stored.config) return { config: mergeConfigs(base, stored.config), source: 'merged', error: storeErr };
  if (base) return { config: base, source: 'base', error: storeErr };
  return { config: null, source: 'skipped', error: storeErr };
}
