# 004. lint 의 "위반 0건" 을 해석할 수 없었다 — 규칙이 죽어 있어도 0건이었다

> 관련 코드: `packages/shared/src/lint/engine.ts` (`RuleCoverage`, `ENGINE_EXTERNAL_RULE_IDS`),
> `packages/server/src/lint/run.ts` (`runLintOnRoots`, `countByRule`)
> 테스트: `packages/shared/__tests__/lint-coverage.test.ts`
> 2026-08-06~07 실측 · 2026-08-08 수정

## 증상

`sigma_lint` 가 `violations: []` 를 돌려줄 때 그것이 (a) 다 돌았고 위반이 없다 인지
(b) 규칙이 **하나도 매칭되지 않았다**(대상 0개 · config 미적용 · 규칙이 죽음) 인지
**응답만 봐서는 알 수 없었다.** 응답에 "무엇을 검사했는가" 가 없었기 때문이다.

실제로 난 사고(사용처 `integrate` 기록):

1. **주석 규칙 2종이 0건을 보고하면서 실은 죽어 있었다.** `annotation_marker_pair`/`_gap` 이
   기획 레이어 id 를 `annotation_layer` 가 켜져 있을 때만 수집하는 구조라, 규칙만 켜면
   **검사 대상이 0개**였다. 발견 방법은 positive control — 짝 alias 를 없는 값으로 바꿔
   104건이 나오는지 확인해서야 알았다.
2. **마커 링크 감사가 "37페이지 0건"** 을 보고했는데, 정규식이 `[_ ]` 구분자를 요구해
   `마커1`·`마커①` 형태 **273개를 통째로 건너뛰었고 그중 80건이 실제로 링크가 없었다.**
3. **커스텀 규칙을 잘못된 형식으로 줘서 0건이 나온 것을 도구 탓으로 볼 뻔했다.**
   도구는 정확한 사유로 거부하고 있었는데 호출 스크립트가 `len(violations)` 로만 읽어 삼켰다.
4. `fully_occluded_sibling` 이 **이미 고쳐진 옛 크래시를 이유로 꺼진 채 방치**돼, 그동안
   표 프레임이 페이지네이션을 덮은 결함 3건을 놓치고 있었다.

그리고 반대 방향 오독도 있었다 — 총계만 주니까 **occlusion 규칙만 보려던 파일 전체 검사가
76,986건**으로 나왔고(실제 21건), marker 규칙 검사는 **9,100건**(실제 34건). inline config 가
기본 규칙을 끄지 않아 총계가 다른 규칙 것으로 부푼 것이다. 사용처는 이걸 막으려고
**자기 쪽에 정적 검사 규칙(`unfiltered-violations`)까지 만들어** 방어하고 있었다.

## 무엇을 했나

응답에 **항상**(옵션 아님) 두 가지를 싣는다.

- `coverage` — `scannedNodes` / `builtinRan` / `builtinDisabled` / `builtinOptInOff` /
  `builtinSkipped`(켰는데 못 돈 것 + 사유) / `customRan` / `customFailed`
- `byRule` — 규칙 id → 건수. **실행된 규칙은 0 이어도 키를 남긴다.**

그래서 세 상태가 응답만으로 갈린다: `byRule[id] > 0` · `byRule[id] === 0`(돌았고 깨끗함) ·
**키 없음**(안 돌았음, 이유는 `coverage`).

### 커버리지를 엔진에만 두면 조용히 불완전해진다

처음 설계는 "`runBuiltinRules` 에 out 파라미터 하나" 였는데 **그러면 5종이 빠진다.**
24종 중 `fully_occluded_sibling`·`instance_resized_from_spec`·`annotation_marker_pair`·
`annotation_marker_gap`·`font_not_default` 는 enrich 된 LintNode 가 필요해
**서버(`run.ts`)가 엔진 밖에서 직접 호출**한다. 그 5종이 `builtinRan` 에 안 실리면 호출자는
"안 돌았구나" 로 읽는데 실제로는 돌았다 — **이 기능이 없애려던 혼동을 새로 만드는 것이다.**

그래서 최종 조립은 `runLintOnRoots` 가 한다. 엔진은 자기 몫만 채우고
(`ENGINE_EXTERNAL_RULE_IDS` 로 경계를 명시), 서버가 5종을 이어 채운 뒤
**어디에도 안 담긴 id 가 있으면 `skipped` 에 "커버리지 미등록 — sigma 버그" 로 드러낸다.**
감추면 다음에 규칙을 추가하는 사람이 등록을 빠뜨려도 아무도 모른다.

> ⚠️ `isEnabled({}, id)` 는 **24종 모두 true** 를 돌려준다(실측). opt-in 여부는 `isEnabled` 로
> 알 수 없고 `builtins.X?.enabled === true` 라는 **별도 표현**이며, 그마저 두 파일에 흩어져 있다.
> 그래서 "opt-in 3종" 같은 어림짐작으로 목록을 적으면 틀린다.

## 되돌리면 안 되는 이유

- **coverage/byRule 을 opt-in 옵션으로 만들지 말 것.** 옵션이면 사고가 나는 상황
  (=아무 의심 없이 0건을 읽는 상황)에서 정확히 안 켠다. 항상 나와야 의미가 있다.
- **`violations` 스키마는 건드리지 않았다.** 사용처 스크립트가 전부 이 형태를 파싱한다.
- **규칙별 "검사 대상 노드 수" 를 규칙마다 정확히 세지 않는다.** 순회 방식이 달라 비용이 크고,
  목적은 정밀 계측이 아니라 **0인지 아닌지**를 아는 것이다. `scannedNodes` 하나로 충분하다.
- `ran` 을 문자열로 압축하지 말 것 — 배열이어야 스크립트가 `in` 으로 본다.
