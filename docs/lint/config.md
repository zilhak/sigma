# config — 출처 · scope · configMode · 저장

## config 출처 3순위

base config는 아래 순서로 결정된다:

1. inline `config` 객체
2. `configPath` 파일
3. 문서 노드에 저장된 `lint` (`sigma_set_page_data({ pageId: "document", key: "lint", ... })`)

### `configPath`는 **서버의** 파일시스템 기준이다

로컬 bare 프로세스로 띄웠다면 프로젝트 아무 경로나 되지만, **Docker로 배포했다면 컨테이너 안에서
보이는 경로여야 한다** — 프로젝트 저장소 경로(`E:\...`, `/home/...`)는 컨테이너에 안 보인다.
`docker-compose.yml`에서 바인드 마운트된 `~/.sigma`(컨테이너 `/root/.sigma`, `SIGMA_DATA_DIR`로
오버라이드 가능) 하위에 두는 것을 권장한다(예: `~/.sigma/lint-configs/my-project.json`).

### 로드 실패는 조용히 넘어가지 않는다

| 출처 | 실패 시 |
|---|---|
| inline `config` · `configPath` | **호출 자체가 에러** (`configMode` 무관). 응답에 출처 라벨이 실린다 |
| 페이지 저장 config | base 로 **폴백하되** `configError` · `configUnreadable: true` · `configWarning` 을 싣고 **`clean` 을 false 로 강제** |

폴백을 유지하는 이유는 `scope:"file"` 전 페이지 순회가 한 페이지 때문에 멈추면 안 되기 때문이고,
`clean` 을 막는 이유는 그 페이지 전용 규칙(커스텀·opt-in)이 하나도 안 돈 결과이기 때문이다.
`coverage.customRan` / `builtinOptInOff` 로 무엇이 빠졌는지 확인한다.

## 스키마 — `$comment`

네 자리(최상위 · `builtins.<rule>` · `custom[]` · `componentSpec.warn[]`)에서 `$comment` 를
쓸 수 있다. 값은 문자열 또는 문자열 배열이며 **검증만 통과하고 동작에는 쓰이지 않는다.**

`_note`·`_why` 처럼 임의로 만든 키는 오타 검사에 걸려 **거부된다.** `_` 접두를 통째로 허용하면
`_enabled` 같은 오타가 조용히 통과하기 때문이다. 자세한 경위는
[`docs/history/013`](../history/013-strict-config-left-no-room-for-notes.md).

## 두 개의 직교 축

- **`scope`**: `page`(기본, 바인딩된 1페이지) | `file`(파일의 전 페이지 순회, read-only)
- **`configMode`**: `merge`(기본) | `per-page` | `uniform`

| configMode | 각 페이지에 적용할 config |
|---|---|
| `merge` **(기본)** | `deepMerge(base, 페이지 저장 config)` — **`builtins`·`custom` 모두 rule id 단위로** 페이지가 override 하고, base에만 있는 규칙은 살아남는다 |
| `per-page` | 그 페이지에 저장된 config → 없으면 base 폴백 → base도 없으면 skip(명시) |
| `uniform` | base config 하나로 일괄 (base 필수). ⚠️ **페이지 저장 config를 무시**한다 — 그 페이지가 꺼 둔 규칙까지 되살아나므로 의도할 때만 명시한다 |

`merge`는 "문서=공통 base + 페이지=override" 패턴에 쓴다.

> ⚠️ `merge`가 기본이다. 예전 기본은 `uniform`이라 페이지 저장 config를 통째로 무시했는데, 같은
> 페이지가 자기 config를 갖고 있다면 그건 그 페이지의 뜻이므로 기본값이 존중하는 쪽이 맞다.
> `uniform`은 이제 명시해야 한다. (`packages/server/src/mcp/handlers/lint.ts`)

## 서브트리 검사 (`nodeId` / `path`)

`scope: "page"`에서 `nodeId`(또는 `path`)를 주면 **그 노드의 자식들**이 검사 대상이 된다.
이때 **검사 시작 노드 자신이 컨테이너로 인식된다** — 서버가 `get_tree`의 `rootNode`(시작 노드의
type·크기)를 엔진에 `scopeRoot`로 넘기기 때문이다. 그래서 서브트리 검사도 페이지 전체 검사와
**같은 판정**을 받는다:

