# 컴포넌트 스펙 (Component Spec) — HTML 기반 컴포넌트 정의

엄격한 규칙의 HTML로 Figma 컴포넌트를 등록하고, 에이전트가 Figma 내부를 탐색하지 않고
`alias + props`만으로 인스턴스를 삽입하는 시스템.

```
검증:  sigma_create_component_spec(alias, description, html, validateOnly: true)
       → Figma 연결·토큰 없이 규칙 검증만 (사전 점검 dry-run)
등록:  sigma_create_component_spec(token, alias, description, html|htmlPath, namespace?, overwrite?)
       → html 대신 htmlPath(파일 경로)로 넘길 수 있다 (본문이 큰 스펙 — 아래 §이미지)
조회:  sigma_list_component_specs(namespace?)  → alias/설명/params/size/sizing (카탈로그)
       sigma_list_component_specs(alias)       → HTML 원문 포함 상세
사용:  sigma_create_component_spec_instance(token, alias, props, x, y, parentId, namespace?, width?, height?)
       sigma_create_component_spec_instance(token, instances: [{alias, props, x, y, parentId, ...}, ...])  ← 여러 개
       → width/height: 생성 직후 resize (hug 축은 FIXED로 전환 — placeholder 용도)
수정:  sigma_set_component_spec_instance_props(token, nodeId, props)
       → 기존 인스턴스의 param 재설정 (삭제 후 재생성 불필요, 넘침 시 warnings)
삭제:  sigma_delete_component_spec(token, alias, namespace?) → 레지스트리만 삭제 (Figma 노드 유지)
```

## 핵심 동작

- **네임스페이스**: 유일성 키는 `(namespace, alias)`. 같은 역할·다른 스타일 체계
  (기획 `plan` vs 디자인 `design`, 페이지별 테마)를 네임스페이스로 구분한다.
  미지정 시 `default`. use 시 alias가 여러 네임스페이스에 있으면 명시를 요구한다.
- **overwrite = in-place 갱신**: 기존 ComponentNode의 내용을 교체하므로 nodeId가
  유지되고 **기존 인스턴스에 자동 전파**된다. TEXT 속성은 이름으로 매칭해 재사용하므로
  인스턴스의 props 오버라이드도 유지된다. (노드가 삭제된 경우에만 신규 빌드로 폴백)
  - **응답의 `impact` 를 반드시 볼 것.** 갱신은 다른 페이지의 인스턴스에도 전파되는데 그
    파급이 화면 밖에서 일어난다. `impact.sizeChanged` 가 true 면 그 인스턴스 위에 얹힌
    주석 마커·영역 표시가 어긋나므로, `impact.instances.pages` 에 나온 페이지들에
    `sigma_lint`(`annotation_marker_gap`)를 다시 돌린다. 실제로 이걸 몰라서 같은 사고가
    두 번 났다 — 상세는 [`docs/history/007-spec-update-propagated-in-silence.md`](history/007-spec-update-propagated-in-silence.md).
  - 삭제(`deleteNode:true`)는 인스턴스가 남아 있으면 **개수·페이지와 함께 거부**한다
    (`force:true` 로만 강행). 레지스트리만 지우는 경우는 마스터가 남으므로 막지 않는다.
- **파일 스코프**: 등록 시 파일 ID(`figma.root` pluginData `sigma-file-id`, 최초 1회
  발급)를 레코드에 기록하고, use 시 현재 파일과 대조한다. 다른 파일에서 등록된
  컴포넌트를 쓰려 하면 출처 파일명을 알려주며 거부한다.
- **size / sizing**: 카탈로그의 `size`는 기본 상태 크기, `sizing`은 축별 동작 —
  `hug`(내용에 따라 늘어남, 뱃지처럼) / `fixed`(스펙에 width/height 명시, 인풋처럼).
  스펙 루트의 크기 명시 여부에서 유도된다.
