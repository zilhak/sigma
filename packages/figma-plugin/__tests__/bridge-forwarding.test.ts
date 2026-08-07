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

describe('브리지 명시 case 는 늘어나면 안 된다', () => {
  test('bridge-server 의 명시 case 는 특별 처리가 필요한 6종뿐이다', () => {
    const src = readSource('ui/bridge-server.ts');
    const cases = [...src.matchAll(/case SERVER_MSG\.([A-Z_]+)/g)].map((m) => m[1]);
    // 인자를 손으로 고르는 case 가 늘면 "조용히 사라지는 인자" 버그가 돌아온다.
    // 늘려야 한다고 판단했다면, 왜 패스스루로 안 되는지를 여기 주석으로 먼저 적을 것.
    // 남은 6종의 근거: 브리지 상태 변경(REGISTERED) · 청크 조립(CHUNK_*) ·
    // 하트비트(PING) · 하나의 명령이 두 code.ts case 로 갈라짐(CREATE_FRAME).
    expect([...new Set(cases)].sort()).toEqual([
      'CHUNK', 'CHUNK_END', 'CHUNK_START', 'CREATE_FRAME', 'PING', 'REGISTERED',
    ]);
  });

  test('SERVER_MSG 상수도 그 6종만 갖는다 (상수만 남으면 case 를 다시 늘리게 된다)', () => {
    const src = readSource('ui/constants.ts');
    const body = src.slice(src.indexOf('export const SERVER_MSG'), src.indexOf('} as const;', src.indexOf('export const SERVER_MSG')));
    const keys = [...body.matchAll(/^\s{2}([A-Z_]+):/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual([
      'CHUNK', 'CHUNK_END', 'CHUNK_START', 'CREATE_FRAME', 'PING', 'REGISTERED',
    ]);
  });

  test('bridge-plugin 은 다섯 필드 밖의 값을 싣는 case 만 남긴다', () => {
    const src = readSource('ui/bridge-plugin.ts');
    const cases = [...src.matchAll(/case PLUGIN_MSG\.([A-Z_]+)/g)].map((m) => m[1]);
    // *_RESULT 중 남은 것은 셋뿐이다:
    //   EXTRACT_RESULT   — format·data 를 싣고 Export 모달 콜백까지 부른다
    //   PAGE_LINT_RESULT · GOTO_NODE_RESULT — UI 전용(서버로 forward 하지 않는다)
    // 나머지 *_RESULT 는 {commandId,success,result,error} 뿐이라 제네릭 패스스루가 그대로 만든다.
    const results = [...new Set(cases)].filter((c) => c.endsWith('_RESULT')).sort();
    expect(results).toEqual([
      'EXTRACT_RESULT', 'GOTO_NODE_RESULT', 'PAGE_LINT_RESULT',
    ]);
  });

  test("서버 수신 switch 는 'RESULT' 하나만 명시한다 (나머지는 default 가 처리)", () => {
    const src = readFileSync(
      join(import.meta.dir, '../../server/src/websocket/server.ts'), 'utf-8',
    );
    const labels = [...src.matchAll(/^\s+case '([A-Z_]+)':/gm)].map((m) => m[1]);
    // '_RESULT' 로 끝나는 라벨을 명시하는 것은 default 와 중복이다.
    // 'RESULT' 만 예외 — endsWith('_RESULT') 가 false 라 default 가 못 잡는다.
    expect(labels.filter((l) => l.endsWith('_RESULT'))).toEqual([]);
    expect(labels).toContain('RESULT');
  });
});
