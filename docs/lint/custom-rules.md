# 커스텀 규칙

`config.custom` 배열의 각 항목은 `id`가 필수이고, 아래 두 형태 중 하나다.

## (a) JSON 선언적 (`kind: "match"`, 기본값이라 생략 가능)

```jsonc
{
  "id": "card-radius-12",
  "select": { "type": "FRAME", "namePattern": "Card" },
  "check": { "op": "equals", "field": "cornerRadius", "value": 12 },
  "message": "\"{name}\" cornerRadius 는 12여야 함 (현재 {actual})"
}
```

- `select`: `{ type?, namePattern? }` — 트리 전체에서 매칭되는 모든 노드에 적용.
- `check.op`: **5개뿐이며 더 늘리지 않는다**(연산자를 계속 추가하면 결국 축소판 언어를
  재발명하게 되므로 — 관계형/유도값 검사가 필요하면 predicate로).

  | op | 옵션 | 설명 |
  |----|------|------|
  | `equals` | `value` | `field === value` |
  | `range` | `min`, `max` | 숫자 범위(경계 포함) |
  | `regex` | `pattern` | 문자열 필드에 정규식 매치 |
  | `oneOf` | `values` | 배열 값 중 하나 |
  | `exists` | — | 필드가 `undefined`/`null` 아님 |

- `field`는 `cornerRadius`, `fills[0].opacity` 같은 점/대괄호 경로.
- `message`는 `{name}`/`{actual}` 치환 지원(생략 시 기본 메시지).
- 노드가 보는 필드: `id/name/type/x/y/width/height/childCount` + `get_node_info` 상세
  필드(`fills/strokes/strokeWeight/cornerRadius/characters/fontSize/fontName/
  textAlignHorizontal/textAlignVertical/layoutMode` 등). 혼합값(`figma.mixed`)은
  문자열 `"mixed"`로 내려온다.

> 같은 5개 연산자를 `sigma_find_node`의 `where`도 쓴다 — 엔진 코드
> (`shared/src/lint/json-rule.ts`의 `queryNodes`)가 동일하다.

## (b) JS predicate (`kind: "predicate"`)

```jsonc
{
  "id": "modal-needs-overlay-sibling",
  "kind": "predicate",
  "timeoutMs": 2000,
  "code": "export default function(node, ctx) {\n  if (node.type !== 'FRAME' || !node.name.startsWith('Modal/')) return null;\n  if (!ctx.getSiblings(node.id).some((s) => s.name === 'Overlay')) {\n    return { message: `\"${node.name}\" 옆에 'Overlay' 형제가 없음` };\n  }\n  return null;\n}"
}
```

- `code`는 **`export default function(node, ctx) { ... }` 형태만** 허용(계약 위반이면 실행 전에 에러로 보고됨).
- 위반이면 `{ message }` (선택적으로 `{ nodes: [...] }`로 관련 노드 지정, 생략 시 검사 대상 노드 자신),
  통과면 `null` 반환.
- `ctx.getSiblings(nodeId)` / `ctx.getAncestors(nodeId)` / `ctx.getChildren(nodeId)` — 트리 관계를 노드
  객체 배열로 반환. 현재 이 3개뿐이다(추가 헬퍼는 [design-notes.md](design-notes.md) §데이터 갭 참조).
- **격리 실행**: 서버가 `node:worker_threads`로 별도 Worker에서 실행한다(Bun의 `node:vm`은 샌드박싱
  용도로 fragile해 회피 — 실측 검증 완료). 규칙 하나의 전체 실행에 타임아웃(기본 2000ms, `timeoutMs`로
  조절)이 있고, 초과하면 `terminate()`로 강제 종료된다 — 무한루프를 넣어도 서버 프로세스는 멈추지
  않는다(라이브 검증 완료: `while(true){}` 규칙이 800ms 타임아웃으로 정상 중단됨).
- 규칙 하나가 타임아웃/예외를 내도 **그 규칙만 에러로 기록되고 나머지 규칙·빌트인은 계속 진행**된다
  (배열 입력 부분 실패 허용 관례와 일관).
- predicate는 **라이브 Figma 객체가 아니라 이미 서버가 들고 있는 직렬화된 노드 데이터 위에서만
  동작**한다 — 문서를 직접 조작할 수 없다.

## 커스텀 규칙은 read-only

`fix` 콜백을 가질 수 없다. 임의 JS가 문서를 직접 변형하게 하면 "안전한 것만 자동수정" 성격이
깨지기 때문이다. 자동수정이 필요하면 에이전트가 lint 결과를 보고 `sigma_modify_node` 등으로 직접 고친다.

구현: `packages/shared/src/lint/json-rule.ts` · `packages/server/src/lint/run-custom-rule.ts`