- **넘침 경고**: fixed 축 컴포넌트에 긴 props를 넣어 텍스트가 컴포넌트 영역을
  벗어나거나(가로 삐져나옴), 줄바꿈으로 인스턴스 높이가 기본의 1.5배를 넘으면
  use 응답에 `warnings`로 알려준다 (조용한 삐져나옴·변형 방지). hug 축은 컴포넌트가
  함께 늘어나므로 검사하지 않는다.
- **외부 에이전트 온보딩**: 규칙 전문이 `sigma_create_component_spec` 도구 설명에
  요약돼 있고, 빈 카탈로그 조회 시 `specRules`로 안내되며, `validateOnly: true`로
  등록 없이 사전 검증할 수 있다 — 이 저장소의 문서 없이도 MCP만으로 사용 가능.

## 설계 원칙

1. **스펙 언어는 HTML+CSS의 엄격한 부분집합** — 새 언어를 발명하지 않는다.
   에이전트(LLM)는 HTML/CSS에 이미 유창하므로 학습 비용이 0이다.
2. **화이트리스트 + 값 검증** — 변환기가 Figma로 손실 없이 옮길 수 있다고 보장된
   속성·값만 통과시킨다. 벗어나면 **조용히 근사하지 않고 등록을 거부**하며
   위반 항목 전체를 나열한다.
3. **계약의 이중 저장** — 서버 레지스트리(`~/.sigma/component-specs/`)가 카탈로그,
   Figma 컴포넌트 노드의 pluginData(`sigma-spec`)가 파일 내장 진실.
   사용 시 검증에 실패하면 명시적 "계약 위반" 에러를 낸다
   (컴포넌트가 삭제된 limbo 상태 포함).

## 다른 컴포넌트와 조합 — 스펙 HTML은 인스턴스를 못 품는다

⚠️ **가장 흔한 함정.** 스펙 HTML은 정적 `div/text/svg` leaf만 만든다.
**이미 등록된 다른 컴포넌트(OneUI 등)의 인스턴스를 스펙 HTML 안에 넣을 수 없다.**
그래서 "검색창·버튼이 든 리스트 화면"을 만들려고 스펙 하나에 다 담으려 하면,
OneUI 검색/버튼의 외형을 raw `div`로 **흉내내게 되는데 — 이는 디자인시스템과 어긋나는 잘못된 길이다.**

기존 컴포넌트를 재사용해 더 큰 컴포넌트를 조립하려면 **스펙이 아니라 네이티브 컴포넌트 경로**를 쓴다
(Figma 네이티브 컴포넌트는 인스턴스를 자식으로 품지만, 스펙 HTML은 못 품는다):

```
1) sigma_create_component(x,y,width,height,name)         → 빈 COMPONENT
2) sigma_create_component_spec_instance(parentId=comp)    → OneUI 등 실제 인스턴스를 자식으로 삽입
   sigma_create_component_instance(parentId=comp)         → (다른 네이티브 컴포넌트 인스턴스도 동일)
   sigma_create_text(parentId=comp)                       → 순수 텍스트(제목·라벨)는 raw 텍스트로
3) 이 조합 컴포넌트의 인스턴스를 화면마다 찍고(sigma_create_component_instance),
   per-instance로 바꿀 부분만 중첩 노드 id로 override:
     - 중첩 raw 텍스트     → sigma_modify_node(setCharacters), nodeId="I<instance>;<childId>"
     - 중첩 스펙 인스턴스   → sigma_set_component_spec_instance_props, nodeId="I<instance>;<childId>"
```

**역할 분담**: 등록 컴포넌트에 **있는** 조각(배지·버튼·검색·셀렉트·페이지네이션…)은 그 인스턴스를 삽입해 쓰고,
등록 컴포넌트에 **없는** 조각(표·차트 등)만 스펙으로 새로 만들어 이 조합에 끼워넣는다.
스펙은 "없는 프리미티브를 채우는 도구"이지, "OneUI를 재현하는 도구"가 아니다.

