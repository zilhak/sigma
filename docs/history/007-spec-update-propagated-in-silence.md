# 007. 스펙 in-place 재등록이 침묵 속에 전파돼 다른 페이지를 깨뜨렸다

> 관련 코드: `packages/figma-plugin/src/node-ops/component-spec.ts` (`collectSpecInstanceUsage`),
> `packages/server/src/mcp/handlers/component-spec.ts` (`impact`, 삭제 전 사용처 확인)
> 2026-08-07 실측 · 2026-08-08 수정

## 증상

`sigma_create_component_spec` 로 **이미 등록된 alias 를 다시 등록**하면 마스터가 갱신되고
**모든 인스턴스에 자동 전파된다.** 의도된 동작이고 유용하다. 문제는 응답이 **무엇이 얼마나
바뀌었는지 말해 주지 않는다**는 것이었다 — 인스턴스가 몇 개인지, 어느 페이지에 있는지,
루트 크기가 이전 등록과 달라졌는지 전부 없었다.

크기가 바뀌면 인스턴스 기하가 통째로 달라지므로 그 위에 얹힌 **주석 마커·영역 표시·인접
배치가 전부 어긋난다.** 그런데 그 일은 **화면 밖 다른 페이지에서** 일어난다.

같은 사고가 **두 번** 났다:

1. **삭제 확인창 폭 420 → 360.** 라이브 실측에 맞춘 정당한 교정이었고 응답도 정상이었다.
   그런데 이 스펙을 쓰던 **파드 목록 섹션의 마커가 대상에서 어긋났다** — 창이 60px 좁아져
   마커가 가리키던 좌표가 창 밖이 됐다. 나중에 `annotation_marker_gap` 을 돌려서야 발견.
2. **`sec_empty_data` → `oneui/table_status_empty` 교체**(32px → 36px). 같은 이유로
   **노드 목록 섹션의 마커가 떴다.**

사용처는 1번 이후 *"스펙 교정 뒤 `annotation_marker_gap` 재실행 필수"* 를 규칙으로 적어 뒀지만,
**사람이 매번 기억해야 하는 규칙**이라 2번을 못 막았다.

## 무엇을 했나

- in-place 갱신 응답에 **`impact`** 를 싣는다 — `isUpdate` / `sizeChanged` / `previousSize` /
  `newSize` / `instances`(개수 + 페이지별 집계). 크기가 바뀌고 인스턴스가 있을 때만
  "그 페이지들에 lint 를 다시 돌리라" 는 문구를 붙인다.
- 삭제 경로(`deleteNode:true`)는 **인스턴스가 남아 있으면 거부**하고 개수·페이지를 돌려준다
  (`force:true` 로만 강행). 예전엔 이걸 확인하려고 커스텀 lint 를 `scope:"file"` 로 37페이지에
  돌렸고, 그러고도 한 번 놓쳐 다른 화면의 인스턴스를 뒤늦게 발견했다.

## 전제 정정 — "전 페이지 스캔"이 필요 없다

처음엔 비용을 걱정해 `impactScan` 옵션·스캔 상한·"크기 변화 시에만" 같은 완화안을 셋이나
설계했는데, **전부 불필요했다.** Figma API 가 이 조회를 직접 준다:

```ts
const master = figma.getNodeById(record.componentNodeId) as ComponentNode;
master.instances   // ← 전 페이지의 인스턴스 전부, 트리 순회 없음
```

레지스트리가 이미 `componentNodeId` 를 들고 있어 추가 입력도 없다. 그래서 옵션을 만들지
않았다 — 인자가 하나 늘면 설명·검증·문서가 따라 늘고, 조회가 싼데 끌 이유가 없다.

⚠️ 이 플러그인은 **full-document access** 라서 `.instances` 가 동기로 동작한다
(manifest 에 `documentAccess:"dynamic-page"` 가 없고, `page.ts` 가 `figma.root.children` 을
동기로 훑는다). Figma 가 dynamic-page 를 강제하게 되면 `loadAllPagesAsync()` 선행이
필요해지므로, **`.instances` 접근을 `collectSpecInstanceUsage` 한 곳에 모아 뒀다.**

## 되돌리면 안 되는 이유

- **크기가 바뀌었다고 등록을 막지 않는다.** 그 교정들은 근사치를 실측값으로 바꾼 성과였다.
  목적은 **차단이 아니라 통지**다. 반대로 `deleteNode` 는 파괴적이라 기본 거부가 맞다.
- **마커를 자동으로 옮기려 하지 않는다.** 어디로 옮길지는 기획 판단이다 — 실제로 마커 94건을
  일괄 이동했다가 "영역 지시 마커는 멀리 있는 게 정상" 이라 오작동을 냈다.
- **개별 인스턴스 id 는 싣지 않는다.** 수천 개면 응답이 커진다. 페이지별 `count` 면 충분하다.
- `instances.source` 를 남겨 **0 이 "정말 없다" 인지 "못 찾았다" 인지** 구분되게 했다.
  삭제 판단에 쓰려면 이 구분이 필수다(조회 실패는 `instancesUnknown` 으로 드러난다).
