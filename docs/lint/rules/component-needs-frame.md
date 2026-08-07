# `component_needs_frame`

| | |
|---|---|
| 기본 | **ON** (opt-out) |
| 스코프 | 섹션 직속 |
| 추가 왕복 | 없음 |
| 자동수정 | 없음 |

## 무엇을 잡나

섹션 직속에 COMPONENT / COMPONENT_SET / GROUP이 놓인 것. 프레임 안에 있어야 한다.

## 왜 필요한가

**섹션 직속은 FRAME과 SECTION만**이라는 계층 규약을 강제한다. 컴포넌트 정의와 화면 조립을 섞어 두면
"이 섹션이 화면인가 컴포넌트 보관함인가"가 흐려지고, GROUP은 레이아웃 단위가 아니라 임시 묶음이라
그 자리에 놓이면 구조가 무너진다.

[`instance_orphan`](instance-orphan.md)이 인스턴스 쪽을 맡고, 이 룰은 정의·묶음 쪽을 맡는다.

## 파라미터

없음. `{ "enabled": false }`로 끄는 것만 가능하다.

## 오탐과 의도적 스코프 축소

- **[기획 레이어](../annotation-layer.md)는 면제**(`annotation_layer` 규칙을 켠 경우).
- `anno`/`wire` 프리셋은 예외다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제. 컴포넌트 카탈로그 페이지처럼 성격이 다른 페이지는
page config로 끄는 편이 낫다.

## 구현

`packages/shared/src/lint/geometric.ts`