> 중첩 인스턴스의 텍스트·스펙 props는 per-instance override가 되고(검증됨), 중첩 인스턴스의
> 메인 컴포넌트 교체는 sigma_swap_component로 가능하다. 즉 조합 + override + swap으로
> 재사용성과 실제 디자인시스템 컴포넌트 사용을 동시에 얻는다.

## 스펙 HTML 규칙

### 구조

| 규칙 | 설명 |
|------|------|
| 단일 루트 | 루트 요소는 1개. 루트가 컴포넌트 프레임이 된다 |
| inline style만 | `<style>` 블록·class 셀렉터 불가 (variant 단계에서 확장 예정) |
| 컨테이너 태그 | `div`, `button`만 자식 요소 보유 가능. **자식이 있으면 `display: flex` 명시 필수** (암시적 블록 배치 불가) |
| 텍스트 태그 | `span, p, h1~h6, a, strong, em, b, i` — **leaf 전용** (자식 요소 금지, rich text 중첩은 이후 단계) |
| void 태그 | `img`, `br` — **`img`의 `src`는 base64 data URI만**(아래 §이미지) |
| 허용 HTML 속성 | `style`, `src`, `alt`, `href`, `data-sigma-*` |

### 배치는 Auto Layout으로만

- `position` 불가 — absolute/relative 배치는 표현되지 않는다.
- `text-align` 불가 — TextNode는 내용에 맞는(hug) 폭이라 정렬할 공간이 없다.
  **정렬은 부모 컨테이너의 `justify-content` / `align-items`로 표현한다.**
- 순수 텍스트 요소(배경/패딩 없는 span 등)의 `width`/`height`는 무시되므로 거부된다.
  크기가 필요하면 부모 div로 감싸 크기를 준다.

### CSS 속성 화이트리스트

| 분류 | 속성 |
|------|------|
| 크기 | `width`, `height` |
| 레이아웃 | `display`(flex만), `flex-direction`, `justify-content`, `align-items`, `align-self`, `gap`, `flex-wrap`, `flex-grow`, `flex-shrink`, `overflow` |
| 여백 | `padding`(+개별 4방향) |
| 배경/색 | `background-color`, `background`(단색만), `color`, `opacity` |
| 테두리 | `border-width`(+개별), `border-color`(+개별), `border-radius`(1~4값) |
| 텍스트 | `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing` |
| 효과 | `box-shadow`(inset 불가) |

### 값 규칙 (속성이 허용되어도 값이 틀리면 거부)

| 분류 | 규칙 | 거부 예 |
|------|------|---------|
| 길이 | **px 필수** (0만 단위 생략 가능) | `100%`, `1.5rem`, `1em`, `calc(...)`, `var(...)` |
| 색상 | hex / rgb / rgba / 색상명 (parseColor 해석 가능해야 함) | `linear-gradient(...)`, `var(--x)` |
| enum | `display: flex` / `flex-direction: row\|column` / `justify-content: flex-start\|center\|flex-end\|space-between` / `align-items: flex-start\|center\|flex-end\|stretch` / `flex-wrap: nowrap\|wrap` / `overflow: visible\|hidden` | `display: block`, `justify-content: space-around` |
| 숫자 | `opacity`, `flex-grow`, `flex-shrink` — 단위 없는 숫자 | — |
| font-weight | `normal`, `bold`, `100`~`900` | `650` |
| font-family | 폰트 이름 (쉼표 폴백 체인 가능, 따옴표 허용) | `var(--font)`, `local(X)` |

> 이 값 규칙들은 라이브 검증에서 발견된 실제 손상 사례에 근거한다:
> `width: 100%` → 100px로 오변환, `1.5rem` → 1.5px, gradient → 배경 소실, `1em` → 1px.
> parseFloat 기반 파서가 단위를 버리기 때문에, 값 검증 없이는 조용히 틀린 결과가 나온다.

