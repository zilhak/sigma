# `annotation_layer`

| | |
|---|---|
| 기본 | **OFF** (opt-in) |
| 스코프 | 모든 SECTION (중첩 포함) |
| 추가 왕복 | pluginData 배치 조회 (`getNodesData`) |
| 자동수정 | 없음 |

## 무엇을 잡나

모든 SECTION이 [기획 레이어](../annotation-layer.md)를 직속 자식으로 **최소 1개** 갖도록 강제한다.
없으면 위반이다.

## 왜 필요한가 — 켜는 순간 면제가 따라온다

이 룰의 핵심은 검출이 아니라 **계약**이다. 켜면 두 가지가 동시에 일어난다:

1. 모든 섹션에 기획 레이어가 있어야 한다 (강제)
2. 태깅된 레이어와 그 하위는 [`card_overlap`](card-overlap.md) · [`frame_padding`](frame-padding.md) ·
   [`child_overflow`](child-overflow.md) · [`instance_orphan`](instance-orphan.md)에서 **자동 면제**된다

기획 레이어는 디자인 위에 겹쳐 덮는 투명 오버레이라 기하 검사가 무의미하다. 면제가 없으면 주석을
얹을 때마다 겹침·넘침 위반이 쏟아진다. **면제 혜택은 "모든 섹션에 레이어" 강제를 받아들이는 대가로
주어진다** — 그래서 수동 `lint-ignore`를 섹션마다 붙일 필요가 없다.

## 파라미터

없음. `{ "enabled": true }`로 켜는 것만 가능하다.

보통 기획 페이지에만 per-page config로 켠다:

```jsonc
sigma_set_page_data({ key: "lint", value: '{"builtins":{"annotation_layer":{"enabled":true}}}' })
sigma_lint({ configMode: "per-page" })   // 또는 merge
```

## 판정은 이름이 아니라 pluginData

노드의 sharedPluginData `("sigma", "role") == "annotation-layer"`로 판정한다. 이름 규약을 새로 만들지
않기 위함이라, 레이어 이름은 자유롭게 바꿔도 된다.

TreeNode에는 pluginData가 실리지 않으므로, 서버가 SECTION 직속 FRAME들의 `role` 키를 배치 조회해
레이어 id 집합을 만들어 엔진에 주입한다([`lint-ignore`](../suppress.md)와 같은 구조).

레이어 생성·태깅은 `sigma_create_annotation_layer(sectionId)`.

## 오탐과 의도적 스코프 축소

- 중첩 섹션도 각각 레이어를 요구한다. 상위 섹션의 레이어가 하위를 덮어 주지 않는다.
- 디자인 전용 페이지에서 켜면 모든 섹션이 위반이 된다 — 기획 페이지에만 켜는 것을 전제한다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 섹션별 면제. 페이지 성격이 다르면 아예 켜지 않는다.

## 관련 규칙

- [`annotation_marker_pair`](annotation-marker-pair.md) — 레이어 안 마커 ↔ 범례 짝
- [`annotation_marker_gap`](annotation-marker-gap.md) — 마커와 대상의 거리

## 구현

`packages/shared/src/lint/simple-rules.ts` · 개념 설명은 [../annotation-layer.md](../annotation-layer.md)
