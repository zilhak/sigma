# 빌트인 규칙 24종

룰 1개 = 파일 1개. **룰을 추가하면 여기 행과 `<id>.md` 파일을 함께 만든다** — 파일이 없으면
정합성 테스트가 실패한다. id의 정본은 `packages/shared/src/lint/engine.ts`의 `ALL_BUILTIN_RULE_IDS`.

## 기본 ON (opt-out) — 15종

미기재 시 켜져 있다. `{ "enabled": false }`로 끈다.

| 룰 | 한 줄 | 추가 왕복 | 자동수정 |
|---|---|---|---|
| [`outside_section`](outside-section.md) | 페이지 직속에 섹션 아닌 배치 노드 금지 | — | — |
| [`section_overlap`](section-overlap.md) | 형제 SECTION끼리 겹침 금지 | — | — |
| [`section_gap`](section-gap.md) | 이웃 섹션 간 간격 부족(라벨이 경계를 가림) | — | — |
| [`card_overlap`](card-overlap.md) | 섹션 안 직속 카드끼리 겹침 금지 | — | — |
| [`frame_padding`](frame-padding.md) | 섹션 안 프레임 여백 부족 | — | **있음** |
| [`instance_orphan`](instance-orphan.md) | 래퍼 없이 뜬 INSTANCE | — | — |
| [`component_needs_frame`](component-needs-frame.md) | 섹션 직속 COMPONENT/GROUP 금지 | — | — |
| [`child_overflow`](child-overflow.md) | 자식이 로컬좌표 기준 부모 밖 | — | **있음** |
| [`stray_pixel`](stray-pixel.md) | 비정수 좌표/크기 | — | — |
| [`default_name`](default-name.md) | `Rectangle 123` 류 기본 이름 방치 | — | — |
| [`empty_container`](empty-container.md) | 자식 없는 FRAME/GROUP | — | — |
| [`hidden_leaf`](hidden-leaf.md) | `visible:false`로 트리에 잔존 | — | — |
| [`fill_sizing_orphan`](fill-sizing-orphan.md) | FILL인데 부모가 오토레이아웃 아님 | — | — |
| [`component_description_empty`](component-description-empty.md) | COMPONENT description 비어있음 | — | — |
| [`fully_occluded_sibling`](fully-occluded-sibling.md) | 불투명 형제에 완전히 덮여 절대 안 보임 | `get_nodes_info` | — |

## opt-in (기본 OFF) — 9종

`{ "enabled": true }`로 켜야 실행된다. strict 정책이거나 오탐이 많아 파일마다 선택하게 둔 것들이다.

| 룰 | 한 줄 | 추가 왕복 | 비고 |
|---|---|---|---|
| [`raw_node`](raw-node.md) | 등록 컴포넌트 대신 raw 도형으로 그린 노드 | — | "쓰는 건 전부 사전 정의" 정책 |
| [`annotation_layer`](annotation-layer.md) | 섹션마다 [기획 레이어](../annotation-layer.md) 필수 | pluginData 배치 조회 | 켜면 기하 규칙 **자동 면제** |
| [`instance_default_name`](instance-default-name.md) | INSTANCE 이름이 마스터명 그대로 | `get_nodes_info` | |
| [`content_spread`](content-spread.md) | 본진에서 떨어진 이상치 | — | **페이지 루트 전용** |
| [`origin_anchor`](origin-anchor.md) | 최상위 섹션 하나는 원점 근처에서 시작 | — | **페이지 루트 전용** |
| [`instance_resized_from_spec`](instance-resized-from-spec.md) | 작은 스펙 인스턴스를 컨테이너 대용으로 늘림 | `get_nodes_info` | |
| [`annotation_marker_pair`](annotation-marker-pair.md) | 마커 ↔ 범례 짝·왕복 링크 | enrich | |
| [`annotation_marker_gap`](annotation-marker-gap.md) | 마커가 대상을 덮거나 떠 있음 | `get_tree` `includeAbsolute` | |
| [`font_not_default`](font-not-default.md) | 파일 기본 폰트와 다른 TEXT | 문서 `fonts.default` | 설정 없으면 판정 안 함 |

## 찾기 쉬움 (findability)

"페이지를 열었는데 내용이 어디 있는지 모르겠다"를 막는 규칙군. Figma에서 사람이 콘텐츠를 찾는
수단은 셋뿐이고, 각각을 맡는 룰이 있다.

| 수단 | 무너지는 원인 | 담당 규칙 |
|---|---|---|
| zoom-to-fit (Shift+1) | 멀리 떨어진 이상치 노드 하나가 fit 범위를 삼킴 | [`content_spread`](content-spread.md) (opt-in) |
| 캔버스의 섹션 라벨 | 콘텐츠가 섹션 밖에 있음 | [`outside_section`](outside-section.md) (기본 ON) |
| 레이어 패널 이름 | `Frame 123` 같은 기본 이름 방치 | [`default_name`](default-name.md) (기본 ON) |

**효과가 가장 큰 건 `content_spread`다.** 나머지 둘은 이미 기본 ON이므로, 못 찾겠는 페이지가 있으면
먼저 `sigma_lint`를 돌려 원인이 이상치인지 구조인지부터 확인한다.

## 추가 왕복이란

TreeNode에 없는 정보가 필요한 룰은 서버가 별도 조회를 한 번 더 한다. **그 룰이 켜졌을 때만** 비용을
치른다(`packages/server/src/mcp/handlers/lint.ts`의 `needs*` 플래그).

## 공통 면제

모든 룰은 [노드 단위 억제](../suppress.md)(`lint-ignore`)로 노드별 면제가 가능하다.
페이지 통짜로 성격이 같으면 page config로 끄는 편이 싸다.
