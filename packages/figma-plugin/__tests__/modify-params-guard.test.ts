/**
 * ALLOWED_METHODS 의 `params` 선언 ↔ 핸들러가 실제로 읽는 args 키가 어긋나지 않는지.
 *
 * 이 둘이 어긋나는 방향마다 실패 모양이 다르다:
 * - 선언 < 실제: 정상 호출이 "모르는 인자" 로 거부된다 (요란하게 깨짐)
 * - 선언 > 실제: 오타가 통과해 **성공 응답 + 아무 일도 안 일어남** 으로 돌아온다 (조용히 깨짐)
 *
 * 뒤쪽이 이 가드를 만든 이유이므로, 사람이 params 를 손으로 유지하게 두지 않고 여기서 대조한다.
 * 배경: docs/history/003-modify-node-nested-args-silent-noop.md
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_METHODS, executeModifyNode } from '../src/node-ops/modify';

/**
 * ⚠️ `handler.toString()` 을 쓰면 안 된다 — Bun 트랜스파일러가 연속된 `const a = args.x` 를
 * `const { x } = args` 구조분해로 접어서, 읽는 키가 소스에서 사라진 것처럼 보인다.
 * 그래서 **원본 .ts 를 직접 읽는다.**
 */
const MODIFY_SRC = readFileSync(join(import.meta.dir, '../src/node-ops/modify.ts'), 'utf-8');

/** 메서드 이름 → 그 정의 블록의 소스 */
function methodChunks(): Map<string, string> {
  const start = MODIFY_SRC.indexOf('export const ALLOWED_METHODS');
  const body = MODIFY_SRC.slice(start, MODIFY_SRC.indexOf('\n};\n', start));
  const chunks = new Map<string, string>();
  const heads = [...body.matchAll(/\n {2}([A-Za-z0-9_]+): \{\n/g)];
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index! : body.length;
    chunks.set(h[1], body.slice(h.index!, end));
  });
  return chunks;
}

/** 소스에서 `args.x` / `args['x']` 로 읽는 키를 뽑는다 */
function argKeysReadIn(src: string): string[] {
  const keys = new Set<string>();
  for (const m of src.matchAll(/args\.([A-Za-z0-9_]+)/g)) keys.add(m[1]);
  for (const m of src.matchAll(/args\['([^']+)'\]/g)) keys.add(m[1]);
  return [...keys].sort();
}

describe('ALLOWED_METHODS params', () => {
  test('모든 메서드가 params 를 선언한다', () => {
    const missing = Object.entries(ALLOWED_METHODS)
      .filter(([, v]) => !Array.isArray(v.params))
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  test('params 가 핸들러가 읽는 키와 정확히 일치한다', () => {
    const chunks = methodChunks();
    expect(chunks.size).toBe(Object.keys(ALLOWED_METHODS).length);
    const mismatched: Array<{ method: string; declared: string[]; read: string[] }> = [];
    for (const [method, def] of Object.entries(ALLOWED_METHODS)) {
      const declared = [...def.params].sort();
      const read = argKeysReadIn(chunks.get(method) ?? '');
      if (JSON.stringify(declared) !== JSON.stringify(read)) {
        mismatched.push({ method, declared, read });
      }
    }
    expect(mismatched).toEqual([]);
  });

  test('params 에 중복이 없다', () => {
    for (const [method, def] of Object.entries(ALLOWED_METHODS)) {
      expect(new Set(def.params).size).toBe(def.params.length);
    }
  });

  // 서버 내부 경로가 실제로 넘기는 키 — 여기가 깨지면 lint 자동수정·프레임 생성이 죽는다.
  test('서버 내부 호출이 쓰는 인자가 params 에 있다', () => {
    expect(ALLOWED_METHODS.setClipsContent.params).toContain('clips');
    expect(ALLOWED_METHODS.resize.params).toEqual(['width', 'height']);
    expect(ALLOWED_METHODS.move.params).toEqual(['x', 'y']);
  });
});

describe('executeModifyNode 인자 가드', () => {
  // isReachable 은 부모 사슬을 타고 올라가 figma.root 의 페이지에 닿는지 본다.
  const page = { id: '0:1', type: 'PAGE', parent: null as unknown };
  const node = { id: '1:1', type: 'FRAME', name: 'n', x: 0, y: 0, parent: page };
  function withStubbedFigma<T>(fn: () => T): T {
    const g = globalThis as unknown as { figma?: unknown };
    const prev = g.figma;
    g.figma = {
      getNodeById: (id: string) => (id === node.id ? node : null),
      root: { children: [page] },
    };
    try {
      return fn();
    } finally {
      g.figma = prev;
    }
  }

  test('모르는 인자를 거부한다 (positive control)', async () => {
    await withStubbedFigma(async () => {
      let thrown: Error | undefined;
      try {
        await executeModifyNode('1:1', 'move', { left: 10 });
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeDefined();
      const payload = JSON.parse((thrown as Error).message);
      expect(payload.unknownArgs).toEqual(['left']);
      expect(payload.acceptedArgs).toEqual(['x', 'y']);
    });
  });

  test('정상 인자는 통과한다', async () => {
    await withStubbedFigma(async () => {
      const r = (await executeModifyNode('1:1', 'move', { x: 5, y: 7 })) as { x: number; y: number };
      expect(r).toEqual({ x: 5, y: 7 });
    });
  });

  test('args 를 아예 안 주는 메서드도 통과한다', async () => {
    await withStubbedFigma(async () => {
      // remove 는 params 가 빈 배열 — {} 는 통과해야 한다
      expect(ALLOWED_METHODS.remove.params).toEqual([]);
    });
  });
});
