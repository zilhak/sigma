# `fill_sizing_orphan`

| | |
|---|---|
| 기본 | **ON** (opt-out) |
| 스코프 | 모든 노드 |
| 추가 왕복 | 없음 |
| 자동수정 | 없음 |

## 무엇을 잡나

`layoutSizingHorizontal` 또는 `layoutSizingVertical`이 `FILL`인데, 부모가 오토레이아웃이 아닌
(`layoutMode === 'NONE'`) 상태.

## 왜 필요한가

**FILL은 오토레이아웃 부모 안에서만 의미가 있다.** 부모가 오토레이아웃이 아니면 이 설정은 아무것도
하지 않는데, Figma는 값을 지워 주지 않고 그대로 들고 있는다.

이 상태의 원인은 사실상 하나다 — **`resize()`나 reparent 이후 남은 무효 상태**. 오토레이아웃
프레임에서 꺼내 왔거나 부모의 `layoutMode`를 껐을 때 생긴다. 나중에 부모를 다시 오토레이아웃으로
바꾸는 순간 크기가 예상 밖으로 튀는 지뢰가 된다.

## 파라미터

없음. `{ "enabled": false }`로 끄는 것만 가능하다.

## 오탐과 의도적 스코프 축소

- 원인이 거의 유일해서 오탐이 적은 룰이다. 위반이 나오면 대체로 진짜 무효 상태다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제. 보통은 면제보다 값을 `FIXED`/`HUG`로 고치는 게 맞다
(`sigma_modify_node`의 `setLayoutSizing`).

## 구현

`packages/shared/src/lint/simple-rules.ts`
