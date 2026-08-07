/**
 * 문서-코드 정합성 — 룰/도구가 문서에서 통째로 빠지는 것을 CI 에서 잡는다.
 *
 * 실제로 빌트인 룰 4종(instance_resized_from_spec · annotation_marker_pair ·
 * annotation_marker_gap · font_not_default)이 전 문서에서 0건인 채로 병합된 적이 있다.
 * 넷 다 유닛테스트는 있었지만 문서 누락을 잡는 장치가 없었다.
 *
 * **"존재하는가"만 본다.** 설명이 충분한지 같은 주관적 판정은 하지 않는다 — 문서 품질을
 * 테스트로 강제하려 들면 곧 무력화되기 때문이다.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_BUILTIN_RULE_IDS } from '../packages/shared/src/lint/engine';
import { toolDefinitions } from '../packages/server/src/mcp/tool-definitions';

// 실행 위치(루트/패키지)와 무관하게 저장소 루트를 잡는다
const ROOT = resolve(import.meta.dir, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

const RULES_DIR = 'docs/lint/rules';
const MCP_TOOLS = read('docs/mcp-tools.md');
const CLAUDE_MD = read('CLAUDE.md');

describe('문서-코드 정합성: lint 룰', () => {
  const ruleFiles = readdirSync(resolve(ROOT, RULES_DIR))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, '').replace(/-/g, '_'));

  test('모든 빌트인 룰에 rules/<id>.md 가 있다', () => {
    // 실패 시 어떤 id 가 빠졌는지 그대로 찍히도록 배열을 비교한다
    expect(ALL_BUILTIN_RULE_IDS.filter((id) => !ruleFiles.includes(id))).toEqual([]);
  });

  test('rules/ 에 코드에 없는 유령 룰 파일이 없다', () => {
    expect(ruleFiles.filter((f) => !ALL_BUILTIN_RULE_IDS.includes(f as never))).toEqual([]);
  });

  test('rules/README.md 인덱스가 24종을 전부 링크한다', () => {
    const index = read(`${RULES_DIR}/README.md`);
    const linked = ALL_BUILTIN_RULE_IDS.filter((id) =>
      index.includes(`(${id.replace(/_/g, '-')}.md)`),
    );
    expect(ALL_BUILTIN_RULE_IDS.filter((id) => !linked.includes(id))).toEqual([]);
  });
});

describe('문서-코드 정합성: MCP 도구', () => {
  const names = toolDefinitions.map((t) => t.name);

  test('도구 이름이 중복되지 않는다', () => {
    expect(names.length).toBe(new Set(names).size);
  });

  test('모든 도구가 docs/mcp-tools.md 에 있다', () => {
    expect(names.filter((n) => !MCP_TOOLS.includes(n))).toEqual([]);
  });

  test('모든 도구가 CLAUDE.md 에 있다', () => {
    expect(names.filter((n) => !CLAUDE_MD.includes(n))).toEqual([]);
  });

  test('문서에만 있고 코드에 없는 유령 도구가 없다', () => {
    const known = new Set(names);
    const cited = new Set(
      [...`${MCP_TOOLS}\n${CLAUDE_MD}`.matchAll(/\b(sigma_[a-z_]+)\b/g)].map((m) => m[1]),
    );
    expect([...cited].filter((n) => !known.has(n)).sort()).toEqual([]);
  });
});
