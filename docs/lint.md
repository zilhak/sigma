# Lint (`sigma_lint`) — 빌트인 카탈로그 + 커스텀 규칙

Figma 문서를 config 파일 하나로 검사하는 시스템. 빌트인 규칙 15개(좌표 기반 8종 + 구조/이름/가시성 6종 +
occlusion 1종)와 프로젝트별 커스텀 규칙(JSON 선언적 / JS predicate)을 함께 켜고 끌 수 있다.

```
검사: sigma_lint(token, configPath, nodeId?, path?)
      → dry-run(기본): 위반 목록 + 자동수정 가능한 것의 계획(plannedFixOps)만 반환
적용: sigma_lint(token, configPath, apply: true)
      → 빌트인 안전수정(섹션 확장)만 실제 적용, 적용 후 재검사 결과(after) 포함
```

## 핵심 동작

- **config는 파일 경로로 매 호출 시 필수 전달** — 서버는 config를 저장하지 않는다.
  Figma 파일/프로젝트마다 다른 규칙을 쓸 수 있도록, "이 Figma 파일엔 이 config"라는
  매핑을 서버가 관리하지 않고 호출자가 매번 명시한다.
- **`configPath`는 서버 자신의 파일시스템 기준이다.** 로컬 bare 프로세스로 띄웠다면
  프로젝트 아무 경로나 되지만, **Docker로 배포했다면 컨테이너 안에서 보이는 경로여야
  한다** — 프로젝트 저장소 경로(`E:\...`, `/home/...`)는 컨테이너에 안 보인다.
  `docker-compose.yml`에서 바인드 마운트된 `~/.sigma`(컨테이너 `/root/.sigma`, `SIGMA_DATA_DIR`로
  오버라이드 가능) 하위에 두는 것을 권장한다(예: `~/.sigma/lint-configs/my-project.json`).
- **빌트인 규칙은 미기재 시 기본 ON**(opt-out 모델). 기존 `sigma_layout_lint` 시절 기하
  8종이 항상 켜져 있던 동작을 그대로 보존하기 위함이다.
- **커스텀 규칙은 read-only.** `fix` 콜백을 가질 수 없다 — 임의 JS가 문서를 직접
  변형하게 하면 "안전한 것만 자동수정" 성격이 깨지기 때문이다. 자동수정이 필요하면
  에이전트가 lint 결과를 보고 `sigma_modify_node` 등으로 직접 고친다.
- **자동수정(`apply:true`)은 빌트인의 `frame_padding`/`child_overflow`(섹션 확장)만.**
  나머지(겹침·orphan 등 재배치가 필요한 것, 모든 커스텀 규칙)는 보고만 하고
  자동수정하지 않는다(check-first).

## 빌트인 규칙 15종

| id | 검사 | 파라미터 | 기본값 |
|----|------|----------|--------|
| `outside_section` | 페이지 직속에 섹션 아닌 배치 노드(FRAME/COMPONENT/INSTANCE/GROUP) 금지 | — | — |
| `section_overlap` | 형제 SECTION끼리 겹침 금지 | — | — |
| `section_gap` | 이웃 섹션 간 간격 부족(라벨이 경계를 가림) | `gap` | 80px (`0`=검사 비활성) |
| `card_overlap` | 섹션 안 직속 카드(FRAME/COMPONENT)끼리 겹침 금지 | — | — |
| `frame_padding` | 섹션 안 프레임 여백 부족 | `padding` | 20px |
| `instance_orphan` | 래퍼(프레임/컴포넌트/그룹) 없이 섹션·페이지 직속으로 뜬 INSTANCE — 마스터 내부 중첩 인스턴스는 정상, `anno`/`wire` 프리셋 예외 | — | — |
| `component_needs_frame` | 섹션 직속 COMPONENT/COMPONENT_SET/GROUP 금지(프레임 안에 있어야) | — | — |
| `child_overflow` | 트리상 자식이면 좌표상으로도 부모 로컬박스(0,0~W,H) 안에 있어야 함(배치형만, 리프 제외) | — | — |
| `stray_pixel` | x/y/width/height 중 정수가 아닌 값이 있으면 위반 | — | — |
| `default_name` | `Rectangle 123`/`Frame 45`/`Group 12` 등 Figma 기본 이름 방치 | — | — |
| `empty_container` | FRAME/GROUP인데 자식이 0개 | — | — |
| `hidden_leaf` | `visible:false`인 노드가 트리에 잔존 | — | — |
| `fill_sizing_orphan` | `layoutSizingHorizontal/Vertical`이 `FILL`인데 부모가 오토레이아웃(`layoutMode !== 'NONE'`)이 아님 — FILL은 오토레이아웃 부모 안에서만 의미가 있어, 이 상태는 `resize()`/reparent 이후 남은 무효 상태가 거의 유일한 원인 | — | — |
| `component_description_empty` | COMPONENT/COMPONENT_SET의 `description`이 비어있거나 공백만 있음 | — | — |
| `fully_occluded_sibling` | 같은 부모 안에서 나중에 그려지는(z-order 위) 형제가 완전 불투명한 SOLID fill로 바운딩박스 전체를 덮어, 어떤 상태에서도 절대 안 보이는 노드 — `hidden_leaf`의 암묵적 버전. **fills/opacity 조회가 필요해 켜져 있으면 config.custom 유무와 무관하게 `get_nodes_info` 왕복이 한 번 추가된다.** 덮는 노드는 RECTANGLE/FRAME/COMPONENT/INSTANCE만 인정(원·별 등 비사각형은 바운딩박스 근사가 부정확해 제외), 그라디언트/이미지 fill은 완전 불투명을 증명 못 해 제외, 형제 여럿이 조각조각 합쳐 덮는 경우는 못 잡음(모두 의도적 스코프 축소 — 오탐 방지 우선) | — | — |

