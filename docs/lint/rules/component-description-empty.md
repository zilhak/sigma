# `component_description_empty`

| | |
|---|---|
| 기본 | **ON** (opt-out) |
| 스코프 | COMPONENT / COMPONENT_SET |
| 추가 왕복 | 없음 |
| 자동수정 | 없음 |

## 무엇을 잡나

COMPONENT 또는 COMPONENT_SET의 `description`이 비어 있거나 공백만 있는 것.

## 왜 필요한가

컴포넌트 description은 Figma의 에셋 패널과 인스턴스 툴팁에 그대로 노출되는, **재사용하는 사람이
읽는 유일한 설명**이다. 비어 있으면 이름만 보고 용도를 추측해야 하고, 비슷한 컴포넌트가 여럿일 때
무엇을 골라야 하는지 알 수 없다.

[컴포넌트 스펙 등록 정책](../component-spec-policy.md)의 `unlessDescription`도 이 필드를 본다 —
"규약에서 벗어나지만 이유가 있다"를 적는 자리이기도 하다.

## 파라미터

없음. `{ "enabled": false }`로 끄는 것만 가능하다.

## 오탐과 의도적 스코프 축소

- COMPONENT_SET의 개별 variant(자식 COMPONENT)까지 요구하지는 않는다 — 세트 단위 설명이면 충분한
  경우가 대부분이다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제.

## 구현

`packages/shared/src/lint/simple-rules.ts`
