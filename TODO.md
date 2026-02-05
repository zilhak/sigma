# Sigma 추가 개발 TODO

> Figma MCP 의존 제거, Sigma Plugin 자체적으로 양방향 변환 지원

## 목표

Sigma Plugin이 독립적으로 다음 기능을 수행:
- **Web → Figma**: HTML/JSON에서 Figma 컴포넌트 생성 (현재 구현됨)
- **Figma → JSON**: Figma 컴포넌트를 ExtractedNode JSON으로 추출 (신규)
- **Figma → HTML**: Figma 컴포넌트를 HTML로 추출 (신규)
- **컴포넌트 수정**: 기존 프레임을 수정된 데이터로 교체 (신규)

---

## Phase 1: JSON 입력 안정화

**목표**: HTML → JSON → Figma 변환의 정합성 확보

### 작업 프로세스

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  이슈 발견   │ ──▶ │  원인 파악   │ ──▶ │  코드 수정   │ ──▶ │  수정 확인   │
│ (테스트)    │     │  및 분석    │     │             │     │ (재테스트)  │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                                                          ┌────────▼────────┐
                                                          │   성공 시        │
                                                          │ 다음 Story로    │
                                                          │   반복          │
                                                          └─────────────────┘
```

**단계별 설명:**
1. **이슈 발견**: Storybook에서 컴포넌트 추출 → Figma에 생성 → 스크린샷 비교
2. **원인 파악**: Figma Plugin 코드 분석, JSON 구조 확인
3. **코드 수정**: `packages/figma-plugin/src/` 코드 수정
4. **수정 확인**: 동일 컴포넌트 재테스트로 이슈 해결 확인
5. **반복**: 성공 시 다음 Story 대상으로 동일 프로세스 반복

> **중요:** 컴포넌트 추출은 반드시 **Chrome Extension**을 통해 수행합니다.
>
> ```
> ❌ playwright_evaluate()로 직접 DOM 추출 로직 작성
> ✅ Playwright로 Extension 팝업 조작 → Extension이 추출 → 서버 전송
> ```
>
> Extension의 `content.ts`에 구현된 `extractElement()` 함수가 모든 추출 로직을 담당합니다.
> 이미 만들어진 추출 기능을 사용하지 않고 별도로 작성하면 Extension 코드가 테스트되지 않습니다.

### 현황
- [x] 기본 변환 로직 구현
- [x] Border 버그 수정 (TextNode stroke 미지원 이슈)
- [x] Margin 추출 버그 수정 (하드코딩 0 → 실제값 추출)
- [x] SVG 지원 구현 (`createNodeFromSvg` 사용)
- [x] display: grid 지원 추가
- [x] inline-block 레이아웃 수정 (block 부모 + inline-block 자식 → HORIZONTAL)
- [ ] 다양한 컴포넌트에서 검증 필요

### 테스트 결과 (진행중)

| 컴포넌트 | 결과 | 이슈 |
|---------|------|------|
| CCBadge | ✅ PASS | - |
| CCInfoPanel | ✅ PASS | display: grid 지원 추가로 해결 |
| CCStatusIndicator | ✅ PASS | Dots Small 변형 테스트 완료 (JSON 13.6KB) |
| CCSpinner | ⚠️ 제한 | 애니메이션 + 면별 border 색상 (Figma 미지원) |
| CCButton | ✅ PASS | - |
| CCToggle | ✅ PASS | SVG 지원 구현 완료 (`createNodeFromSvg` 사용) |
| CCBanner | ✅ PASS | - |
| CCDropdown | ✅ PASS | SVG 드롭다운 화살표 포함 |
| CCIconButton | ✅ PASS | SVG 아이콘 포함 |
| CCTextArea | ✅ PASS | 텍스트 높이 auto 설정 필요 |
| CCModal | ✅ PASS | 복합 컴포넌트 (헤더/콘텐츠/푸터/닫기버튼) |
| Google Buttons | ✅ PASS | inline-block 레이아웃 수정으로 해결 |

### 알려진 제한사항 (Figma API 한계)

- **애니메이션**: CSS 애니메이션은 Figma에서 표현 불가 (정적 표현만 가능)
- **면별 border 색상**: `border-top-color` 등 개별 설정 불가

### 작업 항목

#### 1.1 테스트 환경 구축
- [ ] Storybook 테스트 컴포넌트 목록 정의
  - Badge (완료)
  - Button (Primary, Secondary, Outline, Ghost)
  - Input (Text, Password, Disabled)
  - Card (기본, 이미지 포함)
  - Modal/Dialog
  - Dropdown/Select
  - Table
  - Navigation (Tabs, Breadcrumb)

#### 1.2 자동화 테스트 파이프라인
- [ ] Playwright 스크립트 작성
  ```
  1. Storybook 컴포넌트 페이지 접근
  2. 컴포넌트 스타일 추출 (computedStyle)
  3. Sigma MCP로 Figma에 프레임 생성
  4. Figma MCP로 생성된 형상 조회
  5. 원본과 비교하여 차이점 리포트
  ```
- [ ] 테스트 결과 리포트 형식 정의

#### 1.3 알려진 이슈 해결
- [ ] 복잡한 그라데이션 처리
- [x] SVG/아이콘 처리
- [ ] 이미지 배경 처리
- [ ] 복잡한 box-shadow (다중 그림자)
- [ ] CSS transform 처리
- [ ] overflow 처리

#### 1.4 완료 기준
- [x] 10개 이상의 컴포넌트에서 시각적 차이 5% 미만
- [ ] 레이아웃 (위치, 크기, 정렬) 정확도 95% 이상
- [ ] 색상, 폰트 정확도 100%

---

## Phase 2: Figma → JSON 추출 기능

**목표**: Figma 프레임을 ExtractedNode JSON으로 역변환

### 작업 항목

#### 2.1 역변환 로직 구현
- [ ] `extractFrameToJSON(nodeId)` 함수 구현
  ```typescript
  // Figma Node → ExtractedNode 매핑
  FrameNode → { tagName: 'div', styles: {...}, children: [...] }
  TextNode  → { tagName: 'span', textContent: '...', styles: {...} }
  ```

- [ ] 스타일 역매핑 구현
  | Figma Property | ExtractedNode Style |
  |----------------|---------------------|
  | `fills[0].color` | `backgroundColor` |
  | `strokes[0].color` | `borderColor` |
  | `strokeWeight` | `borderWidth` |
  | `cornerRadius` | `borderRadius` |
  | `effects[0]` (DROP_SHADOW) | `boxShadow` |
  | `layoutMode` | `display: flex`, `flexDirection` |
  | `primaryAxisAlignItems` | `justifyContent` |
  | `counterAxisAlignItems` | `alignItems` |
  | `itemSpacing` | `gap` |
  | `padding*` | `padding*` |

#### 2.2 MCP 도구 추가
- [ ] `sigma_extract_json` - 프레임을 JSON으로 추출
  ```typescript
  {
    name: 'sigma_extract_json',
    description: 'Figma 프레임을 ExtractedNode JSON으로 추출',
    parameters: {
      token: { type: 'string', description: 'Sigma 토큰' },
      nodeId: { type: 'string', description: '추출할 노드 ID' }
    }
  }
  ```

#### 2.3 왕복 테스트 (Round-trip Test)
- [ ] 테스트 시나리오
  ```
  1. 원본 JSON으로 Figma 프레임 생성
  2. 생성된 프레임을 다시 JSON으로 추출
  3. 원본 JSON과 추출된 JSON 비교
  4. 차이점 리포트 및 수정
  ```
- [ ] 허용 오차 정의 (부동소수점 등)

#### 2.4 완료 기준
- [ ] Round-trip 후 JSON diff 5% 미만
- [ ] 모든 지원 스타일 속성 역변환 가능
- [ ] 중첩 구조 (children) 정확히 보존

---

## Phase 3: Figma → HTML 추출 기능

**목표**: Figma 프레임을 HTML + inline style로 추출

### 작업 항목

#### 3.1 HTML 변환 로직 구현
- [ ] `extractFrameToHTML(nodeId)` 함수 구현
  ```typescript
  // ExtractedNode → HTML 변환
  {
    tagName: 'div',
    styles: { display: 'flex', gap: 8 },
    children: [...]
  }
  ↓
  <div style="display: flex; gap: 8px;">
    ...children...
  </div>
  ```

- [ ] 스타일 직렬화
  - RGBA → `rgba(r, g, b, a)` 또는 `#RRGGBB`
  - 숫자 → `Npx`
  - 특수값 처리 (auto, inherit 등)