**`font-family`는 대개 생략한다.** 생략하면 그 파일의 기본 폰트로 렌더된다 —
`sigma_set_page_data(pageId: "document", key: "fonts", value: '{"default":"Pretendard"}')`.
폰트는 파일의 디자인 시스템에 속하는 결정이므로 스펙마다 반복해 적지 않는다(설정이 없으면 Inter).
지정한 폰트가 실행 환경에 없으면 파일 기본 폰트 → Inter 순으로 폴백한다.

### 텍스트 파라미터 (slot)

```html
<span data-sigma-slot="text" data-sigma-desc="버튼에 표시할 라벨"
      style="font-size: 12px; color: #1565C0;">기본값</span>
```

- `data-sigma-slot="이름"` — 빌드 시 Figma 네이티브 **TEXT 컴포넌트 속성**으로 승격.
- `data-sigma-desc="설명"` — (선택) 카탈로그에 노출되는 파라미터 설명. slot 요소에만 허용.
- slot 이름: `^[a-z][a-z0-9_]*$`, 스펙 내 중복 불가.
- **텍스트 태그에만**, **루트 불가**, 자식 요소 불가, 기본 텍스트 필수.
- slot 요소에는 순수 텍스트 속성만 허용: `font-family`, `font-size`, `font-weight`,
  `line-height`, `letter-spacing`, `color`, `opacity`, `text-overflow`(아래).
  배경/패딩/보더/크기는 부모 컨테이너에 둔다 — slot이 프레임으로 승격되면
  "slot = 단일 TextNode" 계약이 깨지기 때문.

### 긴 텍스트 처리 (ellipsis / wrap)

고정폭 컨테이너 안의 slot은 긴 값이 들어오면 글자가 박스 밖으로 삐져나온다.
두 가지 처리 모드를 slot에 선언할 수 있다 (상호배타):

| 선언 | 동작 | 용도 |
|------|------|------|
| `text-overflow: ellipsis` | 단일 행, 넘치면 `…` | 드롭다운 값, 목록 항목 |
| `white-space: normal` | 다중 행 줄바꿈 (높이 성장) | 주석, 본문 문단 |

```html
<div style="display: flex; width: 220px; ...">
  <span data-sigma-slot="value" style="text-overflow: ellipsis;">Select</span>
</div>
<div style="display: flex; width: 260px; ...">
  <span data-sigma-slot="note" style="white-space: normal;">주석 내용</span>
</div>
```

- 두 모드 모두 **직계 부모 컨테이너에 width 명시 필수** (hug 부모에서는 무의미 + 거부).
- 둘 다 없는 fixed 컴포넌트에 긴 값을 넣으면 use 응답의 `warnings`로 넘침을 알려준다.
- 카탈로그 param에 `truncates: true` / `wraps: true`로 노출된다.

## 이미지 (`<img>`) — base64 data URI만

```html
<img src="data:image/png;base64,iVBORw0KGgo..." alt="로고"
     style="width: 24px; height: 24px;">
```

- **`src`는 `data:image/…` 형태만 허용된다.** 원격 URL(`https://…`)·상대 경로는
  **등록 단계에서 거부**된다 — Figma 플러그인은 네트워크로 이미지를 가져올 수 없어,
  통과시키면 조용히 회색 플레이스홀더 프레임이 되기 때문이다. `src` 누락도 거부.
- 스펙 경로의 이미지는 `scaleMode: FIT`으로 그려진다(잘리지 않음). 스펙에 넣는 건
  대개 로고·마크라 크롭되면 안 되기 때문 — 브라우저 추출 경로(`FILL`)와 다르다.
- 노드 이름은 `alt` 우선, 없으면 `"image"`. (data URI를 파일명처럼 자르면
  `[IMG] png;base64,iVBORw0…`가 이름이 되므로.)

### 본문이 큰 스펙은 `htmlPath`로

base64 이미지를 담은 스펙은 본문이 수십 KB가 된다. 이걸 호출 인자로 옮겨 적으면
**중간에 한 글자만 어긋나도 등록은 통과하고(구조는 멀쩡하니까) 렌더만 실패한다** —
플러그인의 `createImage`가 던지고 회색 플레이스홀더만 남는 조용한 실패다.