| 시작 노드 | 자식에 적용되는 규칙 |
|---|---|
| SECTION | `card_overlap` · `frame_padding` · `child_overflow` · `component_needs_frame` (섹션 규칙) |
| FRAME/COMPONENT/GROUP/INSTANCE | `child_overflow` (프레임 규칙). 직속 INSTANCE는 이미 래퍼 안이므로 `instance_orphan` 아님 |
| (없음 = 페이지 전체) | `outside_section` 포함 페이지 규칙 |

- **`outside_section`은 진짜 페이지 루트에서만 돈다.** 서브트리의 자식은 "섹션 밖"이 아니라
  "그 컨테이너 안"이므로, 여기서 이 규칙을 돌리면 정상 자식이 전부 위반으로 잡힌다.
- **페이지 루트 전용 2종**([`content_spread`](rules/content-spread.md)·[`origin_anchor`](rules/origin-anchor.md))은
  서브트리에선 실행되지 않는다 (좌표가 페이지 절대좌표가 아니라 부모 로컬좌표라 원점·거리 판정이 무의미).
- ⚠️ **플러그인이 구버전이면** `rootNode`가 오지 않아 시작 노드 직속 자식의 `child_overflow`·
  `frame_padding`을 판정할 수 없다. 이 경우 응답에 `scopeContainerUnknown: true`와 `scopeWarning`이
  실려 "왜 안 잡혔는지"가 드러난다(조용한 false clean 금지). 플러그인을 다시 빌드/로드하면 해소된다.

## 전체 파일 lint (`scope: "file"`)

- 파일의 모든 페이지를 **현재 페이지 전환 없이** 순회한다(플러그인이 임의 페이지 트리를 동기 조회 가능).
- read-only(자동수정 없음). 결과는 **markdown 리포트 파일**로 `~/.sigma/lint-reports/`에 떨구고,
  MCP 응답에는 **페이지별 요약 + 리포트 경로(`reportPath`)**만 싣는다(위반이 수백 건일 수 있어 인라인 금지).
- 리포트 경로는 스크린샷과 동일하게 `toHostPath`로 호스트 기준으로 반환되며, 서버 자동정리(7일/100MB) 대상이다.
- 응답의 `reportPath`를 Read 도구로 열면 페이지별 위반 표 + 룰별 집계가 정리돼 있다.

## 페이지/문서 노드에 데이터 저장

PAGE/DOCUMENT 노드는 `sigma_modify_node` 가드로 막혀 있어, 전용 도구
(`sigma_set_page_data` / `sigma_get_page_data`)로만 메타데이터를 붙인다.
저장소는 해당 노드의 `sharedPluginData`(**namespace 고정 `"sigma"`**)이며 `.fig` 파일에 영속된다.

- **형식 강제**: `key`는 `^[a-zA-Z0-9_.-]+$`, `value`는 **유효한 JSON 문자열**이어야 함(서버 핸들러가 검증).
- **대상(`pageId`)**: 미지정=바인딩 페이지 / 페이지 ID / `"document"`(문서 루트).
- **예약 key `"lint"`**: 그 페이지(또는 문서)의 LintConfig. `per-page`/`merge` 모드가 이 값을 참조한다.
- **예약 key `"fonts"`**(문서 전용): 그 파일의 기본 폰트(`{"default":"Pretendard"}`). 폰트를 지정하지 않은
  텍스트가 이 폰트로 렌더된다(미설정 시 Inter). [`font_not_default`](rules/font-not-default.md)의 기준이기도 하다.
- Figma 플러그인 UI **"페이지" 탭**의 `lint 보기`/`lint 설정하기`가 같은 저장소(현재 페이지 `"sigma"/"lint"`)를
  편집한다 — 플러그인에서 편집한 게 서버 lint(per-page)에 그대로 반영되고 역도 성립.
  (플러그인은 메타데이터 편집/뷰잉만, lint 실행은 항상 서버.)

```jsonc
// 이 페이지에 raw_node 만 켜는 config 저장
sigma_set_page_data({ token, key: "lint", value: '{"builtins":{"raw_node":{"enabled":true}}}' })
// 전체 파일을 페이지별 저장 config로 검사 → md 리포트
sigma_lint({ token, scope: "file", configMode: "per-page" })
```

## 완전성 인자

| 인자 | 기본값 | 의미 |
|---|---|---|
| `treeNodeLimit` | 200000 | 트리 순회 노드 상한 |
| `treeTimeoutMs` | 60000 | 순회 타임아웃 |

상한에 걸리면 응답에 `scanTruncated: true` · `scannedNodes` · `scanWarning`이 실리고 `clean`이
false로 강제된다. 자세한 근거는 [README.md](README.md) §핵심 동작.