#### 3.2 MCP 도구 추가
- [ ] `sigma_extract_html` - 프레임을 HTML로 추출
  ```typescript
  {
    name: 'sigma_extract_html',
    description: 'Figma 프레임을 HTML로 추출',
    parameters: {
      token: { type: 'string', description: 'Sigma 토큰' },
      nodeId: { type: 'string', description: '추출할 노드 ID' },
      format: { type: 'string', enum: ['inline', 'classes'], default: 'inline' }
    }
  }
  ```

#### 3.3 Figma MCP와 비교 검증
- [ ] 동일 프레임에 대해:
  - Sigma `sigma_extract_html` 결과
  - Figma MCP `get_design_context` 결과 (React/Tailwind)
- [ ] 의미적 동등성 검증 (DOM 구조, 스타일 값)

#### 3.4 완료 기준
- [ ] 추출된 HTML이 브라우저에서 원본과 동일하게 렌더링
- [ ] Figma MCP 출력과 구조적 일치
- [ ] 유효한 HTML 문법

---

## Phase 4: 컴포넌트 수정 기능

**목표**: 기존 Figma 프레임을 수정된 데이터로 업데이트

### 작업 항목

#### 4.1 기본 수정 기능
- [x] `sigma_delete_frame` - 프레임 삭제 (구현 완료)