```
sigma_create_component_spec({ token, alias, description, htmlPath: "~/.sigma/specs/logo.html" })
```

- `html`과 `htmlPath`는 **상호배타**(둘 다 주면 거부). 이제 `html`은 필수가 아니다.
- 경로는 **서버 자신의 파일시스템 기준**이다 — Docker 배포면 컨테이너 경로
  (호스트 `~/.sigma` ↔ 컨테이너 `/root/.sigma`). `configPath`와 같은 주의사항.

## 내장 프리셋 (표준 컴포넌트 팩)

sigma가 미리 정의한 스펙 팩을 `sigma_import_spec_preset(token, preset)`으로
현재 파일에 등록할 수 있다. 등록 후에는 일반 스펙과 완전히 동일하게 동작한다
(인스턴스 생성, props 재설정, overwrite 커스터마이즈 전부 가능).

| preset | namespace | 구성 |
|--------|-----------|------|
| `annotation` | `anno` | `region`(영역 강조 사각형), `marker`(번호 마커 ①), `legend`(범례 행 — 번호+줄바꿈 설명), `label`(라벨 칩) |
| `wireframe` | `wire` | `box`(placeholder), `section_title`, `item`(목록 행), `kv`(설정 행, ellipsis), `note`(메모, wrap) |

- 이미 등록된 항목은 건너뛴다 (`overwrite: true`면 in-place 갱신 → 인스턴스 전파).
- 프리셋 HTML은 유닛 테스트가 스펙 검증기 통과를 강제한다 (`spec-presets.test.ts`).
- 기획 주석 관례: **번호 마커 + 범례**가 기본 (마커를 대상 프레임 안에 넣으면 함께
  이동). 영역 강조는 위치 스냅샷이므로 대상을 옮기면 함께 옮겨야 한다.
- **프레임 위 오버레이 레시피**: Auto Layout 프레임 위에 region을 씌우려면
  ① `parentId` 없이 생성 → ② `sigma_move_node(nodeId, parentId: 프레임)` →
  ③ `sigma_modify_node(setLayoutPositioning, {positioning: "ABSOLUTE"})` →
  ④ `sigma_modify_node(move, {x, y})` (프레임 상대 좌표). flow에 끼어들지 않고
  겹쳐진다.

## 예시

```html
<!-- 뱃지: 텍스트 파라미터 1개 -->
<div style="display: flex; align-items: center; padding: 2px 8px;
            background-color: #E3F2FD; border-radius: 10px;">
  <span data-sigma-slot="text"
        style="font-size: 12px; font-weight: 600; color: #1565C0;">Badge</span>
</div>
```

```
sigma_create_component_spec(token, alias: "ui_badge", description: "상태 표시용 뱃지", html: ...)
sigma_create_component_spec_instance(token, alias: "ui_badge", props: {text: "완료"}, parentId: "12:34")
```

검증된 레이아웃 패턴 (라이브 테스트 PASS):
column/row + `gap`, `padding`, `justify-content: space-between / flex-end / center`,
`align-items: center`, `flex-grow: 1`(잔여 공간 채움), 중첩 컨테이너,
`border-width`+`border-color`, 개별 면 보더(`border-left-width` 액센트, 탭 밑줄),
`box-shadow`, 부분 `border-radius`(`12px 12px 0 0`), 원형(`border-radius` = 크기/2),
stretch(기본값) 폭 채움, 고정 열 너비 테이블(셀을 `width` 지정 div로).

실전 검증 완료 컴포넌트 12종 (Playground):
button, text_input, dropdown, checkbox, toggle, avatar, alert, tabs, progress,
autocomplete, card, table — 전부 등록·인스턴스 생성·Auto Layout 조합(폼) PASS.

