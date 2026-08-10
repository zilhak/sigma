# `nodeId` 스코프의 시작 노드 자신이 한 번도 검사되지 않았다

## 증상

섹션 하나를 `sigma_lint({nodeId:"<섹션>"})` 로 검사하면 **그 섹션을 대상으로 하는 규칙이 조용히 0건**이었다.

실측(통합 기획 파일 Native Platform, 2026-08-10):

| 스코프 | 조작 | 결과 |
|---|---|---|
| `scope:"page"` | 범례 하나를 `legend1` → `legend㉟` 로 바꿔 짝을 깸 | `anno-pair-orphan` **1건 발화** → 복구 후 0 |
| `nodeId`(그 섹션) | 같은 조작 | **0건** |

`anno-pair-orphan` 은 `n.type==='SECTION'` 인 노드에서 마커·범례 번호를 모아 짝을 맞춘다.
`nodeId` 스코프에서는 그 SECTION 이 **검사 대상 목록에 아예 없었다.**

빌트인 `annotation_layer`(섹션마다 기획 레이어가 있어야 한다) 도 같은 이유로 돌지 않았다.
그래서 "섹션 스코프로 재면 `annotation_layer` 는 검사되지 않는다" 가 한동안 **사용법 상식**처럼 굳어 있었다.

## 원인

`get_tree` 는 스코프 시작 노드를 `rootNode` 로, 그 자식들을 `children` 으로 준다.
lint 는 `children` 만 `roots` 로 받아 규칙을 돌렸다.

```ts
const roots = tree.children as TreeNode[];
const scopeRoot = tree.rootNode as TreeNode | undefined;   // ← 기하 규칙에만 쓰이고 있었다
```

`scopeRoot` 는 이미 있었지만 **기하 규칙(`child_overflow`·`outside_section`)의 컨테이너 판정에만**
쓰였고, 노드를 훑는 경로(커스텀 규칙용 `enrichIfNeeded`, 빌트인 `annotation_layer`)에는 전달되지 않았다.

페이지 전체 검사에서는 섹션이 `roots` 에 들어오므로 같은 규칙이 정상 동작한다 —
**스코프를 좁혔을 때만 어긋나는 차이**라 눈에 띄지 않았다.

## 무엇을 했나

`roots` 는 `scopeRoot` 의 자식이므로 `[scopeRoot]` 로 시작하면 같은 서브트리를 전부 덮으면서
시작 노드 자신도 포함된다. 두 경로에 그것만 적용했다.

- `enrichIfNeeded(config, roots, …, scopeRoot?)` — 상세 조회·`buildLintNodes` 의 기준을
  `scopeRoot ? [scopeRoot] : roots` 로. 커스텀 규칙 전부 + enrich 기반 빌트인
  (`fully_occluded_sibling`·`annotation_marker_pair`·`_gap`·`font_not_default`·`instance_resized_from_spec`)이 함께 고쳐진다.
- `annotationLayerRule(ctx.scopeRoot ? [ctx.scopeRoot] : roots, layerIds)`.

### ⛔ 그 "그것만" 이 처음엔 틀렸다 — `rootNode` 는 자식이 없다

첫 수정은 검사 대상을 그냥 `[scopeRoot]` 로 바꿨다. **더 나빠졌다.**

`get_tree` 의 `rootNode` 는 `{id, name, type, boundingBox}` 짜리 **껍데기**고 자식은 형제 필드
`children` 으로 따로 온다. 그래서 `[scopeRoot]` 는 시작 노드를 얻는 대신 **서브트리를 통째로 잃는다**:

- 커스텀 규칙이 SECTION **하나만** 보게 되어, 그 안의 마커·범례가 없으니 짝 검사는 여전히 0건.
- `annotation_layer` 는 자식이 없으니 "이 섹션에 기획 레이어가 없다" 는 **오탐**을 냈다
  (레이어가 멀쩡히 있는 섹션에서).

증상이 "고치기 전" 과 똑같아서(짝 검사 0건) **고쳐진 줄 알기 쉬웠다.** 대조군을 돌리지 않았으면
그대로 넘어갔을 것이다.

