# CSS → Figma 변환: 형상 재현의 원칙과 한계

## 핵심 원칙: 형상 동일성 (Visual Fidelity)

Sigma의 목표는 CSS 레이아웃 모델을 Figma Auto Layout으로 **정확히 변환**하는 것이 아니다.
**최종적으로 보이는 형태(위치, 크기, 색상)가 원본과 동일**하면 된다.

이 관점에서 Sigma에는 두 가지 변환 전략이 있다:

| 전략 | 방식 | 형상 정확도 | Figma 편집성 |
|------|------|-----------|-------------|
| **Auto Layout 변환** | CSS flex/grid → Figma Auto Layout | 대부분 정확, 일부 근사 | 높음 (구조 편집 가능) |
| **boundingRect 절대 배치** | 각 요소의 x, y, width, height로 배치 | **완벽** | 낮음 (고정 좌표) |

**boundingRect 절대 배치는 항상 형상을 완벽히 재현한다.**
브라우저가 렌더링한 최종 위치/크기 그대로 Figma에 배치하기 때문이다.

---

## 현재 아키텍처의 근본적 문제

### 문제: Auto Layout 실패 시 형상이 깨질 수 있다

현재 `node-creator.ts`의 변환 분기:

```
자식이 있는 요소
├── absolute 자식 있음?    → layoutMode = NONE + boundingRect 절대 배치 ✅ (형상 완벽)
├── 음수 margin 자식 있음? → layoutMode = NONE + boundingRect 절대 배치 ✅ (형상 완벽)
└── 그 외 (일반 flex/block) → Auto Layout 변환 시도 ⚠️
    ├── 성공 → 형상 유사 (대부분 정확)
    └── 실패 → 형상 깨짐 (fallback 없음) ❌
```

**Auto Layout 경로에는 실패 시 boundingRect fallback이 없다.**

Auto Layout 변환이 "실패"하는 경우:
1. CSS 스타일 값이 예상과 다르게 추출됨 (display, flexDirection 등)
2. 가변 margin이 균일 itemSpacing으로 근사되어 위치가 어긋남
3. stretch/sizing 휴리스틱이 2px 허용 오차 밖이라 미적용
4. overflow: visible에서 HUG 전환이 크기를 변경함

이 경우들에서 **형상이 원본과 달라지지만, 코드는 이를 감지하지 못하고 그대로 출력한다.**

### 해결 방향: Auto Layout 후 검증 → boundingRect fallback

```
자식이 있는 요소
├── absolute 자식 있음?    → boundingRect 절대 배치 ✅
├── 음수 margin 있음?      → boundingRect 절대 배치 ✅
└── 그 외 → Auto Layout 변환 시도
    ├── 검증: 자식의 Figma 위치 vs 원본 boundingRect 비교
    ├── 허용 오차 이내 → Auto Layout 유지 ✅
    └── 허용 오차 초과 → Auto Layout 해제 → boundingRect 재배치 ✅
```

이 접근법은:
- Auto Layout이 성공하면 편집성 보존
- 실패하면 형상 완벽 재현으로 fallback
- **형상이 깨지는 경우가 원리적으로 사라짐**

> **구현 위치**: `node-creator.ts`의 기존 Flex/Block 경로 (165~329행) 끝에 검증+fallback 로직 추가.
> Auto Layout 적용 후 각 자식의 `absoluteRenderBounds`와 원본 `boundingRect`를 비교하여 오차가 크면 NONE으로 전환.

---

## 레이아웃 변환의 세부 한계

### 1. CSS Flex ↔ Figma Auto Layout 매핑

현재 매핑 코드 (`layout.ts`)는 올바르게 구현되어 있다:

| CSS | Figma | 코드 위치 |
|-----|-------|----------|
| `flex-direction: row` | `layoutMode = 'HORIZONTAL'` | `layout.ts:66` |
| `flex-direction: column` | `layoutMode = 'VERTICAL'` | `layout.ts:66` |
| `justify-content: space-between` | `primaryAxisAlignItems = 'SPACE_BETWEEN'` | `layout.ts:270` |
| `align-items: center` | `counterAxisAlignItems = 'CENTER'` | `layout.ts:279` |
| `gap` | `itemSpacing` | `layout.ts:127-136` |
| `flex-wrap: wrap` | `layoutWrap = 'WRAP'` | `layout.ts:119-121` |

**형상이 깨지는 것은 매핑 로직의 문제가 아니라, 입력 데이터(추출된 styles)의 문제이거나 매핑이 근사적인 경우(가변 margin 등)이다.**

### 2. 가변 간격 → 균일 itemSpacing

CSS의 개별 margin으로 인한 가변 간격은 Figma Auto Layout에서 표현 불가.

| 원본 | Auto Layout 결과 | boundingRect 결과 |
|------|-----------------|-------------------|
| A-B: 20px, B-C: 10px | itemSpacing: 20 (최대값), C 위치 어긋남 | A, B, C 각각 정확한 위치 |

**형상 관점**: boundingRect 배치가 항상 정확. Auto Layout은 근사.

### 3. position: absolute 혼합

현재 코드는 absolute 자식이 하나라도 있으면 전체를 boundingRect로 전환한다.

**형상 관점**: 이미 올바른 처리. 형상은 완벽히 재현됨.

> **참고**: Figma Absolute Position 기능을 활용하면 Auto Layout 유지 + absolute 자식 개별 배치가 가능하지만, 이는 편집성 개선이지 형상 정확도와는 무관.

### 4. align-items: stretch