참고: 스펙 루트에 배경을 지정하지 않으면 **투명**으로 유지된다
(일반 프레임 임포트의 "루트 흰 배경 대체" 규칙은 컴포넌트에 적용되지 않음 —
체크박스처럼 임의 배경 위에 놓이는 컴포넌트의 조합성을 위해).

## 에러 동작

| 상황 | 응답 |
|------|------|
| 규칙 위반 HTML | 등록 거부 + `violations` 배열에 위반 전체 나열 |
| 중복 alias | 거부 + `overwrite: true` 안내 |
| 미등록 alias 사용 | 에러 + `available` 목록 |
| 알 수 없는 props | 에러 + 사용 가능 param 목록 |
| 컴포넌트 노드 삭제 후 사용 | "계약 위반 ... 다시 등록하세요" (Figma의 limbo 컴포넌트로 조용히 생성하지 않음) |

## 등록 시 박스모델 경고 (`warnings`)

등록·`validateOnly` 양쪽에서, 루트의 `width`/`height`에서 border·padding을 뺀 **내용상자보다 큰
직계 자식**이 있으면 응답에 `warnings: string[]`가 실린다 (`packages/shared/src/component-spec/validate.ts`).

- **거부하지 않는다.** 이미 등록된 스펙을 깨지 않기 위해서다.
- **둘 다 px로 명시됐을 때만 판정한다.** 한쪽이라도 hug(내용에 맞춤)이면 넘침을 단정할 수 없다.
- per-side 선언이 shorthand를 이기는 CSS 규칙 그대로 계산한다.
- 고칠 값을 **양쪽으로 제시**한다 — 자식을 N px로 줄이거나, 루트를 M px로 키우거나.
- **무시했을 때의 대가**: 이 스펙으로 만든 **인스턴스마다** `child_overflow` 위반이 하나씩 생긴다.
  실제로 표 셀 스펙 하나로 한 번에 250건이 났고, 그때는 이미 찍힌 인스턴스를 전부 손봐야 했다.
  등록 때 1건으로 듣는 편이 압도적으로 싸다.

> ⚠️ `warnings`와 `policyWarnings`는 다른 것이다.
> - `warnings` = **형식 검증** 결과. 스펙 HTML 자체가 기하학적으로 앞뒤가 안 맞는다는 뜻.
>   파일과 무관하게 항상 검사되고 `validateOnly`에서도 나온다.
> - `policyWarnings` = **파일별 규약** 위반. 그 Figma 파일의 문서 노드에 저장된 `componentSpec.warn`에
>   걸렸다는 뜻. 대상 파일을 특정할 수 없는 `validateOnly`에서는 나오지 않는다.

## 파일별 등록 정책 (`componentSpec.warn`)

"이 Figma 파일에선 이런 이름으로 스펙을 등록하지 말자"를 **경고**로 거는 장치.
저장소는 lint config와 같다 — 문서(document) 노드의 `sharedPluginData("sigma","lint")`.

```jsonc
// 파일 전체에 적용 (문서 노드에 저장)
sigma_set_page_data({ token, pageId: "document", key: "lint", value: JSON.stringify({
  componentSpec: {
    warn: [
      { aliasPattern: "^table$", message: "테이블은 wire/table 프리셋을 쓰세요" },
      { aliasPattern: "^btn_",  message: "버튼은 ui_button 권장", namespace: "design" },
      // 이름으로는 못 잡는 규약 — 아이콘 창작은 대부분 "다른 컴포넌트 HTML 안에 묻힌 inline <svg>" 로 들어온다
      { htmlPattern: "<svg", unlessDescription: "출처",
        message: "아이콘을 새로 그리지 말고 등록된 세트에서 가져오세요 — 부득이하면 description 에 출처를 적으세요" }
    ]
  }
}) })
```