파라미터가 없는 규칙은 `{ enabled: false }`로 끄는 것만 가능하다. 좌표계·예외 규칙(anno/wire 프리셋 등)의 자세한 근거는 `packages/shared/src/lint/geometric.ts` 파일 상단 주석 참조.

## 커스텀 규칙

`config.custom` 배열의 각 항목은 `id`가 필수이고, 아래 두 형태 중 하나다.

### (a) JSON 선언적 (`kind: "match"`, 기본값이라 생략 가능)

```jsonc
{
  "id": "card-radius-12",
  "select": { "type": "FRAME", "namePattern": "Card" },
  "check": { "op": "equals", "field": "cornerRadius", "value": 12 },
  "message": "\"{name}\" cornerRadius 는 12여야 함 (현재 {actual})"
}
```

- `select`: `{ type?, namePattern? }` — 트리 전체에서 매칭되는 모든 노드에 적용.
- `check.op`: 5개뿐이며 더 늘리지 않는다(연산자를 계속 추가하면 결국 축소판 언어를
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

### (b) JS predicate (`kind: "predicate"`)

```jsonc
{
  "id": "modal-needs-overlay-sibling",
  "kind": "predicate",
  "timeoutMs": 2000,
  "code": "export default function(node, ctx) {\n  if (node.type !== 'FRAME' || !node.name.startsWith('Modal/')) return null;\n  if (!ctx.getSiblings(node.id).some((s) => s.name === 'Overlay')) {\n    return { message: `\"${node.name}\" 옆에 'Overlay' 형제가 없음` };\n  }\n  return null;\n}"
}
```

- `code`는 **`export default function(node, ctx) { ... }` 형태만** 허용(계약 위반이면
  실행 전에 에러로 보고됨).
- 위반이면 `{ message }` (선택적으로 `{ nodes: [...] }`로 관련 노드 지정, 생략 시
  검사 대상 노드 자신), 통과면 `null` 반환.
- `ctx.getSiblings(nodeId)` / `ctx.getAncestors(nodeId)` / `ctx.getChildren(nodeId)` —
  트리 관계를 노드 객체 배열로 반환. 현재 이 3개뿐이다(변수 바인딩 조회 같은 추가
  헬퍼는 §데이터 갭 참조).
- **격리 실행**: 서버가 `node:worker_threads`로 별도 Worker에서 실행한다
  (Bun의 `node:vm`은 샌드박싱 용도로 fragile해 회피 — 실측 검증 완료).
  규칙 하나의 전체 실행에 타임아웃(기본 2000ms, `timeoutMs`로 조절)이 있고, 초과하면
  `terminate()`로 강제 종료된다 — 무한루프를 넣어도 서버 프로세스는 멈추지 않는다
  (라이브 검증 완료: `while(true){}` 규칙이 800ms 타임아웃으로 정상 중단됨).
- 규칙 하나가 타임아웃/예외를 내도 **그 규칙만 에러로 기록되고 나머지 규칙·빌트인은
  계속 진행**된다(배열 입력 부분 실패 허용 관례와 일관).
- predicate는 **라이브 Figma 객체가 아니라 이미 서버가 들고 있는 직렬화된 노드
  데이터 위에서만 동작**한다 — 문서를 직접 조작할 수 없다.

## 추천 커스텀 규칙 — placeholder/lorem 텍스트 잔존

빌트인화하지 않고 커스텀 규칙만으로 바로 쓸 수 있는, 우선순위가 높은 예시. AI Agent가 생성한 문서에
"Lorem ipsum...", "placeholder", "TODO:" 같은 임시 텍스트가 그대로 남는 경우를 잡는다. 코드 변경이
전혀 필요 없다 — 아래 항목을 `config.custom`에 추가하기만 하면 된다.

```jsonc
{
  "id": "placeholder-text-leftover",
  "select": { "type": "TEXT" },
  "check": { "op": "regex", "field": "characters", "pattern": "Lorem ipsum|placeholder text|TODO:|dummy text" },
  "message": "\"{name}\" 에 placeholder/lorem 텍스트가 남아있음: {actual}"
}
```

`regex` op은 플래그를 지원하지 않아(대소문자 구분) 실제 사용하는 표기 그대로 패턴에 나열해야 한다
(필요하면 `[Ll]orem` 같은 문자 클래스로 대소문자 변형을 직접 명시).

## 예제 config (복붙용)

```jsonc
{
  "builtins": {
    "section_gap": { "gap": 60 },
    "default_name": { "enabled": false }
  },
  "custom": [
    {
      "id": "card-radius-12",
      "select": { "type": "FRAME", "namePattern": "Card" },
      "check": { "op": "equals", "field": "cornerRadius", "value": 12 }
    },
    {
      "id": "modal-needs-overlay-sibling",
      "kind": "predicate",
      "code": "export default function(node, ctx) {\n  if (node.type !== 'FRAME' || !node.name.startsWith('Modal/')) return null;\n  if (!ctx.getSiblings(node.id).some((s) => s.name === 'Overlay')) {\n    return { message: `\"${node.name}\" 옆에 'Overlay' 형제가 없음` };\n  }\n  return null;\n}"
    }
  ]
}
```

## 데이터 갭 (아직 지원 안 함)

- **변수 바인딩(`boundVariables`)**: 색상/패딩/radius가 Figma 변수에 바인딩됐는지
  검사하는 규칙은 아직 못 만든다 — `packages/figma-plugin/src/node-ops/query.ts`가
  이 필드를 안 읽는다. 노출되면 `ctx.resolveVariableName` 같은 헬퍼 추가 가능.
- **WCAG 명도 대비**: 계산 공식 자체는 고정이라 빌트인 후보이지만, "실효 배경색"을
  구하려면 조상을 올라가며 첫 SOLID fill을 합성하는 별도 유틸이 선행돼야 한다.

## 설계 원칙 / 근거

1. **표현력은 기존 언어에서 빌리고 새 언어는 최소화** — 컴포넌트 스펙이 HTML/CSS를
   택한 이유와 동일(에이전트가 이미 유창해 학습비용 0). JSON 연산자를 5개로 못박은
   것도 같은 이유 — 관계형/유도값 검사까지 JSON으로 밀면 결국 축소판 언어를
   재발명하게 된다.
2. **빌트인=선언적 옵션, 확장=코드형 함수** — ESLint/Stylelint 둘 다 이 이분법을
   쓴다는 벤치마킹 근거. 순수 JSON DSL만으로 임의 확장 규칙을 표현한 성공 사례가
   없었다.
3. **실행은 항상 서버** — Figma 플러그인은 QuickJS(WASM) 샌드박스이고 Figma가
   애초에 동적 코드를 호스트에서 격리하려 도입한 것이라, 서버→플러그인으로 규칙
   코드를 실어 날라 그 안에서 실행시키는 건 Figma의 보안 모델과 충돌한다. 또한
   무한루프가 나면 사용자의 실제 Figma Desktop 세션이 멈춘다(서버 프로세스가
   멈추는 것보다 피해가 훨씬 큼).

엔진 소스: `packages/shared/src/lint/`(규칙 실행, 순수 함수, 유닛테스트) ·
`packages/server/src/lint/`(config 로드, predicate worker 실행).
