# 013. 오타를 막았더니 "왜 껐는지" 적을 자리가 사라졌다

> 관련 코드: `packages/server/src/lint/load-config.ts` (`COMMENT_KEY`, `checkCommentValue`),
> `packages/server/src/lint/run.ts` (`configUnreadable`)
> 2026-08-08 · [[011-lint-config-typos-were-silently-ignored]] 의 후속

## 증상

011 에서 모르는 키를 거부하게 만든 직후, **이미 쓰이던 설정 파일이 통째로 안 읽혔다.**

```
sigma_lint({configPath:"/root/.sigma/lint.json"})
→ config 최상위에 모르는 키가 있습니다: "_note"
```

`_note` 를 지우면 다음이 걸린다 — `builtins.fully_occluded_sibling._why`.
**거부 자체는 옳다.** 문제는 그 그물에 **의도적으로 넣은 메모**가 함께 걸렸다는 것이다.

## 메모는 장식이 아니었다

호출자 워크스페이스의 config 는 규칙을 켜고 끈 이유를 값 옆에 적어 왔다.

| 자리 | 내용(요약) |
|---|---|
| `fully_occluded_sibling._why` | *"예전에 끈 이유(`Cannot unwrap symbol` 크래시)는 이미 고쳐졌다. 다시 켜니 결함 3건이 나왔다"* |
| `stray_pixel._why` | *"인스턴스 내부를 빼도 실제 반픽셀이 110·85건 남는다. 오탐이 아니라 백로그"* |
| `font_not_default._why` | *"allow = 코드 블록 고정폭 폰트 예외"* |

⭐ **"오탐이 많아서 껐다" 는 메모에는 유효기간이 있다.** 숫자와 함께 남겨 두면 나중에 다시 켤 수
있고, 안 남기면 **원인이 고쳐진 뒤에도 옛 이유로 계속 꺼져 있는다** — 위 첫 줄이 정확히 그 사고다.
즉 메모는 **설정을 되돌아볼 수 있게 하는 유일한 장치**였다.

메모를 별도 파일로 옮기는 우회는 lint 를 되살렸지만 **설정과 사유를 갈라 놓았다.**
규칙을 고칠 때 사유를 안 보게 되고, 사유 파일은 곧 낡는다. 한 자리에 뒀던 이유가 그것이었다.

## 더 나빴던 것 — 페이지 저장 config 는 **조용히 폴백**했다

`configPath`/inline 은 호출이 실패해서 곧바로 안다. 그런데 **페이지에 저장된 config** 는
같은 검증에 걸려도 **호출이 성공하고 `configSource:"base"` 로 내려앉았다.**

```
sigma_lint({scope:"page"})
→ clean        : true          ← 거짓말
  configSource : "base"
  configError  : … "_intent", "_note" …
  byRule       : { card_overlap: 8 }   ← 그럴듯한 숫자까지 나온다
```

한 파일 **37페이지 중 16페이지**가 이 상태였다. 안 돈 것 = 커스텀 5종 전부 + opt-in 4종.
`annotation_layer` 가 꺼지면서 **주석 레이어 자동 면제가 사라져 `card_overlap` 오탐 8건**까지 났다.
즉 **"lint 0건" 보고가 사실은 「그 페이지 규칙이 하나도 안 돈 0건」** 이었다.

응답은 `configError`·`configSource`·`customRan` 을 정직하게 다 싣고 있었다 —
놓친 쪽은 `violations.length` 만 본 호출자다. 그래도 **틀린 값을 그럴듯하게 돌려주는 성공 응답**은
이 저장소가 계속 잡아 온 「조용한 no-op」 과 같은 부류다.

## 무엇을 했나

**1. `$comment` 한 개만 허용한다** (JSON Schema 관례). 허용 위치는 지금 모르는 키를 거부하는
모든 레벨 — 최상위 · `builtins.<rule>` · `custom[]` · `componentSpec.warn[]`.
값은 문자열 또는 문자열 배열이고, **검증만 통과하며 동작에는 일절 쓰이지 않는다.**

**2. 거부 메시지에 대안을 넣었다** — *"메모는 `$comment` 에 두세요"*.
호출자가 우회하려 들지 않게 **"그럼 어디에 쓰나"를 함께 주는** 것이 거부 메시지 설계의 기본이다.
이 한 줄이 없어서 메모가 다른 파일로 흩어졌다.

**3. config 를 못 읽은 실행은 `clean` 을 주장하지 못한다.** `scanTruncated` 와 같은 취급으로
맞췄다 — `configUnreadable: true` + `configWarning` 을 싣고 `clean` 을 false 로 강제한다.

## 되돌리면 안 되는 이유

- **`_` 접두 전체를 허용하지 말 것.** `_enabled`·`_paddin` 같은 오타가 그대로 통과해
  011 이 막은 것이 되살아난다. `$comment` **한 개**여야 엄격함과 자리를 동시에 얻는다.
  (유닛테스트가 `_note`·`builtin`·`builtins.foo`·`card_overlap.gaps`·`_enabled` 를
  positive control 로 붙들고 있다 — 자리를 넓히다 검증이 통째로 느슨해지는 것이 유일한 위험이다.)
- **`$comment` 를 동작에 쓰지 말 것.** 읽는 순간 메모가 계약이 되어 자유롭게 못 고친다.
  테스트가 "붙은 config 와 안 붙은 config 의 결과가 같다" 를 지킨다.
- **폴백을 조용히 되돌리지 말 것.** `clean:false` 가 과해 보이지만, 그 페이지 규칙이 하나도 안 돈
  실행은 깨끗함을 주장할 자격이 없다. 폴백 자체는 유지한다(전체 파일 순회가 한 페이지 때문에
  멈추면 안 된다) — 막는 것은 **그 결과를 clean 이라고 부르는 것**이다.