바로잡은 형태 = `scopeRootWithChildren(scopeRoot, roots)` — `roots` 가 `scopeRoot` 의 자식이므로
그것을 도로 붙여 **시작 노드 + 서브트리 전부**를 만든다. 회귀 테스트
`packages/server/__tests__/lint-scope-root.test.ts` 가 자식·손자가 남는지와
"껍데기만 넣으면 하나뿐" 대조군을 함께 잡는다.

**기하 규칙 경로(`lintLayout(roots, …)`)는 건드리지 않았다.** 그쪽은 `scopeRoot` 를 이미
"컨테이너" 로 쓰고 있어서, roots 에 자기 자신을 섞으면 `outside_section`·`frame_padding` 의
전제가 바뀐다. 필요한 것은 "시작 노드도 **검사 대상**" 이지 "시작 노드가 **형제**" 가 아니다.

## 되돌리면 안 되는 이유

되돌리면 **섹션 스코프 검사가 다시 조용히 통과한다.** 이게 특히 나쁜 이유는,
큰 페이지에서 `scope:"page"` 가 완주하지 못해(012·015) **"큰 페이지는 nodeId 스코프로 잰다"** 가
권장 절차가 된 상태였기 때문이다. 즉 이 구멍은 **가장 큰 파일에서만** 벌어지고,
그 파일들이야말로 검사가 가장 필요한 곳이다.

실제로 이 구멍이 열려 있는 동안 만들어진 섹션들은 짝 검사를 한 번도 통과한 적이 없다.

## 회귀 테스트

- `packages/shared/__tests__/lint-engine.test.ts`
  — "annotation_layer 규칙 ON — 스코프 루트가 그 섹션이어도 검사한다".
  `scopeRoot` 를 주면 발화하고, **안 주면 발화하지 않는** 대조군을 같은 테스트에 넣었다.
  대조군이 없으면 "원래 0건이라 통과" 와 구분되지 않는다.
- `packages/server/__tests__/lint-scope-root.test.ts`
  — 검사 대상에 시작 노드가 들어가는지 + **서브트리를 잃지 않는지**(위 함정) + 껍데기 대조군.

## 라이브 확인

통합 기획 파일 L1-2 섹션 `226:161556` 에서 범례 하나의 번호를 짝 없는 값으로 바꿨을 때
`nodeId` 스코프로 **`anno-pair-orphan` 1건 발화 → 이름 복구 후 0건**.
`annotation_layer` 오탐도 사라졌다(as-is 0건).

⚠️ 이때 base config 를 안 주면(`configPath`·`config` 없이) base 는 **문서 저장 `lint`** 가 되는데
그 파일의 문서 base 는 `custom: []` 이라 **커스텀 규칙이 페이지 저장분만 돌았다** — 대조군이
발화하지 않아 하마터면 "아직 안 고쳐졌다" 로 읽을 뻔했다. 판별은 응답의 `customRan` 이다.

## 두 번째로 틀린 곳 — page 스코프에 컨테이너를 줘 버렸다

`scopeRootWithChildren(scopeRoot, roots)[0]` 을 **무조건** 컨테이너로 넘겼는데,
`scopeRoot` 가 없으면(page 스코프) 그 헬퍼는 `roots` 를 그대로 돌려주므로 `[0]` 은 **첫 섹션**이다.
그 섹션이 자기 자신의 컨테이너가 되어:

- `child_overflow` 가 *"섹션 X 가 섹션 X 밖으로 나감"* 이라는 말이 안 되는 위반을 냈다
  (실측: 기획 4페이지 전부 — 초과치가 그 섹션의 음수 페이지 좌표와 정확히 일치했다).
- `kind` 가 `'page'` 가 아니게 되어 **`outside_section` 이 통째로 안 돌았다**.

`scopeContainer(scopeRoot, roots)` 로 갈랐다 — 있으면 자식 붙인 시작 노드, 없으면 **undefined**.
회귀 테스트는 두 방향을 다 잡는다(`lint-scope-root.test.ts`).

⭐ 이 두 번의 실수는 형태가 같다 — **"시작 노드도 검사 대상" 과 "시작 노드가 컨테이너" 를 한 값으로
처리하려다** 한 번은 서브트리를 잃고, 한 번은 없는 컨테이너를 만들었다. 둘은 다른 개념이다.
