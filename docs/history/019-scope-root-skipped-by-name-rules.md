# `nodeId` 스코프의 시작 노드를 이름·구조 규칙이 건너뛰었다 (017 의 나머지 절반)

## 증상

`sigma_lint` 를 `nodeId`/`path` 로 좁혀 부르면, **그 시작 노드 자신**이 이름·구조 규칙의 검사
대상에서 빠졌다. 같은 노드를 부모 스코프에서 재면 잡히고, 자기 자신을 스코프로 주면 0건이다.

`packages/server/__tests__/lint-scope-root.test.ts` 로 재현한 값 (실측, 2026-08-10):

| 스코프 | `default_name` |
|---|---|
| page (섹션이 roots) | 부모 프레임 검출 |
| `nodeId` = 섹션(부모) | 부모 프레임 검출 |
| `nodeId` = 그 프레임 자신 | **0건** |

`empty_container` 도 같다 — 빈 프레임을 부모 스코프에서 재면 잡히고, 그 프레임을 `nodeId` 로
주면 0건이었다.

## 왜 조용했나 (이게 진짜 문제다)

건수만 빠지는 게 아니라 **보고가 거짓말을 했다.** `engine.ts` 의 `markOptOut` 은 규칙이 켜져
있으면 대상이 무엇이든 `coverage.ran` 에 넣고, `run.ts` 의 `countByRule` 이 그 목록으로
`byRule` 을 채운다. 그래서 응답에 `default_name: 0` 이 실린다 — CLAUDE.md 가
*"실행된 규칙은 `byRule` 에 0 으로 키가 남는다"* 고 안내한 바로 그 신호가, 여기서는
**안 돌았는데 돌았다고** 나왔다. `docs/history/004`·`011`·`013` 과 같은 계열의 사고다.

## 원인