- **적용 시점**: `sigma_create_component_spec` 의 등록·`overwrite` 갱신 **양쪽**. 매칭되면 응답에 `policyWarnings` 배열이 실린다.
- **경고일 뿐 거부가 아니다.** 등록은 그대로 완료된다 — 규약을 아직 합의하지 못한 팀에서 도구가 먼저 벽이 되는 걸 피한다.
- **판정 입력은 네 개다** (`packages/shared/src/component-spec/policy.ts`):

  | 필드 | 역할 |
  |---|---|
  | `aliasPattern` | alias에 거는 정규식 (예: `"^table$"`) |
  | `htmlPattern` | **스펙 HTML 내용**에 거는 정규식 (예: `"<svg"`) |
  | `unlessDescription` | description이 이 정규식에 걸리면 **면제** |
  | `namespace` | 이 namespace에서만 적용 (생략 시 전체) |

  `aliasPattern`과 `htmlPattern`을 함께 주면 **AND**(둘 다 걸려야 경고)다. 규칙 하나에는
  **둘 중 최소 하나가 필요**하다 — 조건이 없으면 전 스펙에 매칭돼 경고가 무의미해지므로
  config 검증 단계에서 거부된다.
- **HTML 내용도 이 정책의 판정 대상이다.** alias로는 못 잡는 규약이 있기 때문이다 — 대표적으로
  "아이콘을 새로 그리지 마라"는 위반이 *아이콘 스펙*이 아니라 **다른 컴포넌트 HTML 안에 묻힌
  inline `<svg>`** 로 들어온다(손그림 고래·정렬 캐럿·가짜 로고가 전부 그랬다). 이때는 위 예제처럼
  걸고, 정당한 사례는 description에 출처를 적어 면제받는다. 한편 **무엇이 유효한 HTML인가**
  (화이트리스트·값 검증)는 여전히 §스펙 HTML 규칙의 몫이고, **문서에 놓인 노드** 검사는
  [lint/](lint/)의 몫이다.
- `validateOnly: true`(토큰 없는 dry-run)에선 대상 파일을 특정할 수 없어 **검사하지 않는다**.
- 잘못된 정규식은 조용히 무시하지 않고 "패턴이 잘못돼 건너뛰었다"는 경고를 대신 낸다(안 도는 정책이 통과처럼 보이는 걸 막는다). 정책 조회 자체가 실패하면 경고 없이 등록만 진행한다.
- ⚠️ **한계 두 가지.** ① 게이트는 sigma 도구 경로만 덮는다 — 사람이 Figma에서 직접 만든 컴포넌트엔 안 걸린다. ② **레지스트리는 서버 전역**(`~/.sigma/component-specs/<namespace>__<alias>.json`)이라 다른 파일에 바인딩해 등록하면 정책을 우회할 수 있고, 그렇게 등록된 스펙은 이 파일에서도 보인다. 실수 방지용이지 강제 수단이 아니다.

## 구현 위치

| 레이어 | 파일 |
|--------|------|
| 검증기 (규칙의 단일 원천) | `packages/shared/src/component-spec/validate.ts` |
| 파일별 등록 정책 | `packages/shared/src/component-spec/policy.ts` (순수 함수) |
| 타입 | `packages/shared/src/component-spec/types.ts` |
| 빌드/사용 (Figma) | `packages/figma-plugin/src/node-ops/component-spec.ts` |
| slot 마커 전달 | `packages/figma-plugin/src/converter/node-creator.ts` (`data-sigma-slot` → pluginData) |
| MCP 핸들러 | `packages/server/src/mcp/handlers/component-spec.ts` |
| 레지스트리 저장소 | `packages/server/src/storage/component-specs.ts` |

## 이후 단계 (미구현)

- **variant**: class 기반 CSS(`.badge.sm`) 파싱 + Component Set 빌드 + enum param
- **adopt**: 손으로 만든 컴포넌트의 구조 검증 후 편입
- **boolean slot**(표시/숨김), **INSTANCE_SWAP**(아이콘 교체)
- rich text(텍스트 태그 중첩), text-align(고정폭 다중행 텍스트)
- 같은 HTML 소스에서 코드 컴포넌트(React 등) 생성