- [ ] `sigma_update_frame` - 프레임 교체 (삭제 후 재생성)
  ```typescript
  {
    name: 'sigma_update_frame',
    parameters: {
      token: { type: 'string' },
      nodeId: { type: 'string' },
      data: { type: 'object' },  // 새로운 ExtractedNode
      preservePosition: { type: 'boolean', default: true }
    }
  }
  ```

#### 4.2 부분 수정 기능 (선택적)
- [ ] `sigma_update_styles` - 스타일만 수정
- [ ] `sigma_update_text` - 텍스트 내용만 수정
- [ ] `sigma_update_children` - 자식 노드 추가/제거

#### 4.3 완료 기준
- [x] 프레임 삭제 동작 확인
- [ ] 프레임 교체 시 위치 보존
- [ ] 수정 후 형상 일관성 유지

---

## 우선순위 및 의존성

```
Phase 1 (JSON 안정화)
    │
    ▼
Phase 2 (Figma → JSON)
    │
    ├──▶ Phase 3 (Figma → HTML)
    │
    ▼
Phase 4 (수정 기능)
```

- Phase 1 완료 → Phase 2, 4 시작 가능
- Phase 2 완료 → Phase 3 시작 가능
- Phase 2, 4는 병렬 진행 가능

---

## 기술 참고

### Figma Plugin API - 노드 읽기

```typescript
// 프레임 정보 읽기
const frame = figma.getNodeById(nodeId) as FrameNode;

frame.type           // "FRAME"
frame.name           // 프레임 이름
frame.width, frame.height
frame.x, frame.y

// 스타일
frame.fills          // Paint[] - 배경
frame.strokes        // Paint[] - 테두리
frame.strokeWeight   // number
frame.cornerRadius   // number | typeof figma.mixed
frame.effects        // Effect[] - 그림자 등
frame.opacity        // number

// Auto Layout
frame.layoutMode     // "NONE" | "HORIZONTAL" | "VERTICAL"
frame.primaryAxisAlignItems    // "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN"
frame.counterAxisAlignItems    // "MIN" | "CENTER" | "MAX"
frame.paddingTop/Right/Bottom/Left
frame.itemSpacing

// 자식
frame.children       // readonly SceneNode[]

// 텍스트 노드
const text = node as TextNode;
text.characters      // string
text.fontSize        // number
text.fontName        // FontName
text.fills           // Paint[]
```

### ExtractedNode 타입 (참고)

```typescript
interface ExtractedNode {
  tagName: string;
  className: string;
  textContent: string;
  styles: ComputedStyles;
  boundingRect: { width: number; height: number };
  children?: ExtractedNode[];
}

interface ComputedStyles {
  display: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  gap: number;
  width: number | 'auto';
  height: number | 'auto';
  padding*: number;
  margin*: number;
  backgroundColor: RGBA;
  border*Width: number;
  border*Color: RGBA;
  borderRadius: number;
  boxShadow: string;
  color: RGBA;
  fontSize: number;
  fontWeight: string;
  // ... 등
}
```

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-05 | inline-block 레이아웃 수정 (block+inline-block → HORIZONTAL) |
| 2026-02-05 | CCStatusIndicator 8MB 오류 정정 (실제: 74KB 페이지, 개별 ~5KB) |
| 2025-02-05 | 토큰 시스템 구현 완료, 선행 작업 섹션 삭제 |
| 2024-XX-XX | 초안 작성 |
