# `card_overlap`

| | |
|---|---|
| 기본 | **ON** (opt-out) |
| 스코프 | 섹션 안 직속 자식 간 (서브트리 검사 시 시작 노드가 SECTION이면 동일 적용) |
| 추가 왕복 | 없음 |
| 자동수정 | 없음 (재배치는 사람 판단) |

## 무엇을 잡나

섹션 안 직속 카드(FRAME/COMPONENT)끼리 겹치는 것.

## 왜 필요한가

섹션 안에서 카드가 겹치면 아래 카드가 가려져 존재를 놓친다. `resize`로 카드를 키우다 옆 카드를 덮는
경우가 대부분이라, [`section_overlap`](section-overlap.md)과 함께 **변형 후 회귀 검사**로 쓴다.

## 파라미터

없음. `{ "enabled": false }`로 끄는 것만 가능하다.

## 오탐과 의도적 스코프 축소

- **[기획 레이어](../annotation-layer.md)는 면제된다** — 디자인 위에 겹쳐 덮는 투명 오버레이라 겹침
  판정이 무의미하기 때문. 단 `annotation_layer` 규칙을 켠 경우에 한한다.
- 직속 자식만 본다. 카드 안쪽 요소끼리의 겹침은 [`child_overflow`](child-overflow.md)와 성격이 다르며
  이 룰의 대상이 아니다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제. 의도적으로 겹쳐 쌓는 레이아웃이면 page config로 끈다.

## 구현

`packages/shared/src/lint/geometric.ts`
