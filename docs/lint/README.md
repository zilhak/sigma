# Lint (`sigma_lint`)

Figma 문서를 config 하나로 검사하는 시스템. **빌트인 24종**(기본 ON 15종 + opt-in 9종)과
프로젝트별 **커스텀 규칙**(JSON 선언적 / JS predicate)을 함께 켜고 끌 수 있다.

```
검사: sigma_lint(token, configPath, nodeId?, path?)
      → dry-run(기본): 위반 목록 + 자동수정 가능한 것의 계획(plannedFixOps)만 반환
적용: sigma_lint(token, configPath, apply: true)
      → 빌트인 안전수정(섹션 확장)만 실제 적용, 적용 후 재검사 결과(after) 포함
```

## 문서 구성

| 문서 | 내용 |
|---|---|
| **[rules/](rules/)** | **빌트인 24종 — 룰 1개 = 파일 1개.** 인덱스는 [rules/README.md](rules/README.md) |
| [config.md](config.md) | config 출처 3순위 · `scope` · `configMode` · 서브트리 검사 · 페이지/문서 데이터 저장 |
| [suppress.md](suppress.md) | 노드 단위 억제(`lint-ignore`) — page config와의 분업 |
| [annotation-layer.md](annotation-layer.md) | 기획 레이어 = 면제 계약 |
| [custom-rules.md](custom-rules.md) | JSON `check.op` 5개 · predicate 계약 · Worker 격리 실행 |
| [component-spec-policy.md](component-spec-policy.md) | `componentSpec.warn` — 스펙 **등록 호출**을 검사 |
| [recipes.md](recipes.md) | 복붙용 config 세트 |
| [design-notes.md](design-notes.md) | 설계 원칙 · 데이터 갭 |

## 핵심 동작

- **config는 매 호출 시 전달** — 서버는 config를 저장하지 않는다. Figma 파일/프로젝트마다 다른
  규칙을 쓸 수 있도록, "이 Figma 파일엔 이 config"라는 매핑을 서버가 관리하지 않고 호출자가
  매번 명시한다. 출처 3순위는 [config.md](config.md).
- **빌트인 규칙은 미기재 시 기본 ON**(opt-out 모델). 기존 `sigma_layout_lint` 시절 기하 8종이
  항상 켜져 있던 동작을 보존하기 위함이다. **단 9종은 opt-in**이라 명시해야 켜진다
  ([rules/README.md](rules/README.md) 참조).
- **커스텀 규칙은 read-only.** `fix` 콜백을 가질 수 없다 — 임의 JS가 문서를 직접 변형하게 하면
  "안전한 것만 자동수정" 성격이 깨지기 때문이다. 자동수정이 필요하면 에이전트가 lint 결과를 보고
  `sigma_modify_node` 등으로 직접 고친다.
- **자동수정(`apply:true`)은 빌트인의 `frame_padding`/`child_overflow`(섹션 확장)만.**
  나머지(겹침·orphan 등 재배치가 필요한 것, 모든 커스텀 규칙)는 보고만 한다(check-first).
- **완전성 — 부분 스캔을 clean으로 오보하지 않는다.** lint는 트리를 `treeNodeLimit`(기본
  **200000**) 노드까지 전수 순회한다. `sigma_get_tree`의 인터랙티브 기본값(1000)과 다른 이유는,
  잘린 트리로 검사하면 뒤쪽 노드가 아예 검사되지 않은 채 "clean"이 나오기 때문이다(silent
  false-clean). 순회는 `treeTimeoutMs`(기본 **60000**)로도 끊긴다. 상한에 걸리면 응답에
  `scanTruncated: true` · `scannedNodes` · `scanWarning`을 싣고 **`clean`을 false로 강제**한다.
  이때는 `treeNodeLimit`을 올리거나 `nodeId` 스코프로 섹션별로 나눠 재검사한다.
- **0건은 그 자체로 해석되지 않는다 — `coverage`와 `byRule`을 함께 본다.** 응답은 항상
  "무엇을 몇 개 노드에 대해 검사했는가"를 싣는다(옵션이 아니다). 규칙 하나만 궁금할 때
  **총계(`violationCount`)가 아니라 `byRule[id]`를 본다** — inline config가 기본 규칙을 끄지
  않아 총계가 다른 규칙 것으로 부풀어 보이는 오독이 실제로 반복됐다.

  | 필드 | 뜻 |
  |---|---|
  | `coverage.scannedNodes` | 순회한 노드 수. **0이면 그 검사는 아무 의미가 없다** |
  | `coverage.builtinRan` / `customRan` | 실제로 실행된 규칙 id |
  | `coverage.builtinDisabled` | config로 껐다(`enabled:false`) |
  | `coverage.builtinOptInOff` | opt-in인데 안 켰다 |
  | `coverage.builtinSkipped` | **켰는데도 못 돌았다** + 사유 (있을 때만) |
  | `coverage.customFailed` | 커스텀 규칙이 실행 자체를 실패 (정의 오류·타임아웃) |
  | `byRule` | 규칙 id → 위반 건수. **실행된 규칙은 0이어도 키가 있다** |

- **기하 규칙 위반은 `metrics`에 실측값을 싣는다** — 초과량(`sides`/`left`/`top`/`right`/`bottom`),
  컨테이너 크기, 겹침 폭·높이, 요구 여백. 초과량을 알려고 `sigma_get_tree`를 다시 부를 필요가 없다.
  **`message`를 정규식으로 파싱하지 말 것** — 그러면 문구를 못 고친다. 수치는 `metrics`에서 읽는다.

  세 상태가 응답만으로 갈린다: `byRule[id] > 0`(위반 있음) · `byRule[id] === 0`(돌았고 깨끗함) ·
  **키 없음**(안 돌았음 — `coverage`에서 왜인지 확인). `scope:"file"`은 `summary[]`에
  페이지별 `scannedNodes`·`ranCount`·`byRule`을 싣는다.

## 엔진 소스

- `packages/shared/src/lint/` — 규칙 실행. 순수 함수, 유닛테스트.
- `packages/server/src/lint/` — config 로드·해석, enrich, predicate worker 실행, 리포트.

룰 id의 정본은 `packages/shared/src/lint/engine.ts`의 `ALL_BUILTIN_RULE_IDS`다.
**룰을 추가하면 `rules/<id>.md`도 함께 만든다** — 파일이 없으면 정합성 테스트가 실패한다.
