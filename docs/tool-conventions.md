# MCP 도구 설계 규약 (Tool Conventions)

Sigma 서버가 노출하는 MCP 도구를 **추가/수정/리팩터링**할 때 지켜야 하는 기준.
새 도구를 만들거나 기존 도구를 정리할 때 이 문서를 먼저 참조한다.

관련 파일:
- 스키마 정의: `packages/server/src/mcp/tool-definitions.ts`
- 핸들러 라우팅: `packages/server/src/mcp/tool-handler.ts` (이름 → 핸들러 Record)
- 핸들러 구현: `packages/server/src/mcp/handlers/*.ts`

---

## 0. 설계 철학 — "동질이면 묶고, 이질이면 쪼갠다"

Agent(LLM)에게 도구의 가치는 **타입이 박힌 스키마**에 있다. 도구를 무작정 줄이려고
`action`/`method` 문자열 + freeform `args` 하나로 뭉치면, 모델이 매번 필드 이름을 추측해야
하고 검증·에러 국소화가 무너진다. 반대로 완전히 동일한 호출 형태를 개별 도구로 쪼개면
도구 목록만 오염된다.

| 상황 | 판단 |
|------|------|
| 여러 연산이 **같은 대상 + 같은 호출 형태** (예: 노드 1개에 대한 65개 setter) | **묶는다** (`sigma_modify_node`의 `method` 패턴) |
| 여러 연산이 **입력 shape가 제각각** (예: rectangle vs text vs image 생성) | **쪼갠다** (도구별 typed schema) |
| 단일 대상 vs 다중 대상 차이뿐 (스칼라 vs 배열) | **하나로** (배열 입력 지원, §3 배치 정책) |

토큰 비용이 걱정되면 도구를 의미적으로 뭉치지 말고, 클라이언트의 **지연 노출(progressive
disclosure / tool search)** 로 해결한다. 의미를 뭉개는 것보다 이쪽이 옳다.

---

## 1. 네이밍 규칙

### 1.1 접두사 — 예외 없이 `sigma_`

Sigma 서버가 노출하는 **모든** MCP 도구는 `sigma_` 접두사를 붙인다.
토큰이 필요한지, Figma를 건드리는지와 무관하다 (스토리지·유틸리티 포함).

```
✅ sigma_save_extracted, sigma_server_status, sigma_get_playwright_scripts
❌ save_extracted, server_status, get_playwright_scripts
```

이유: 여러 MCP 서버가 붙은 세션에서 도구 출처를 이름만으로 식별할 수 있어야 한다.
접두사 유무를 "성격"으로 가르면 반드시 누수된다(과거 `sigma_storage_stats`는 접두,
`list_screenshots`는 무접두였던 불일치가 실제로 발생).

### 1.2 동사 어휘 (verb) — 고정 사전

`sigma_<verb>_<noun>` 형태. 동사는 아래에서만 고른다.

| 동사 | 용도 |
|------|------|
| `create_` | 새 노드/리소스 생성 |
| `get_` | **바인딩된 Figma 문서의 상태/정의를 읽음** (단일 노드 정보, 또는 문서 내 컬렉션: variables/styles/local_components/frames) |
| `list_` | **사용 가능한 카탈로그를 열거** (fonts, plugins, pages, libraries, 저장된 컴포넌트, 스크린샷) — "지금 문서 상태"가 아니라 "선택할 수 있는 목록" |
| `set_` | 기존 값 덮어쓰기 (속성 설정) |
| `update_` | 내용 전체 교체 |
| `delete_` | 삭제 (**`remove_` 금지** — 항상 `delete_`) |
| `add_` / `bind_` / `apply_` / `move_` / `clone_` / `group_` / `convert_` / `import_` / `scan_` / `find_` | 각 동작의 의미가 위 동사로 안 잡힐 때만 |

**`get_` vs `list_` 경계**: "바인딩된 문서에서 읽으면 `get_`, 밖에서 가져올 카탈로그면
`list_`." 로컬 리소스·외부 라이브러리 열거는 `list_`.

### 1.3 이름은 사실과 일치해야 한다

도구가 실제로 하는 일을 이름이 정확히 반영해야 한다.
- `import_file` ❌ → 파일이 아니라 저장된 추출 데이터를 가져옴 → `import_saved` ✅
- `read_my_design` ❌ → 도메인 동사 아님 → `get_selection_details` ✅

### 1.4 noun 단/복수

- 단일 대상 도구는 단수: `sigma_get_node_info`
- "여러 개"는 **복수 이름의 별도 도구로 만들지 말고 배열 입력으로 처리** (§3).
  즉 `sigma_get_nodes_info` 같은 배치 전용 이름을 새로 만들지 않는다.

---

## 2. 스키마 규칙

