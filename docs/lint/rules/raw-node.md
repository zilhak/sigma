# `raw_node`

| | |
|---|---|
| 기본 | **OFF** (opt-in) |
| 스코프 | 모든 노드 |
| 추가 왕복 | 없음 |
| 자동수정 | 없음 |

## 무엇을 잡나

화면 조립 레이어에서 등록 컴포넌트의 INSTANCE가 아니라 **raw 도형/프레임으로 직접 그린 노드**를
전수 검출한다.

## 왜 필요한가

"쓰는 건 전부 사전 정의"라는 정책을 기계로 강제하기 위한 룰이다. 컴포넌트를 등록해 두어도 급할 때
사각형을 하나 그려 버튼처럼 쓰는 일이 반복되면, 디자인 시스템이 실제로는 지켜지지 않는데 그 사실이
어디에도 드러나지 않는다.

**strict 정책이라 기본 OFF다.** 켜는 파일만 opt-in 한다 — 자유 스케치 페이지에서 켜면 전부 위반이 된다.

## 파라미터

| 이름 | 기본값 | 설명 |
|---|---|---|
| `types` | `["FRAME","RECTANGLE","ELLIPSE","VECTOR","LINE","POLYGON","STAR"]` | 검사 대상 노드 타입. TEXT/GROUP/SECTION/INSTANCE/COMPONENT는 비대상 |
| `checkInsideComponent` | `false` | COMPONENT 정의 내부의 raw 요소까지 검사할지 |
| `exemptNamePattern` | — | 이 정규식에 걸리는 이름은 제외 (기획 킷·주석 등) |

```jsonc
{ "builtins": { "raw_node": { "enabled": true, "exemptNamePattern": "^(bg|divider)/" } } }
```

## 오탐과 의도적 스코프 축소

- **INSTANCE 내부 노드는 항상 제외.** 정의의 사본이라 독립 저작 대상이 아니다.
- COMPONENT 정의 안쪽은 기본 제외 — 컴포넌트 자체는 raw 도형으로 만들어야 하기 때문이다.
  (`checkInsideComponent: true`로 켤 수 있다.)
- 토큰 프리미티브(색 스와치 등)처럼 정당한 raw는 [`lint-ignore`](../suppress.md)로
  `{"rules":["raw_node"],"reason":"primitive"}`처럼 의도를 남겨 면제한다.

## 면제하는 법

한 페이지에 정당 raw와 진짜 위반이 섞이면 노드별 [`lint-ignore`](../suppress.md),
페이지 통짜로 성격이 같으면 page config로 끄는 편이 싸다.

## 구현

`packages/shared/src/lint/simple-rules.ts`
