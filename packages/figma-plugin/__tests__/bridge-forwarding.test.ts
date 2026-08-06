/**
 * UI 브리지(code.ts)가 서버가 보낸 인자를 **빠뜨리지 않고** 전달하는지에 대한 소스 수준 회귀 테스트.
 *
 * 왜 있는가: code.ts 의 각 case 는 전달 필드를 손으로 나열한다. 서버가 새 인자를 보내도
 * 그 목록에 없으면 **조용히 사라진다** — 호출은 성공하고 아무 일도 일어나지 않는다.
 * 같은 버그가 두 번 났다: get-tree 의 fields/includeAbsolute, build-component-from-spec 의 namespace.
 * 옵션 인터페이스에 필드를 추가하면 이 테스트가 브리지도 함께 고치라고 알려 준다.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(import.meta.dir, '../src');

function readSource(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf-8');
}

/** `export interface <name> { ... }` 의 필드 이름들 (주석·중첩 객체는 무시) */
function interfaceFields(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`);
  if (start < 0) throw new Error(`인터페이스를 찾지 못했습니다: ${name}`);
  let depth = 0;
  let end = start;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = source.slice(source.indexOf('{', start) + 1, end);
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // 최상위 `name?: type;` 만 — 중첩 객체 타입 안쪽은 depth 로 걸러낸다
  const fields: string[] = [];
  let d = 0;
  for (const line of withoutComments.split('\n')) {
    const trimmed = line.trim();
    if (d === 0) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(trimmed);
      if (match) fields.push(match[1]);
    }
    d += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  }
  return fields;
}

/** code.ts 에서 `case '<name>': { ... }` 블록 본문 */
function caseBody(code: string, caseName: string): string {
  const start = code.indexOf(`case '${caseName}': {`);
  if (start < 0) throw new Error(`case 를 찾지 못했습니다: ${caseName}`);
  let depth = 0;
  for (let i = code.indexOf('{', start); i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error(`case 블록이 닫히지 않았습니다: ${caseName}`);
}

describe('UI 브리지 인자 전달', () => {
  test('build-component-from-spec 이 옵션 필드를 전부 전달한다', () => {
    const optionFields = interfaceFields(readSource('node-ops/component-spec.ts'), 'BuildComponentFromSpecOptions');
    const body = caseBody(readSource('code.ts'), 'build-component-from-spec');

    // 인터페이스에 있는데 브리지가 안 읽는 필드 = 조용히 사라지는 인자
    const dropped = optionFields.filter((f) => !new RegExp(`msg\\.${f}\\b`).test(body));
    expect(dropped).toEqual([]);
    // namespace 는 이 버그로 실제로 빠졌던 필드다 — 목록이 비어도 이게 빠지면 의미가 없다
    expect(optionFields).toContain('namespace');
  });

  test('get-tree 가 옵션 필드를 전부 전달한다 (같은 버그의 첫 사례)', () => {
    const body = caseBody(readSource('code.ts'), 'get-tree');
    for (const f of ['nodeId', 'path', 'depth', 'filter', 'limit', 'pageId', 'fields', 'includeAbsolute']) {
      expect(body).toContain(`msg.${f}`);
    }
  });
});
