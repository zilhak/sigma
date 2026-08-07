# `fully_occluded_sibling`

| | |
|---|---|
| 기본 | **ON** (opt-out) |
| 스코프 | 같은 부모 안 형제 간 |
| 추가 왕복 | **`get_nodes_info` 1회** (fills/opacity 조회) |
| 자동수정 | 없음 |

## 무엇을 잡나

같은 부모 안에서 나중에 그려지는(z-order 위) 형제가 **완전 불투명한 SOLID fill로 바운딩박스 전체를
덮어**, 어떤 상태에서도 절대 보이지 않는 노드.

## 왜 필요한가

[`hidden_leaf`](hidden-leaf.md)의 **암묵적 버전**이다. `visible`은 true라 숨긴 것으로 잡히지 않지만
결과적으로 화면에 없다. 사람이 보고 알아채기가 특히 어렵다 — 레이어 패널에서는 멀쩡해 보이고,
캔버스에서는 덮은 노드만 보이기 때문이다.

## 비용 주의

이 룰이 **켜져 있으면 `config.custom` 유무와 무관하게 `get_nodes_info` 왕복이 한 번 추가된다.**
fills/opacity는 TreeNode에 실리지 않기 때문이다. 큰 페이지에서 lint가 느리다면 이 룰이 원인일 수 있다.

## 파라미터

없음. `{ "enabled": false }`로 끄는 것만 가능하다.

## 오탐과 의도적 스코프 축소

전부 **오탐 방지를 우선한 의도적 축소**다. 못 잡는 경우가 있어도 잘못 잡지는 않는 쪽을 택했다.

- **덮는 노드는 RECTANGLE / FRAME / COMPONENT / INSTANCE만 인정.** 원·별 등 비사각형은 바운딩박스
  근사가 부정확해 실제로는 안 덮는데 덮는다고 판정할 수 있다.
- **그라디언트·이미지 fill은 제외.** 완전 불투명을 증명할 수 없다.
- **형제 여럿이 조각조각 합쳐 덮는 경우는 못 잡는다.** 단일 형제가 통째로 덮을 때만 판정한다.

## 면제하는 법

[`lint-ignore`](../suppress.md)로 노드별 면제.

## 구현

`packages/shared/src/lint/occlusion.ts` — 엔진 안에서 실행되지 않고, 서버가 LintNode로 enrich한 뒤
`fullyOccludedSiblingRule`을 별도로 호출한다(opt-out 확인은 동일).
