# 012. 손으로 쓴 HTML 은 `boundingRect` 가 없어서, 그걸 정답으로 믿던 분기가 전부 오작동했다

> 관련 코드: `packages/figma-plugin/src/converter/node-creator.ts`
> (cross-axis stretch 이중 분기 · Auto Layout 형상검증 게이트),
> `packages/figma-plugin/src/converter/html-parser.ts` (`extractPositionFromStyle`),
> `packages/figma-plugin/src/converter/layout.ts` (`applySizingMode` 루트 HUG)
> 2026-06-30 ~ 07-12, 라이브 검증에서 3차에 걸쳐 발견 (`ef734eb` → `77bc445` → `50e6e6a` → `2296973`)

## 무엇이 전제였나

`sigma_create_frame` 의 `format:"html"` 은 원래 **Sigma 확장이 브라우저에서 추출한 데이터**를 위한
경로다. 그 데이터는 노드마다 **실측 `boundingRect`** 가 채워져 있고, 변환 파이프라인 곳곳이
그 값을 **"정답"으로 신뢰**하도록 짜여 있었다.

그런데 컴포넌트 스펙이 들어오면서 **사람이 인라인 스타일로 직접 쓴 HTML** 이 같은 경로를 타게 됐다.
손-HTML 은 컨테이너에 크기를 잘 주지 않으므로 대부분의 `boundingRect` 가 `0` 이다.
**전제가 깨졌는데 그 전제를 쓰는 분기는 그대로였다.**

## 증상 — 세 번에 걸쳐 다르게 터졌다

| 차수 | 증상 | 원인이 된 분기 |
|---|---|---|
| 1 (`ef734eb`) | 루트 height 미지정이면 전체가 **1px 로 찌부** | `applySizingMode` 가 루트를 무조건 `FIXED` → `resize(_, max(0,1)) = 1` |
| 2 (`77bc445`) | flex 자식의 **cross-axis stretch 미적용**(색 박스가 텍스트 폭으로 수축) + autolayout 이 통째로 풀려 **자식들이 (0,0) 에 겹침** | stretch 판정 `Math.abs(childCross - parentInnerCross) < 2` 가 `0` 대 `parentInnerCross` 라 항상 실패 · 형상검증이 `(0,0,0,0)` 기준이라 **무조건 실패** → 절대배치 fallback |
| 3 (`50e6e6a`) | 2차 수정 후에도 **부분 실측 혼합**에서 같은 파괴가 재발 | `extractBoundingFromStyle` 이 인라인 `width` 만 rect 에 반영 → "자식 하나라도 w>0" 을 실측으로 오판 |
| 3′ (`2296973`) | 루트·자식이 **모두 고정 크기**인 컴포넌트(토글·프로그레스)가 "완전 실측" 으로 오판돼 또 파괴 | html-parser 가 style 의 `width/height` 를 rect 에 **날조**하고 있었다 |

핵심은 2·3 이 **같은 결함의 재발**이라는 것이다. "rect 가 0 이면 손-HTML" 이라는 1차 판정은
**부분적으로 채워진 rect** 앞에서 무너졌다. 세 번째에 가서야 판정 기준을 **부모 rect 가 완전
실측(w>0 && h>0)일 때만** 으로 통일하고, rect 에는 **위치(left/top)만** 담고 크기는 `styles` 로만
전달하도록(SVG 분기 예외) 근원을 막았다.

## 무엇을 했나

**rect 를 믿는 분기마다 "이 데이터가 실측인가" 게이트를 붙이고, 아니면 CSS 의미론으로 간다.**

- **stretch** — rect 유효: 종전대로 실측 비교(HUG/FIXED 자식 보호). rect 무효: `align-items:stretch`
  의미론을 직접 적용하되 **교차축 크기가 명시된 자식과 TEXT 는 제외**
  (TEXT 에 FILL 을 걸면 `textAutoResize` 가 바뀌어 폭이 굳고 줄바꿈되는 부작용).
- **형상검증** — 부모 rect 가 완전 실측일 때만 수행하고, **비교 대상도 완전 실측 자식으로 한정**.
- **파서** — 일반 요소의 rect 에는 위치만 담는다. 크기를 넣으면 "완전 실측" 오판이 되살아난다.

확장 추출 경로(rect 유효)는 게이트가 항상 true 라 **기존 로직을 그대로 탄다** — 무손상이 설계 조건이었다.

## 되돌리면 안 되는 이유

- **게이트는 군더더기처럼 보인다.** `parentFullyMeasured` 나 `if (rect 유효) … else …` 이중 분기는
  "한쪽으로 합치면 깔끔하지 않나" 로 읽힌다. 합치는 순간 **둘 중 한 입력이 반드시 깨진다** —
  실측 쪽으로 합치면 손-HTML 이 절대배치로 파괴되고, CSS 의미론 쪽으로 합치면 확장 추출
  데이터의 HUG/FIXED 자식이 전부 늘어난다. 두 입력이 같은 경로를 타는 한 분기는 남아야 한다.
- **"부분 실측" 이 이 결함의 진짜 얼굴이다.** `rect === 0` 만 막는 판정은 두 번 무너졌다.
  새 분기를 넣을 때도 **`w>0 && h>0` 둘 다** 로 판정할 것. 한쪽만 보면 3차 사고가 재현된다.
- **파서가 크기를 rect 에 넣지 않는 것은 실수가 아니다.** 편의상 채우고 싶어지지만, 그러면
  아래 모든 게이트가 동시에 무력해진다. 크기는 `styles` 로만 흐른다(SVG 분기만 예외).
- 검증은 **두 입력을 다 돌려야 한다** — 확장 추출 데이터와 손-HTML. 한쪽만 보면 통과한다.

## 남은 한계

결과 예측이 중요한 작업은 `format:"html"` 대신 네이티브 노드 생성이나 컴포넌트 스펙 경로를 쓴다.
스펙 HTML 은 검증기(`shared/src/component-spec/validate.ts`)가 위험한 CSS 를 등록 시점에 거부하므로,
이 문제의 입력 자체가 좁혀져 있다 — 그 검증기가 `50e6e6a` 에서 함께 도입된 것도 같은 이유다.
