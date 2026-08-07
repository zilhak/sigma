# `instance_default_name`

| | |
|---|---|
| 기본 | **OFF** (opt-in) |
| 스코프 | INSTANCE |
| 추가 왕복 | **`get_nodes_info` 1회** (`componentName` resolve) |
| 자동수정 | 없음 |

## 무엇을 잡나

[`default_name`](default-name.md)의 인스턴스 판. INSTANCE 이름이 **마스터 컴포넌트 이름 그대로**면
고유 이름을 안 준 것으로 보고 위반 처리한다.

## 왜 필요한가

인스턴스가 전부 마스터명이면 레이어 패널이 `Button`, `Button`, `Button` … 으로 채워져 어느 것이
"저장" 버튼이고 어느 것이 "취소"인지 열어 봐야 안다. 이름을 주면 레이어 패널만으로 화면 구조가 읽힌다.

**기본 ON이면 폭주한다.** 실화면에는 마스터명을 유지한 인스턴스가 흔해서, strict 네이밍을 원하는
파일만 opt-in 하도록 뒀다.

## 파라미터

없음. `{ "enabled": true }`로 켜는 것만 가능하다.

## 비용

마스터명은 TreeNode에 없어 서버가 `get_nodes_info`의 `componentName`을 resolve해 판정한다 —
**규칙이 켜졌을 때만** 1왕복 추가.

## 오탐과 의도적 스코프 축소

- **중첩 인스턴스(다른 INSTANCE 내부)는 제외.** 정의의 사본이라 그 자리에서 이름을 못 고친다.
- 아이콘처럼 마스터명이 곧 의미인 경우(`icon/check`)는 이름을 바꿀 이유가 없다 —
  그런 파일은 `exemptNamePattern`이 없으므로 노드별 면제나 page config로 처리한다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제.

## 구현

`packages/shared/src/lint/simple-rules.ts`
