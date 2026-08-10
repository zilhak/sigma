# lint 응답이 base 가 어디서 왔는지 말하지 않았다

## 증상

`sigma_lint` 를 `configPath` 없이 부르면 base 는 **문서 저장 `lint` config** 가 된다(설계대로다).
그런데 그 문서 base 에 커스텀 규칙이 없으면, 파일 base 에 있던 커스텀 규칙 8종이
**아무 표시 없이 빠진 채 "위반 0"** 이 나온다.

실측(통합 기획 파일 Native Platform, 2026-08-10) — 같은 섹션, 인자 하나 차이:

| 호출 | `customRan` |
|---|---|
| `{nodeId}` | `broken-hangul`, `plan-code-symbol`, `plan-generic-prose` (페이지 저장분뿐) |
| `{nodeId, configPath}` | 위 3종 + `anno-pair-orphan`·`anno-self-overlap`·`plan-generic-control`·`anno-link-missing`·`anno-layer-z-order`·`table-check-size` |

그 상태로 여러 페이지가 "깨끗함" 으로 기록됐고, 나중에 **짝 검사 대조군이 발화하지 않아
서버 수정이 안 먹었다고 오해**했다. 실제로는 규칙이 애초에 실행 대상이 아니었다.

## 원인

`baseConfigLabel` 은 **파일 스코프 리포트에만** 실려 있었다(`runFileLint`).
단일 페이지·노드 스코프 응답에는 `configMode`·`configSource`(base/page-stored/merged) 만 있어
*"페이지 config 와 합쳤다"* 는 말은 하지만 **그 base 가 무엇이었는지는 말하지 않았다.**

`coverage.customRan` 으로 간접 추론은 가능했다 — 실제로 그렇게 알아챘다.
하지만 그건 *"무엇이 돌았나"* 이지 *"왜 안 돌았나"* 가 아니다. 원인을 찾으려면
base 해석 규칙을 이미 알고 있어야 했고, 그걸 알았다면 애초에 틀리지 않았을 것이다.

## 무엇을 했나

`baseProvenance(baseLabel, baseConfig)` 를 페이지·노드 스코프 응답에도 싣는다.

- `baseConfig` — `inline` / 파일 경로 / `document-stored` / `none`.
- `baseWarning` — **문서 저장 base 인데 커스텀이 하나도 없을 때만.** 그 조합이 곧
  "파일 base 의 커스텀이 이 실행에서 안 돌았다" 는 뜻이라, 조용히 넘기지 않는다.

문서 저장 base 에 커스텀이 있으면 경고하지 않는다 — 그건 정상 사용이다.
**동작은 바꾸지 않았다.** base 해석 우선순위(inline > configPath > 문서 저장)는 그대로고,
바뀐 것은 *그 사실이 응답에 보이는가* 뿐이다.

## 되돌리면 안 되는 이유

이 파일처럼 **문서 base 는 비어 있고 실제 규칙은 파일 base 에 있는** 구성에서는,
인자 하나를 빠뜨린 실행과 정상 실행이 **응답만으로 구분되지 않는다.**
그 구분이 없으면 "0건" 이 "깨끗함" 으로 굳는다 — 이 저장소가 반복해서 막아 온 실패 형태다
(011 오타 든 config, 013 config 를 못 읽고 조용히 폴백, 015 부분 스캔).

## 회귀 테스트

`packages/server/__tests__/lint-base-provenance.test.ts` — 출처를 싣는가 / 위험한 조합에서만
경고하는가 / **정상 조합에서는 경고하지 않는가**(오탐 방향 대조군) / 라벨이 없으면 아무것도 안 싣는가.

라이브 확인: base 없이 부르면 `baseConfig: document-stored` + 경고, `configPath` 를 주면
`baseConfig: /root/.sigma/lint.json` + 경고 없음, 그리고 `customRan` 이 3종 → 9종으로 늘어난다.