1. **`token`은 항상 첫 property**, Figma 조작 도구는 `required`에 포함.
2. **열거 가능한 문자열 필드는 반드시 `enum`을 명시**한다. 설명 문자열에
   `"BOOLEAN, TEXT, ..."`처럼 나열만 하고 `enum`을 빼면 검증이 안 된다.
3. **색상은 `{ r, g, b, a? }` (각 0~1)** 객체로 통일. 별도 hex 문자열 받지 않는다.
4. **좌표/크기는 `x, y, width, height`** (선은 `length`, 벡터는 `vectorPaths`).
5. `description`은 한국어. Figma 조작 도구는 **"바인딩 필수"** 안내를 포함한다.
6. 선택 인자는 `required`에서 빼고 설명에 `(선택)` 표기.

---

## 3. 배치(Batch) 정책 — 단일 도구가 배열도 받는다

"단일 처리 도구 + `batch_*` 도구"를 **쌍으로 만들지 않는다.**
같은 도구가 스칼라와 배열을 모두 받게 하고, 배열일 때 부분 실패를 허용한다.

- 과거의 `_nodes_`(복수형) / `batch_` / `set_multiple_` 3종 혼용은 **금지**.
- 새 도구는 처음부터 배열 입력을 1급으로 설계한다.
- 부분 실패 시맨틱(개별 실패해도 나머지 진행)은 **배열 입력일 때만** 적용.

> 기존 배치 전용 도구(`sigma_batch_modify`, `sigma_get_nodes_info`,
> `sigma_set_multiple_*`, `sigma_batch_delete`)의 단일 도구 흡수는 **런타임 검증
> (플러그인 왕복 테스트)이 필요**하므로, MCP 서버를 재시작할 수 있는 상황에서
> 단계적으로 진행한다. §5 로드맵 참조.

---

## 4. 핸들러 배선 규칙

- 핸들러는 `handlers` Record의 키가 **도구 이름과 정확히 일치**해야 한다
  (`tool-handler.ts`가 이름으로 조회). tool-definitions의 `name`과 한 글자도 달라선 안 된다.
- Figma 조작 도구는 **`validateFigmaAccess(token, wsServer)`** 로 토큰·연결·바인딩을
  일괄 검증한다 (helpers.ts). 보일러플레이트를 직접 재작성하지 않는다.
- 응답은 `jsonResponse(...)`로 감싼다.

---

## 5. 새 도구 추가 체크리스트

1. [ ] 이 기능이 기존 도구의 **동질 연산**인가? → 개별 도구 대신 기존 도구에 편입 (§0)
2. [ ] 이름이 `sigma_<고정동사>_<정확한noun>` 규칙에 맞는가 (§1)
3. [ ] 여러 대상을 다루면 배열 입력으로 설계했는가 (배치 전용 도구 신설 금지, §3)
4. [ ] 열거 필드에 `enum`을 모두 넣었는가 (§2-2)
5. [ ] `tool-definitions.ts`의 `name`과 핸들러 Record 키가 일치하는가 (§4)
6. [ ] Figma 조작이면 `validateFigmaAccess` 사용 + "바인딩 필수" 설명 포함
7. [ ] `docs/mcp-tools.md`, `README.md`, 프로젝트 `CLAUDE.md` 도구 표에 반영했는가
8. [ ] 서버 코드 변경이므로 서버 minor +1 (커밋·버전 규칙 참조)

---

## 6. 향후 정리 로드맵 (consolidation)

네이밍은 정리 완료. 아래 **동질 CRUD 묶기**는 손해 없는 개선이나 런타임 검증이 필요해
서버 재시작이 가능한 시점에 진행한다.

| 대상 | 현재 | 목표 |
|------|------|------|
| 배치 쌍 흡수 | `modify_node`/`batch_modify`, `get_node_info`/`get_nodes_info`, `set_annotation`/`set_multiple_annotations`, `delete_frame`/`batch_delete` | 단일 도구가 배열 수용 (§3) |
| 페이지 | `create/rename/switch/delete/reorder_page` (5개) | `sigma_page(action, …)` (1개) |
| 컴포넌트 프로퍼티 | `add/edit/delete/get_component_property` (4개) | `sigma_component_property(action, …)` (1개) |
| 변수 leaf 조작 | `set_variable_value/scopes/alias/code_syntax`, `rename/delete_variable` (6개) | `sigma_variable(action, variableId, …)` (1~2개) |
| 프레임 생성 소스 | `create_frame`/`import_saved`/`save_and_import` | `source: data\|html\|savedId` 디스크리미네이터로 통합 |

`create_variable`(collectionId+resolvedType), `create_variable_collection`,
`bind_variable`(노드 대상)은 shape가 달라 **분리 유지**한다.
