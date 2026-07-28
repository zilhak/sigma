# `content_above_annotation`

| | |
|---|---|
| 기본 | **ON** (opt-out) |
| 스코프 | 같은 부모 안 형제 간 |
| 추가 왕복 | 없음 (TreeNode.meta.specAlias 만으로 판정) |
| 자동수정 | 없음 |

## 무엇을 잡나

같은 부모 안에서, 기획용(anno/wire 컴포넌트 스펙 프리셋) 컴포넌트보다 **나중에(z-order 위)**
그려지는 일반 콘텐츠. z-order가 위인 노드가 아래 노드를 가릴 수 있으므로, 마커·범례 같은 기획
주석이 일반 콘텐츠에 가려지는 상태를 잡는다.

기획용은 하나로 취급하지 않는다 — 여러 개가 한 프레임에 있어도 "z-order 끝에 몰려있기만" 하면
통과이고, 반드시 마지막 자식이어야 하는 것은 아니다. 기획용 뒤에 일반 콘텐츠가 하나라도 있으면
그 콘텐츠만 위반으로 잡힌다.

## 왜 필요한가

기획 레이어(anno/wire)는 문서화 목적이라 항상 위에서 보여야 하는데, 실측 결과 사람이 나중에
일반 콘텐츠를 추가하면서 z-order상 기획 레이어보다 위에 넣는 실수가 반복됐다. 이름 기반 휴리스틱은
`instance_orphan`의 anno/wire 예외에서 이미 리네임에 뚫리는 걸 확인했으므로, 이 규칙은 이름이
아니라 컴포넌트 스펙 pluginData 스탬프(`sigma-spec`)의 alias로 판별한다 — 레이어를 사람이
리네임해도 판정이 흔들리지 않는다.

## 판별 대상 (기본 alias 9종)

`packages/shared/src/lint/annotation-order.ts`의 `DEFAULT_ANNOTATION_ALIASES`:

- anno 4종: `region` · `marker` · `legend` · `label`
- wire 5종: `box` · `section_title` · `item` · `kv` · `note`

alias는 스탬프 문자열만으로 판별하므로(스탬프에 namespace가 없음), 이론상 다른 namespace가 같은
alias를 쓰면 오탐할 수 있다 — 이 9개는 내장 프리셋 전용 단어라 실질 위험은 낮다(문서화된 근사).

## 파라미터

`aliases` — 배열. 기본 9종에 **추가**로 기획용 취급할 alias(자체 컴포넌트 스펙에서 쓰는 것 등).
전체 교체가 아니라 합집합이다.

```jsonc
{ "content_above_annotation": { "aliases": ["my_custom_note"] } }
```

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제, 또는 `{ "enabled": false }`로 룰 자체를 끈다.

## 구현

`packages/shared/src/lint/annotation-order.ts` — 엔진(`runBuiltinRules`) 안에서 직접 실행된다
(`fully_occluded_sibling` 등과 달리 enrich 조회가 필요 없어 `ENGINE_EXTERNAL_RULE_IDS`에 없음).