Figma `counterAxisAlignItems`에는 STRETCH가 없어 개별 자식에 `layoutAlign = 'STRETCH'`를 적용.
boundingRect 비교로 실제 stretch 여부를 판단하되, 2px 허용 오차가 있음.

**형상 관점**: 오차 이내면 정확. 오차 초과 시 stretch 미적용 → 크기가 달라짐 → boundingRect fallback이 필요한 이유.

---

## Computed Style 추출의 한계 (형상에 영향 없음)

`getComputedStyle()`이 반응형/상대적 크기 정보를 잃는 것은 사실이지만:
- `width: 100%`가 `384px`로 추출되어도, **형상은 384px로 정확**
- 반응형 동작은 잃지만, **캡처 시점의 뷰포트에서의 형상은 완벽히 보존**

이것은 형상 동일성 관점에서는 **한계가 아니다**. 정적 스냅샷의 형상은 computed px로 충분히 표현됨.

단, **Figma에서 편집 시 반응형으로 동작하지 않는 것**은 인지해야 함 (편집성의 한계, 형상의 한계 아님).

---

## 형상이 실제로 깨지는 경우들

### 1. 폰트 차이로 인한 텍스트 크기 변경

Sigma는 모든 텍스트를 Inter 폰트로 렌더링 (`node-creator.ts:411`).
원본 폰트와 Inter의 글리프 너비가 다르면 **텍스트 노드의 크기가 달라지고**, 이것이 부모 레이아웃에 영향.

**영향 범위**: 텍스트 크기 변화 → 부모 프레임 크기 변화 → 형제 요소 위치 변화.
Auto Layout 모드에서 특히 심각 (HUG 모드에서 텍스트 크기가 레이아웃을 결정하므로).

**완화**: boundingRect 절대 배치에서는 텍스트 크기가 달라져도 부모/형제에 영향 없음.

### 2. CORS로 인한 이미지 누락

`<img>` 태그가 CORS 제한으로 캡처 실패하면 빈 이미지 → 크기가 0이 되어 레이아웃 붕괴.

| 요소 | 변환 | CORS 시 |
|------|------|--------|
| `<img>` | canvas → base64 | 빈 이미지 (크기 0) |
| `<canvas>` | `toDataURL()` | 빈 이미지 |
| `background-image: url(...)` | 미지원 | 배경 누락 |
| SVG | 직렬화 | 대부분 성공 (인라인이므로) |

**완화**: boundingRect로 크기/위치는 유지되지만 이미지 내용은 빈 상태.

### 3. Auto Layout 크기 보정의 부작용

`node-creator.ts:315~328`에서 overflow: visible + Auto Layout 프레임의 크기를 HUG로 전환하는 로직이 있음.
이 보정이 원본 크기와 다른 크기를 만들 수 있음.

**형상 관점**: 이 보정 자체가 형상을 왜곡할 수 있는 위험. boundingRect 기반이면 이 보정이 불필요.

---

## 지원하지 않는 CSS 시각적 기능 (형상에 영향)

형상 동일성에 직접 영향을 주는 미지원 기능만 나열:

| CSS 기능 | 형상 영향 | 현재 처리 |
|----------|----------|----------|
| `transform: rotate/scale/skew` | 요소의 시각적 위치/크기/각도 변경 | 추출되지만 Figma에 미적용 |
| `filter: blur/brightness` | 시각적 효과 변경 | 무시 |
| `backdrop-filter` | 배경 블러 등 | 무시 |
| `clip-path` | 요소의 시각적 형태 변경 | 무시 |
| `mix-blend-mode` | 색상 혼합 | 무시 |
| `text-shadow` | 텍스트 그림자 | 무시 |
| `outline` | 테두리 외곽선 | 무시 |
| `background-image: url(...)` | 배경 이미지 | 무시 (gradient만 지원) |

형상에 영향 없는 것 (정적 스냅샷이므로 무시해도 됨):
- `transition`, `animation` — 동적 효과
- `cursor`, `pointer-events` — 인터랙션
- `@media` — 반응형 (캡처 시점 뷰포트 기준)

---

## 요약: 형상 재현 전략 가이드

### 최선: Auto Layout + 검증 + boundingRect fallback

```
1. Auto Layout 변환 시도 (편집성 보존)
2. 변환 후 형상 검증 (자식 위치/크기 비교)
3. 오차 초과 시 boundingRect 절대 배치 (형상 보장)
```

### 확실한 fallback: 전체 boundingRect 배치

Auto Layout을 포기하고 모든 요소를 boundingRect로 배치하면:
- **형상 정확도: 완벽** (위치, 크기, 색상 모두 원본과 동일)
- **편집성: 없음** (모든 요소가 고정 좌표)
- **현재 코드에 이미 이 경로 존재** (`node-creator.ts:92~128`, absolute 분기)

### 형상이 깨지는 근본 원인 정리

| 원인 | Auto Layout에서 | boundingRect에서 |
|------|----------------|-----------------|
| flex/gap 매핑 오류 | 위치 어긋남 | **해결** (정확한 좌표) |
| 가변 margin → 균일 spacing | 위치 어긋남 | **해결** |
| stretch 휴리스틱 실패 | 크기 다름 | **해결** |
| 폰트 차이 (Inter) | 텍스트 크기 → 레이아웃 변경 | 텍스트만 다름 (레이아웃 무관) |
| CORS 이미지 실패 | 이미지 빈 상태 | 이미지 빈 상태 (동일) |
| transform 미적용 | 위치/크기/각도 다름 | 위치/크기 정확, 각도만 다름 |
