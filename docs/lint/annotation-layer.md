# 기획 레이어 (annotation-layer)

기획 목업에서 디자인 프레임 위에 **설명(주석)을 얹되, 디자인과 분리해 한 단위로 토글**하고 싶을 때
쓰는 컨테이너. 규칙 자체는 [rules/annotation-layer.md](rules/annotation-layer.md)를 보고, 여기서는
개념과 면제 계약을 설명한다.

- **정체 = 네이티브 FRAME.** 스펙 컴포넌트로는 만들 수 없다 — 스펙은 자식 인스턴스를 못 품고
  ([../component-spec.md](../component-spec.md)), 컴포넌트 인스턴스의 자식은 잠겨 섹션마다 다른 주석을
  담을 수 없다. 그래서 "채우는 컨테이너"는 일반 프레임이어야 한다.
- **생성 = `sigma_create_annotation_layer(sectionId)`.** 섹션을 덮는 투명 프레임(clip off)을 섹션 직속
  자식으로 만들고 pluginData `role="annotation-layer"`로 태깅한다. 이후 그 안에 `anno/*`·`wire/*`
  인스턴스를 자식으로 넣어 채운다.
- **인식 = pluginData(role), 이름 아님.** 이름 규약을 새로 만들지 않기 위함(이름은 자유·변경 가능).
  린트 핸들러가 SECTION 직속 FRAME 들의 `role` 키를 배치 조회해(getNodesData) 레이어 id 집합을 만들고
  엔진에 주입한다 — [lint-ignore suppress](suppress.md)와 같은 구조(TreeNode엔 pluginData가 안 실리므로
  엔진이 스스로 못 봄).
- **면제 범위.** 레이어 노드와 그 하위 서브트리는 [`card_overlap`](rules/card-overlap.md) ·
  [`frame_padding`](rules/frame-padding.md) · [`child_overflow`](rules/child-overflow.md) ·
  [`instance_orphan`](rules/instance-orphan.md)에서 제외. 디자인 프레임 위에 겹치는 게 정상이므로.
- **opt-in.** `annotation_layer` 규칙을 켠 페이지에서만 위 면제 + "섹션마다 레이어 필수" 강제가
  동작한다. **면제 혜택은 강제를 받아들이는 대가로 주어진다.** 보통 기획 페이지에만 per-page config로 켠다:

  ```
  sigma_set_page_data({ key: "lint", value: '{"builtins":{"annotation_layer":{"enabled":true}}}' })
  sigma_lint({ configMode: "per-page" })   // 또는 merge
  ```

## 관련 규칙

기획 레이어를 켜면 함께 쓸 만한 opt-in 규칙이 둘 더 있다:

- [`annotation_marker_pair`](rules/annotation-marker-pair.md) — 마커 ↔ 범례 짝과 왕복 링크
- [`annotation_marker_gap`](rules/annotation-marker-gap.md) — 마커가 대상을 덮거나 떠 있는 것
