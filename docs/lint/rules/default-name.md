# `default_name`

| | |
|---|---|
| 기본 | **ON** (opt-out) |
| 스코프 | 모든 노드 |
| 추가 왕복 | 없음 |
| 자동수정 | 없음 (이름은 사람이 정한다) |

## 무엇을 잡나

`Rectangle 123` / `Frame 45` / `Group 12` 같은 Figma 기본 이름이 그대로 방치된 노드.

## 왜 필요한가

[찾기 쉬움](README.md#찾기-쉬움-findability) 세 수단 중 **레이어 패널 이름**을 담당한다. 기본 이름이
쌓이면 레이어 패널이 `Frame 1`, `Frame 2` … 로 채워져 어떤 것이 무엇인지 열어 보지 않고는 알 수 없다.

## 파라미터

없음. `{ "enabled": false }`로 끄는 것만 가능하다.

INSTANCE 이름이 마스터명 그대로인 경우는 별도 룰([`instance_default_name`](instance-default-name.md), opt-in)이 맡는다.

## 오탐과 의도적 스코프 축소

- **INSTANCE 내부 노드는 기본 제외.** 인스턴스 안쪽 이름은 마스터가 정하므로 그 자리에서 못 고친다.
- **SVG 임포트 산물(VECTOR)은 기본 제외.** `sigma_create_node_from_svg`로 들어온 벡터는 Figma가 자동으로
  이름을 붙이는데, 이걸 전부 위반으로 잡으면 아이콘 하나 넣을 때마다 수십 건이 난다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제.

## 구현

`packages/shared/src/lint/simple-rules.ts`
