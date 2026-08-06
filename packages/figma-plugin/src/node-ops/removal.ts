/**
 * 삭제 되읽기 검증.
 *
 * `remove()` 는 호출되는데 노드가 그대로 살아 있는 종류가 있다 — **메인 COMPONENT** 가 그렇다.
 * FRAME 은 `getNodeById` 가 곧바로 null 을 주지만, COMPONENT 는 remove() 뒤에도 id 로 계속
 * 조회되고 속성 접근도 된다(인스턴스 복구를 위해 문서 어딘가에 남겨 두는 Figma 내부 동작으로 보인다).
 * 그 결과 `delete_frame`·`batch_delete`·`delete_component_spec` 이 **전부 거짓 성공**을 보고했다.
 *
 * 여기서 정하는 "지워졌다" 의 기준은 **문서에서 도달 불가** 다 — 부모 사슬을 타고 올라가
 * `figma.root` 의 페이지에 닿지 못하면 그 노드는 어느 페이지에도 렌더되지 않고 트리·lint·검색
 * 어디에도 잡히지 않는다. id 로 조회되는지 여부와 무관하게 문서에 대한 영향이 0이다.
 */

/** 노드가 문서(= root 의 어떤 페이지) 에서 도달 가능한가. */
export function isReachable(node: BaseNode | null): boolean {
  if (!node) return false;
  try {
    if ((node as { removed?: boolean }).removed === true) return false;
    let cur: BaseNode | null = node;
    const seen = new Set<string>();
    while (cur) {
      if (seen.has(cur.id)) return false; // 사이클 방어
      seen.add(cur.id);
      if (cur.type === 'PAGE') return figma.root.children.some((p) => p.id === cur!.id);
      if (cur.type === 'DOCUMENT') return true;
      cur = cur.parent;
    }
    return false;
  } catch {
    // 이미 무효화된 노드는 속성 접근이 던진다 = 지워진 것.
    return false;
  }
}

export interface RemovalOutcome {
  /** 문서에서 도달 불가해졌는가(= 실제로 지워졌는가) */
  removed: boolean;
  /** remove() 뒤에도 id 로 계속 조회되는가(COMPONENT 계열) */
  stillResolvable: boolean;
  /** 사실대로 알려 줄 사유(removed=false 이거나 잔존 조회될 때만) */
  note?: string;
}

/** remove() 하고 **되읽어** 결과를 사실대로 돌려준다. */
export function removeAndVerify(node: BaseNode): RemovalOutcome {
  const id = node.id;
  node.remove();
  const after = figma.getNodeById(id);
  const removed = !isReachable(after);
  const stillResolvable = after !== null;
  if (!removed) {
    return {
      removed: false,
      stillResolvable,
      note: '노드가 여전히 문서에서 도달 가능하다 — 지워지지 않았다.',
    };
  }
  if (stillResolvable) {
    return {
      removed: true,
      stillResolvable: true,
      note: '페이지에서 떨어져 나갔지만 id 로는 계속 조회된다(메인 COMPONENT 는 Figma 가 남겨 둔다). 렌더·트리·검색에는 잡히지 않는다.',
    };
  }
  return { removed: true, stillResolvable: false };
}