017 은 enrich 경로와 `annotation_layer` 만 고쳤다. 빌트인 이름/구조 규칙은 `lintLayout` 과 같은
호출부에 얹혀 있으면서 `roots`(= 시작 노드의 **자식들**)만 받았다. 017 이 기하 규칙을 건드리지
않은 사유("`scopeRoot` 를 **컨테이너**로 쓰므로 roots 에 자기 자신을 섞으면 `outside_section`·
`frame_padding` 의 전제가 바뀐다")는 맞지만, **이름 규칙에는 해당하지 않는 사유**였다.

영향 규칙은 2종이 아니라 8종이었다: `stray_pixel`·`default_name`·`empty_container`·`hidden_leaf`·
`fill_sizing_orphan`·`component_description_empty`·`raw_node`·`instance_default_name`.

그 결과 **한 번의 lint 안에서 규칙마다 보는 범위가 달랐다** — 커스텀 규칙과 enrich 기반 5종은
`scopeRootWithChildren` 덕에 시작 노드를 보는데, 위 8종은 못 봤다. `COMPONENT` 를 `nodeId` 로
찍으면 커스텀 규칙은 그것을 판정하는데 `component_description_empty` 는 침묵했다.

## 무엇을 했나

**1. 검사 대상을 컨테이너와 갈랐다** (`shared/src/lint/engine.ts`)

`selfRoots = ctx.scopeRoot ? [ctx.scopeRoot] : roots` 를 만들어, **노드 자신만 보고 판정되는
규칙**에만 준다: `stray_pixel`·`default_name`·`empty_container`·`hidden_leaf`·
`component_description_empty`·`instance_default_name`·`annotation_layer`.
`ctx.scopeRoot` 는 이미 자식이 붙은 "시작 노드 + 서브트리 전부"(`scopeContainer`)라 중복이 없다.

**2. 부모/조상이 필요한 규칙 2종은 일부러 뺐다** — 되돌리지 말 것.

- `fill_sizing_orphan` 은 부모를 못 찾으면 `'부모 없음(루트)'` 로 **위반을 낸다**
  (`simple-rules.ts`). 스코프 루트의 부모는 정의상 트리 밖이므로, 넣으면 오토레이아웃 부모 밑의
  정상 FILL 노드가 통째로 위반이 된다.
- `raw_node` 는 조상에 INSTANCE/COMPONENT 가 있으면 면제하는데, 스코프 루트는 조상을 볼 수
  없으므로 인스턴스 안의 정상 프레임이 "raw" 로 잡힌다.

두 규칙만 `roots` 를 그대로 쓴다. "이름 규칙이니까" 가 아니라 **"자기 자신만 보면 판정되는가"**
가 기준이다.

**3. `rootNode` 에 `meta` 를 실었다** (`figma-plugin/src/node-ops/tree.ts`)

여기서 한 번 더 물릴 뻔했다. `get_tree` 의 `rootNode` 는 `id/name/type/boundingBox` 뿐인
**껍데기**였다(017 이 "자식이 없는 껍데기" 라고만 적어 둔 그 값). meta 없이 1번만 하면:

- `component_description_empty` → `meta.description` 이 `undefined` → **`nodeId` 로 찍은 모든
  COMPONENT 가 "description 비어있음" 오탐**
- `empty_container` → `meta.hasVisibleFill` 을 못 읽어 이미지 프레임 오탐
- `hidden_leaf` → `meta.visible` 을 못 읽어 영영 침묵

그래서 meta 구성을 `buildNodeMeta()` 로 빼서 자식과 `rootNode` 가 **같은 것**을 쓰게 했다.
`fields:"geometry"` 에서는 자식과 마찬가지로 meta 를 싣지 않는다.

**4. `childCount` 를 덮어쓰지 않는다** (`server/src/lint/enrich.ts`)

`scopeRootWithChildren` 이 `childCount: roots.length` 로 덮고 있었다. `roots` 는 `omit`/`keep`/
`limit` 으로 걸러진 뒤라, 자식이 전부 걸러진 컨테이너가 "자식 0" 으로 보여 `empty_container`
오탐이 된다 — 3번으로 `rootNode` 가 진짜 `childCount` 를 싣게 되자 비로소 고칠 수 있었다.
구버전 플러그인은 이 값을 안 보내므로 그때만 `roots.length` 로 채운다.

**5. 인스턴스 내부 면제를 스코프 루트에도 걸었다** (`rootNodeInsideInstance`)

1번을 넣자마자 라이브 파일에서 걸렸다. `default_name`·`stray_pixel`·`empty_container` 는 인스턴스
내부를 면제하는데(`walkOutsideInstances`), 그 면제는 **조상**을 보고 정해진다. 스코프 루트의
조상은 트리 밖이라 규칙이 면제를 못 걸고, 스펙이 만든 `"Frame"` 래퍼를 그대로 위반으로 올린다.
실측: 통합 기획 파일 한 페이지에서 기본 이름 노드 **7870개**를 찾았는데 표본이 전부
`I226:…;196:…` 꼴, 즉 인스턴스 내부였다. 그대로 뒀으면 **조용한 누락을 시끄러운 오탐으로 바꾼**
셈이 됐을 것이다 — 이 세 규칙이 과거에 통째로 꺼져 있던 이유가 정확히 그 오탐이다.

조상을 아는 것은 플러그인뿐이라, `get_tree` 가 `rootNodeInsideInstance` 로 판정해 싣고
(`isInsideInstance`), 엔진은 그때만 스코프 루트를 뺀다(`exemptRoots`). `includeInsideInstances:
true`(스펙 자체를 감사할 때)면 면제가 없으므로 그대로 넣는다. `instance_default_name` 도 같이
묶었다 — 인스턴스 안쪽의 인스턴스는 **중첩 인스턴스**라 원래 대상이 아니다.

라이브 확인(2026-08-10): `I226:137353;196:91590`(이름 `Frame`, 인스턴스 내부)을 `nodeId` 로 검사 →
`rootNodeInsideInstance: true` 가 실려 오고 `byRule.default_name = 0`.

**6. 컨텍스트 수집도 스코프 루트를 포함시켰다** (`server/src/lint/run.ts`)

`collectInstanceComponentNames`·`collectSpecMasterIds` 가 `roots` 만 훑고 있었다. 엔진이 시작
노드를 검사하게 됐는데 여기서 빼면 **판정 근거만 없는 채로 규칙이 돈다**: 시작 노드가 INSTANCE
면 마스터 이름을 못 얻어 `instance_default_name` 이 침묵하고, 스펙 마스터면 스탬프를 못 읽어
그 안쪽 스펙 산물이 이름·좌표 오탐으로 쏟아진다.

부수 효과로 **기존 오탐 하나가 사라졌다**: INSTANCE 를 `nodeId` 로 검사하면 그 자식들이
`inside=false` 로 순회돼 스펙이 만든 "Frame" 래퍼가 전부 `default_name` 위반으로 나왔는데,
이제 시작 노드가 트리에 들어오면서 `walkOutsideInstances` 가 자식을 `inside=true` 로 본다.

## 되돌리면 안 되는 이유

- `selfRoots` 를 `roots` 로 되돌리면 → `nodeId` 스코프가 시작 노드를 조용히 건너뛰고 `byRule` 에
  0 을 실어 **clean 을 잘못 주장한다.**
- `fill_sizing_orphan`·`raw_node` 에까지 `selfRoots` 를 넓히면 → 정상 노드가 위반이 된다.
  "일관성" 을 이유로 통일하지 말 것. 기준은 일관성이 아니라 **부모 문맥이 필요한가** 다.
- `rootNode` 에서 `meta` 를 다시 빼면 → 1번이 오탐 생성기로 바뀐다. payload 걱정이라면 노드
  하나 분량이다.
- `childCount: roots.length` 로 되돌리면 → `omit` 을 쓴 호출에서 `empty_container` 가 오탐한다.
- `rootNodeInsideInstance` 를 "안 쓰는 필드" 로 보고 빼면 → 인스턴스 내부를 `nodeId` 로 찍는 순간
  스펙 래퍼가 이름 위반으로 쏟아진다. 이 필드는 **조상을 볼 수 없다는 구조적 한계의 보정**이다.

## 남은 것

`scopeRoot` 의 조상은 여전히 트리에 없다. 플러그인이 보정해 준 것은 "INSTANCE 안쪽인가" 하나뿐이라:

- `fill_sizing_orphan`·`raw_node` 는 시작 노드를 **판정하지 않는다.** "검사했는데 위반이 없다" 가
  아니라 **"판정하지 않았다"** 인데, 지금은 그 구분이 커버리지에 드러나지 않는다.
- 스펙 스탬프가 찍힌 **COMPONENT 마스터 내부**는 `rootNodeInsideInstance` 가 잡지 않는다
  (그 판정은 pluginData 조회가 필요해 플러그인 트리 순회만으로는 안 된다). 마스터 내부 노드를
  `nodeId` 로 직접 찍는 경우에만 해당하며, 현재 그런 사용은 없어 두었다.
