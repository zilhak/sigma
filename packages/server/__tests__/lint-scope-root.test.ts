import { describe, it, expect } from 'vitest';
import type { TreeNode } from '@sigma/shared';
import { scopeRootWithChildren, scopeContainer, collectNodeIds } from '../src/lint/enrich.js';

/**
 * `get_tree` 의 rootNode 는 **자식이 없는 껍데기**로 온다(id/name/type/boundingBox 뿐).
 * 검사 대상을 그것만으로 바꾸면 시작 노드는 얻지만 서브트리를 통째로 잃는다 —
 * 실제로 그렇게 고쳤다가 커스텀 규칙이 SECTION 하나만 보고 그 안의 마커·범례를 못 봐
 * 짝 검사가 계속 0건이었다. 배경: docs/history/017-scope-root-was-never-linted.md
 */
describe('scopeRootWithChildren — 시작 노드 + 서브트리 전부', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };
  const leaf = (id: string, type = 'INSTANCE'): TreeNode => ({ id, name: id, type, boundingBox: box, childCount: 0 });
  const roots: TreeNode[] = [
    { id: 'f1', name: '주석', type: 'FRAME', boundingBox: box, childCount: 2, children: [leaf('m1'), leaf('m2')] },
    leaf('f2', 'FRAME'),
  ];
  /** 플러그인이 주는 그대로 — children 없음. 이 "없음" 이 함정의 전부다. */
  const shallowRoot: TreeNode = { id: 's1', name: '섹션', type: 'SECTION', boundingBox: box, childCount: 2 };

  it('시작 노드를 검사 대상에 넣는다', () => {
    const ids = collectNodeIds(scopeRootWithChildren(shallowRoot, roots));
    expect(ids).toContain('s1');
  });

  it('서브트리를 잃지 않는다 — 자식·손자가 전부 남는다', () => {
    const ids = collectNodeIds(scopeRootWithChildren(shallowRoot, roots));
    expect(ids).toEqual(['s1', 'f1', 'm1', 'm2', 'f2']);
  });

  it('대조군 — 껍데기만 넣으면 시작 노드 하나뿐이다(고치기 전 동작)', () => {
    expect(collectNodeIds([shallowRoot])).toEqual(['s1']);
  });

  it('scopeRoot 가 없으면(page 스코프) roots 를 그대로 쓴다', () => {
    expect(scopeRootWithChildren(undefined, roots)).toBe(roots);
  });

  /**
   * ⛔ page 스코프에서 컨테이너를 잘못 주면 기하 규칙이 **첫 섹션을 자기 자신의 자식으로**
   * 검사한다("섹션이 자기 섹션 밖으로 나감"). kind 도 'page' 가 아니게 되어 outside_section 이
   * 통째로 죽는다. 실제로 그렇게 넣었다가 기획 4페이지에서 잡혀 같은 날 되돌렸다.
   */
  it('scopeContainer — page 스코프면 컨테이너가 없다', () => {
    expect(scopeContainer(undefined, roots)).toBeUndefined();
  });

  it('scopeContainer — 노드 스코프면 시작 노드에 자식을 붙여 준다', () => {
    const c = scopeContainer(shallowRoot, roots);
    expect(c?.id).toBe('s1');
    expect(c?.children).toBe(roots);
  });
});
