import { describe, it, expect } from 'vitest';
import type { TreeNode } from '@sigma/shared';
import { runBuiltinRules } from '@sigma/shared/lint';
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

  /**
   * roots(=걸러진 자식)의 개수로 childCount 를 덮으면, omit/keep/limit 으로 자식이 전부
   * 걸러진 컨테이너가 "자식 0" 으로 보여 empty_container 오탐이 된다.
   */
  it('childCount 는 플러그인이 준 실제 자식 수를 유지한다', () => {
    const c = scopeContainer(shallowRoot, []);
    expect(c?.childCount).toBe(2); // roots.length(0) 이 아니라 shallowRoot.childCount
  });

  it('구버전 플러그인(childCount 없음)이면 roots.length 로 채운다', () => {
    const legacy = { id: 's1', name: '섹션', type: 'SECTION', boundingBox: box } as unknown as TreeNode;
    expect(scopeContainer(legacy, roots)?.childCount).toBe(2);
  });
});

/**
 * `nodeId`/`path` 스코프의 **시작 노드 자신**이 규칙 대상에 들어가는가.
 *
 * 017 은 enrich 경로와 annotation_layer 만 고쳤고, 빌트인 이름/구조 규칙은 `roots`(= 시작 노드의
 * **자식들**)만 받아 시작 노드를 건너뛰었다. 커버리지는 "돌았다"로 기록되므로 byRule 에 0 이 실려
 * **안 돈 걸 돌았다고 보고**했다. 배경: docs/history/019-scope-root-skipped-by-name-rules.md
 */
describe('runBuiltinRules — 스코프 루트 자신도 검사한다', () => {
  const box = (x = 0, y = 0, w = 100, h = 100) => ({ x, y, width: w, height: h });
  const node = (over: Partial<TreeNode> & Pick<TreeNode, 'id' | 'name' | 'type'>): TreeNode => ({
    boundingBox: box(), childCount: over.children?.length ?? 0, ...over,
  });

  /** run.ts 와 같은 배선 — 엔진에는 scopeContainer 로 만든 컨테이너가 들어간다. */
  const lint = (
    builtins: object, roots: TreeNode[], scopeRoot?: TreeNode, rule?: string,
    scopeRootInsideInstance?: boolean,
  ) =>
    runBuiltinRules(roots, builtins as never, {
      isPageRoot: !scopeRoot,
      scopeRoot: scopeContainer(scopeRoot, roots),
      scopeRootInsideInstance,
    })
      .filter((v) => (rule ? v.rule === rule : true))
      .map((v) => v.nodes?.[0]);

  const child = node({ id: 'c1', name: '버튼', type: 'FRAME', boundingBox: box(10, 10, 50, 50) });

  it('default_name — 시작 노드 자신의 기본 이름을 잡는다', () => {
    const scoped = node({ id: 'p1', name: 'Frame', type: 'FRAME', children: [child] });
    expect(lint({ default_name: {} }, scoped.children!, scoped, 'default_name')).toEqual(['p1']);
  });

  it('page 스코프에서는 종전대로 roots 를 검사한다', () => {
    const top = node({ id: 'p1', name: 'Frame', type: 'FRAME', children: [child] });
    expect(lint({ default_name: {} }, [top], undefined, 'default_name')).toEqual(['p1']);
  });

  it('empty_container — 시작 노드가 빈 컨테이너면 잡는다', () => {
    const empty = node({ id: 'e1', name: '빈 프레임', type: 'FRAME' });
    expect(lint({ empty_container: {} }, [], empty, 'empty_container')).toEqual(['e1']);
  });

  it('empty_container — 자식이 걸러졌을 뿐이면 잡지 않는다(childCount 유지)', () => {
    const hasKids = node({ id: 'h1', name: '프레임', type: 'FRAME', childCount: 3 });
    expect(lint({ empty_container: {} }, [], hasKids, 'empty_container')).toEqual([]);
  });

  it('component_description_empty — meta 가 실려 와야 오탐이 없다', () => {
    const documented = node({ id: 'k1', name: '버튼', type: 'COMPONENT', meta: { description: '기본 버튼' } });
    const bare = node({ id: 'k2', name: '버튼', type: 'COMPONENT', meta: { description: '' } });
    const cfg = { component_description_empty: {} };
    expect(lint(cfg, [], documented, 'component_description_empty')).toEqual([]);
    expect(lint(cfg, [], bare, 'component_description_empty')).toEqual(['k2']);
  });

  /**
   * ⛔ 아래 둘은 **부모/조상**을 봐야 판정된다. 스코프 루트의 부모는 트리 밖이라
   * 검사 대상에 넣으면 정상 노드가 위반이 된다 — 그래서 일부러 roots 만 준다.
   */
  it('fill_sizing_orphan — 시작 노드는 검사하지 않는다(부모가 트리 밖)', () => {
    const filled = node({
      id: 'f1', name: '카드', type: 'FRAME',
      meta: { layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED' },
    });
    expect(lint({ fill_sizing_orphan: {} }, [], filled, 'fill_sizing_orphan')).toEqual([]);
  });

  it('raw_node — 시작 노드는 검사하지 않는다(조상이 트리 밖)', () => {
    const raw = node({ id: 'r1', name: '박스', type: 'RECTANGLE' });
    expect(lint({ raw_node: { enabled: true } }, [], raw, 'raw_node')).toEqual([]);
  });

  /**
   * 인스턴스 내부 면제도 **조상**을 봐야 정해진다. 스코프 루트의 조상은 트리 밖이므로 규칙이
   * 스스로 못 걸고, 스펙이 만든 "Frame" 래퍼가 그대로 위반이 된다(실측: 한 페이지에 7870개).
   * 그래서 플러그인이 `rootNodeInsideInstance` 로 판정해 주고 엔진이 그때만 시작 노드를 뺀다.
   */
  describe('스코프 루트가 INSTANCE 안쪽이면 면제 규칙에서 뺀다', () => {
    const wrapper = node({ id: 'w1', name: 'Frame', type: 'FRAME' });

    it('default_name — 인스턴스 안쪽이면 잡지 않는다', () => {
      expect(lint({ default_name: {} }, [], wrapper, 'default_name', true)).toEqual([]);
    });

    it('default_name — 인스턴스 밖이면 그대로 잡는다', () => {
      expect(lint({ default_name: {} }, [], wrapper, 'default_name', false)).toEqual(['w1']);
    });

    it('includeInsideInstances 면 스펙 감사이므로 다시 잡는다', () => {
      const cfg = { default_name: { includeInsideInstances: true } };
      expect(lint(cfg, [], wrapper, 'default_name', true)).toEqual(['w1']);
    });

    it('면제가 없는 규칙(hidden_leaf)은 인스턴스 안쪽이어도 검사한다', () => {
      const hidden = node({ id: 'h9', name: '숨김', type: 'FRAME', meta: { visible: false } });
      expect(lint({ hidden_leaf: {} }, [], hidden, 'hidden_leaf', true)).toEqual(['h9']);
    });
  });
});
