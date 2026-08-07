# 005. 기하 lint 가 판정에 쓴 수치를 버렸다 — 고칠 때마다 get_tree 왕복

> 관련 코드: `packages/shared/src/lint/geometric.ts` (`insetDeficit`, `metrics`)
> 2026-08-07 실측 · 2026-08-08 수정

## 증상

```
"cell · 이름" (245:79012) 가 "row" 프레임 내부 좌표를 벗어남
```

**1px 인지 100px 인지 알 수 없다.** 자식을 줄일지 부모를 키울지가 초과량에 달려 있으므로,
호출자는 위반 1건마다 이렇게 돌았다:

1. `sigma_lint` → 위 메시지
2. `sigma_get_tree(nodeId=<row>, fields='geometry')` ← **순전히 수치 때문**
3. 부모 `width` 와 자식 `x + width` 를 손으로 빼서 초과량 확인
4. 그제야 고친다

그런데 그 수치는 **판정 시점에 이미 손에 있었다** — `insetOk(local, bb(c), 0)` 가 false 를
돌려주는 순간 어느 변이 얼마나 넘쳤는지가 확정돼 있고, 결과 불리언만 남기고 값은 버려졌다.

`child_overflow` 는 셀 하나 잘못 만들면 **인스턴스 수만큼** 뜨는 규칙이라(표 셀 스펙 하나로
250건 난 전례) 건당 왕복이 그대로 곱해졌다.

같은 저장소 안에 좋은 선례가 이미 있었다 — **스펙 등록 경고는 수치를 준다**
(`component-spec/validate.ts`): *"루트 height 40px 에서 border·padding 1px 를 빼면 내용상자는
39px 입니다 — 1번째 자식 <div> 의 height 가 40px 라 넘칩니다"*. **같은 결함을 등록 때는 이렇게
말해 주고 lint 때는 "벗어남" 이라고만 했다.**

## 무엇을 했나

`geometric.ts` 의 5건(`child_overflow` 섹션/프레임, `frame_padding`, `section_overlap`,
`card_overlap`)에 측정값을 넣고, `metrics` 필드로도 싣는다.

```jsonc
{ "rule": "child_overflow",
  "message": "\"inner\" (i) 가 \"cell\" 프레임 내부 좌표를 벗어남 — 아래 1px 초과 (프레임 48×39)",
  "metrics": { "sides": "bottom", "bottom": 1, "containerWidth": 48, "containerHeight": 39 } }
```

- **`metrics` 를 따로 두는 이유** = 호출자가 `message` 를 정규식으로 긁지 않게 하려는 것.
  문구를 파싱하기 시작하면 문구를 못 고친다.
- `insetOk` 는 삭제하지 않고 **`insetDeficit` 위에 얹었다.** 여러 규칙이 공유하므로 동작을
  바꾸면 안 된다(특히 "1px 은 봐 주면 안 된다" 회귀 테스트).

### epsilon 을 어디에 쓸지가 함정이다

`insetOk` 는 `GEOM_EPSILON`(0.05) 만큼 봐 준다. 그래서 초과량도 slack 기준으로 계산하면
**1px 넘쳤는데 "0.95px 넘침"** 이라고 보고하게 된다. epsilon 은 **위반이냐 아니냐를 가르는
데만** 쓰고, 보고 수치는 요구 pad 기준으로 낸다. 그래서 `insetDeficit` 은 epsilon 을 모른다.

정수 반올림도 안 된다 — Figma 좌표는 소수가 흔해서 `Math.round` 를 쓰면 **"0px 넘침"** 이
나온다. 소수점 둘째 자리까지 남긴다.

## 함정 — 테스트 픽스처에 `box` 라는 이름을 쓰지 말 것

새 테스트가 이유 없이 0건을 돌려줬다. 원인은 픽스처 프레임 이름을 `'box'` 로 지은 것 —
`ANNO_WIRE_NAMES`(`region`/`marker`/`legend`/`label`/**`box`**/`section_title`/`item`/`kv`/`note`)
는 기획 프리셋 인스턴스 이름이라 **공간 규칙에서 통째로 면제**된다. 규칙이 죽은 게 아니라
픽스처가 면제 대상이었다. 이름을 `panel` 로 바꾸니 바로 잡혔다.

> 이것도 "0건은 깨끗함과 안 돎을 구분해 주지 않는다"의 한 사례다([[004]] 참조).
> 새 lint 테스트는 **반드시 걸리는 픽스처로 먼저 1건 이상 나오는지** 확인하고 시작할 것.

## 범위 밖(그대로 둔 것)

- `component_needs_frame` · `outside_section` · `instance_orphan` — 판정이 불리언이라 실을 수치가 없다.
- `section_gap` · `stray_pixel` · `annotation_marker_gap` — **이미 수치를 싣고 있다.** 문구 형식을
  여기에 맞췄다.
- `child_overflow` 에 수정 op 를 싣는 것 — 프레임 확대는 디자인 변경이라 자동수정을 일부러
  안 하는 규칙이다. 처방을 단정하지 말고 수치만 준다.
