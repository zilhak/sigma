# 011. lint config 오타가 조용히 먹혀 "위반 0건" 이 거짓말을 했다

> 관련 코드: `packages/server/src/lint/load-config.ts` (`validateShape`, `validateBuiltins`),
> `packages/shared/src/lint/engine.ts` (`BUILTIN_RULE_PARAMS`)
> 2026-08-08 실측 · 같은 날 수정

## 증상

재시작 후 라이브 검증 중에 **내가 직접 밟았다.** `sigma_lint` 에 설정을 주려고 이렇게 불렀다:

```json
{ "rules": { "content_spread": { "enabled": true }, "child_overflow": { "enabled": false } } }
```

응답은 `success` 였고 `configSource: "base"` 였다. 그런데 `coverage` 를 보니
`child_overflow` 가 여전히 `builtinRan` 에 있고 위반도 1건 그대로였다. 올바른 키는
`rules` 가 아니라 **`builtins`** 였는데, 검증이 모르는 최상위 키를 그냥 통과시켰다.

한 층 아래도 같았다:

```json
{ "builtins": { "child_overflowss": { "enabled": false } } }
```

역시 통과. 전 규칙이 기본값으로 돌고 응답은 정상이었다. 규칙 id 오타도, 규칙별
파라미터 오타(`frame_padding: { paddin: 30 }`)도 전부 조용히 무시됐다.

`validateShape` 는 **알려진 키의 형태만** 검사하고(있으면 객체인가, 배열인가),
**모르는 키가 있는지는 보지 않았다.**

## 왜 나쁜가 — 다른 조용한 무시보다 한 단계 더 나쁘다

lint 는 **"위반 0건"을 근거로 다음 작업으로 넘어가는** 도구다. 설정이 먹지 않으면
호출자는 자기가 켠 줄 아는 규칙이 안 돈 결과를 "깨끗하다" 로 읽는다. `coverage`/`byRule`
(→ `docs/history/004`)은 정확히 그 혼동을 없애려고 넣은 것인데, 설정 자체가 조용히
증발하면 **coverage 도 "config 대로 돌았다"고 정직하게 보고하면서 사람만 틀리게 된다.**

이 저장소는 같은 실패 유형을 여러 번 없애 왔다 — `modify_node` 의 `unknownArgs` 거부,
빈 배열 거부, `filter` + `omit` 상호배타 거부. lint config 만 남아 있었다.

## 무엇을 했나

세 층위 전부에서 모르는 키를 **거부**한다.

1. **최상위** — `builtins` / `custom` / `componentSpec` 외의 키는 에러. 허용 목록을 함께 알린다.
2. **규칙 id** — `ALL_BUILTIN_RULE_IDS` 와 대조. 틀리면 사용 가능한 24종을 나열한다.
3. **규칙별 파라미터** — 새 카탈로그 `BUILTIN_RULE_PARAMS` 와 대조.
   `enabled` 는 전 규칙 공통이라 목록에 넣지 않고 검증에서 따로 허용한다.

파라미터 카탈로그는 **엔진 옆**(`shared/src/lint/engine.ts`)에 뒀다. 검증하는 곳은
서버지만, 파라미터를 늘리는 사람은 규칙 코드를 고치는 사람이라 그 사람 눈에 보이는
자리에 있어야 한다. `ALL_BUILTIN_RULE_IDS` 바로 아래다.

### `sizingByAlias` 는 일부러 뺐다

`instance_resized_from_spec` 이 읽는 키 중 `sizingByAlias` 만 카탈로그에 없다.
서버가 스펙 레지스트리에서 계산해 **항상 덮어쓰기** 때문이다(`run.ts` 의 스프레드 순서).
받아 주면 그게 곧 이 기록이 없애려는 조용한 무시가 된다. 유닛테스트가 이 부재를 지킨다.

반대로 `font_not_default.family` 는 **남겼다.** 겉보기엔 같은 모양(`run.ts` 에서
`family: defaultFontFamily` 로 덮어씀)이지만, `resolveDefaultFontFamily` 가 config 값을
**먼저 보고 있으면 그대로 반환**한다. 즉 사용자 값이 실제로 이긴다. 스프레드만 보고
둘을 같이 처리하면 멀쩡한 파라미터를 막게 된다 — 호출 경로를 끝까지 따라가서 갈랐다.

## 거부해 놓고 응답에서 지우면 소용이 없다 (1차 배포 후 재발견)

배포 후 라이브에서 같은 오타를 다시 넣어 봤다. 거부는 정상 동작했는데 응답이 이랬다:

```json
{ "clean": true, "configSource": "skipped",
  "note": "…이 페이지에 저장된 lint config 도 base 도 없어 건너뜁니다." }
```

`sigma_lint` 핸들러가 base config 로드 실패를 **`configMode:"uniform"` 일 때만** 에러로 냈고,
기본값인 `merge` 에서는 그 에러를 버리고 "config 없음" 으로 격하했다. **오타를 잡아 놓고
잡았다는 사실을 응답에서 지운** 셈이라 호출자가 보는 그림은 수정 전과 같았고, 오히려
"설정이 아예 없다" 고 단정해 주니 더 나빴다.

config 를 줬는데 못 읽은 것은 configMode 와 무관하게 에러다 — `uniform` 전용 분기에서 떼어냈다.
(페이지 단위 config 오류는 원래 `configError` 로 실려 나오고 있었다. base 만 구멍이었다.)

**교훈**: 검증을 넣을 때는 그 검증 결과가 **호출자에게 도달하는 경로까지** 확인한다.
막는 코드와 알리는 코드는 다른 곳에 있고, 이 저장소에선 후자가 먼저 빠졌다.

## 되돌리면 안 되는 이유

- **거부는 페이지 저장 config 도 덮는다.** 기존 파일에 오타가 든 config 가 있으면 이제
  에러로 보고된다(`config: null` + `error`). 그건 회귀가 아니라 **원래 안 먹고 있던 설정이
  드러난 것**이다. 조용히 통과시키던 시절로 되돌리면 그 파일들은 다시 "설정한 줄 아는데
  안 걸린" 상태로 돌아간다.
- **카탈로그와 구현이 어긋나면 양방향으로 틀린다** — 멀쩡한 config 가 거부되거나 오타가
  통과한다. 그래서 유닛테스트가 24종 전부에 항목이 있는지, `enabled` 가 목록에 없는지,
  엔진이 실제로 읽는 키가 선언돼 있는지를 강제한다. 규칙에 파라미터를 추가하면
  **`BUILTIN_RULE_PARAMS` 에도 넣어야 한다.**
- **오타를 "관대하게" 넘기는 편의는 여기서 이득이 없다.** lint 는 결과가 곧 판단 근거라,
  틀린 설정으로 도는 것보다 멈추는 편이 언제나 싸다.
