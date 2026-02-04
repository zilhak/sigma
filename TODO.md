# Sigma 추가 개발 TODO

---

## 🔴 선행 작업: Sigma 토큰 기반 인증 시스템 (리팩토링)

> **설계 문서**: [MCP_AUTH.md](./MCP_AUTH.md)
>
> **목적**: AI Agent의 작업공간 혼동 방지 (보안 아님, 오류 방지 메커니즘)

### 변경 개요

| 항목 | AS-IS | TO-BE |
|------|-------|-------|
| API 접두사 | `figma_*` | `sigma_*` |
| 클라이언트 식별 | `clientId` 파라미터 | sigma 토큰 + 바인딩 |
| 작업공간 지정 | 매 호출마다 `clientId`, `pageId` 전달 | `sigma_bind()` 한 번 → 이후 sigma 토큰만 |
| 인증 | 없음 | `sigma_login()` → sigma 토큰 발급 |
| 만료 | 없음 | 10분 (사용 시 갱신) |

### 구현 계획

```
packages/server/src/
├── mcp/
│   ├── tools.ts      # 삭제 후 새로 작성
│   ├── server.ts     # 변경 없음 (MCP 프로토콜 핸들러)
│   └── handlers/     # [신규] 도구별 핸들러 분리
│       ├── auth.ts       # sigma_login, sigma_logout, sigma_status
│       ├── plugins.ts    # sigma_list_plugins, sigma_bind
│       └── frames.ts     # sigma_create_frame, sigma_get_frames, sigma_delete_frame
│
├── auth/             # [신규] sigma 토큰 관리 모듈
│   └── token.ts          # SigmaTokenStore 클래스
│
├── websocket/
│   └── server.ts     # clientId → pluginId 용어 변경
│
└── index.ts          # 변경 없음
```

---

### Phase 0-1: Sigma 토큰 저장소 (`auth/token.ts`)

**목표**: 메모리 기반 sigma 토큰 관리

```typescript
// 구현할 인터페이스
interface SigmaTokenData {
  token: string;
  expiresAt: Date;
  binding: {
    pluginId: string;
    pageId: string;
    fileName: string;
    pageName: string;
  } | null;
}

class SigmaTokenStore {
  private tokens: Map<string, SigmaTokenData>;
  private loginCount: number;

  createToken(): string;           // sigma 토큰 발급
  validateToken(token: string): SigmaTokenData | null;  // 검증 + 갱신
  bindToken(token: string, pluginId: string, pageId: string, fileName: string, pageName: string): boolean;
  deleteToken(token: string): void;
}
```

**바인딩 규칙** (중요!):
- 1 sigma 토큰 → 1 페이지: sigma 토큰 하나는 반드시 하나의 페이지에만 바인딩
- N sigma 토큰 → 1 페이지: 같은 페이지에 여러 sigma 토큰 바인딩 가능 (여러 AI 동시 작업)
- 바인딩 덮어쓰기: 다시 `bindToken()` 호출 시 기존 바인딩 교체
- **unbind 없음**: 바인딩 해제 개념 불필요, 재바인딩으로 대체

**작업 항목**:
- [ ] `packages/server/src/auth/token.ts` 파일 생성
- [ ] `SigmaTokenStore` 클래스 구현
  - [ ] `createToken()` - `stk-{random}` 형식 sigma 토큰 생성 (stk = Sigma ToKen)
  - [ ] `validateToken()` - 만료 확인 + 지연 정리 + 갱신
  - [ ] `bindToken()` - 작업공간 바인딩 (재호출 시 덮어쓰기)
  - [ ] `deleteToken()` - sigma 토큰 삭제 (logout)
- [ ] 100회 로그인마다 만료된 sigma 토큰 일괄 정리 로직

---

### Phase 0-2: WebSocket 서버 용어 변경

**목표**: `clientId` → `pluginId` 명칭 통일

**변경 대상**: `packages/server/src/websocket/server.ts`

| AS-IS | TO-BE |
|-------|-------|
| `clientId` | `pluginId` |
| `clientsById` | `pluginsById` |
| `getClientById()` | `getPluginById()` |
| `getFigmaClientsInfo()` | `getPluginsInfo()` |
| `generateClientId()` | `generatePluginId()` |

**작업 항목**:
- [ ] 변수/함수명 일괄 변경 (기능 동일)
- [ ] `FigmaClientInfo` → `FigmaPluginInfo` 타입명 변경
- [ ] 페이지 목록(`pages`) 정보 추가 (바인딩용)
  ```typescript
  interface FigmaPluginInfo {
    pluginId: string;
    fileKey: string | null;
    fileName: string;
    pages: Array<{ pageId: string; pageName: string }>;  // 추가
    currentPageId: string;
    currentPageName: string;
    connectedAt: Date;
  }
  ```

---

### Phase 0-3: MCP 도구 재작성 (`mcp/tools.ts`)

**목표**: `figma_*` 완전 삭제, `sigma_*`로 교체

#### 삭제할 도구 (전부)
```
figma_status
figma_list_clients
figma_create_frame
figma_import_file
figma_get_frames
figma_delete_frame
save_and_import
```

#### 신규 도구 - API 분류

**1. 인증 API (sigma 토큰 불필요)**
| 도구 | 설명 |
|------|------|
| `sigma_login` | sigma 토큰 발급. 모든 작업의 시작점. |

**2. 조회 API (sigma 토큰 필요, 바인딩 불필요)**

바인딩 전에 상태 파악용. 이 API들로 바인딩 대상을 선택함.

| 도구 | 설명 |
|------|------|
| `sigma_list_plugins` | 연결된 플러그인 목록 + **각 플러그인의 페이지 목록** |
| `sigma_status` | 현재 sigma 토큰 상태 및 바인딩 정보 확인 |
| `sigma_logout` | sigma 토큰 무효화 |

> **중요**: `sigma_list_plugins` 응답에 페이지 목록(`pages`)이 포함됨!
> AI는 이 정보로 바인딩할 대상(pluginId + pageId)을 선택.

**3. 바인딩 API (sigma 토큰 필요, 바인딩 불필요)**
| 도구 | 설명 |
|------|------|
| `sigma_bind` | sigma 토큰을 특정 작업공간(pluginId + pageId)에 바인딩 |

**4. Read API (인증 선택적)**

변경 없는 조회는 두 가지 방식 지원:
- 방식 1: sigma 토큰 사용 (바인딩된 페이지)
- 방식 2: `pluginId + pageId` 직접 지정 (sigma 토큰 불필요)

| 도구 | 설명 |
|------|------|
| `sigma_get_frames` | 프레임 목록 조회 |

> **이유**: "A 페이지 참고해서 B 페이지 수정" 시나리오에서
> 매번 바인딩 전환하는 것은 불필요하게 번거로움.

**5. Write API (sigma 토큰 필수, 바인딩 필수)**
| 도구 | 설명 |
|------|------|
| `sigma_create_frame` | 바인딩된 페이지에 프레임 생성 |
| `sigma_delete_frame` | 바인딩된 페이지에서 프레임 삭제 |

#### 스토리지 도구 (유지, 이름만 변경)

| AS-IS | TO-BE |
|-------|-------|
| `save_extracted` | `sigma_save` |
| `list_saved` | `sigma_list_saved` |
| `load_extracted` | `sigma_load` |
| `delete_extracted` | `sigma_delete_saved` |
| `server_status` | `sigma_server_status` |

**작업 항목**:
- [ ] `tools.ts` 파일 전체 재작성
- [ ] 에러 응답 표준화 (TOKEN_REQUIRED, TOKEN_INVALID, BINDING_REQUIRED) - sigma 토큰 관련
- [ ] 각 도구별 핸들러 구현

---

### Phase 0-4: Figma Plugin 수정

**목표**: 페이지 목록 전송 기능 추가

**변경 대상**: `packages/figma-plugin/src/ui.ts`, `code.ts`

현재 플러그인은 `현재 페이지` 정보만 전송합니다.
바인딩을 위해 `전체 페이지 목록`을 전송해야 합니다.

```typescript
// code.ts에서 전송할 메시지 구조 변경
{
  type: 'FILE_INFO',
  pluginId: string,
  fileKey: string,
  fileName: string,
  pages: [                    // 추가
    { pageId: '0:1', pageName: 'Cover' },
    { pageId: '123:0', pageName: 'Buttons' },
    ...
  ],
  currentPageId: string,
  currentPageName: string,
}
```

**작업 항목**:
- [ ] `code.ts`: `figma.root.children`로 전체 페이지 목록 수집
- [ ] `ui.ts`: WebSocket 메시지에 `pages` 배열 포함
- [ ] 서버: `FILE_INFO` 메시지 핸들러에서 `pages` 저장

---

### Phase 0-5: 통합 테스트

**목표**: 전체 플로우 검증

```
1. sigma_login() → sigma 토큰 발급
2. sigma_list_plugins() → 연결된 플러그인 목록 확인
3. sigma_bind(token, pluginId, pageId) → 작업공간 바인딩
4. sigma_create_frame(token, data) → 프레임 생성 (pluginId/pageId 불필요!)
5. sigma_get_frames(token) → 프레임 목록 확인
6. sigma_delete_frame(token, nodeId) → 프레임 삭제
7. sigma_logout() → sigma 토큰 무효화
```

**테스트 시나리오**:
- [ ] sigma 토큰 없이 API 호출 → TOKEN_REQUIRED 에러
- [ ] 만료된 sigma 토큰으로 호출 → TOKEN_INVALID 에러
- [ ] 바인딩 없이 Write 호출 → BINDING_REQUIRED 에러
- [ ] 정상 플로우 → 성공
- [ ] 서버 재시작 후 기존 sigma 토큰 → TOKEN_INVALID 에러 (휘발 확인)

---

### 작업 순서 (의존성 기반)

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0-1: SigmaTokenStore (독립, 선행 필수)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Phase 0-2      │  │  Phase 0-4      │  │  (대기)         │
│  WebSocket 용어  │  │  Figma Plugin   │  │                 │
│  변경           │  │  페이지 목록     │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
              │               │
              └───────┬───────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0-3: MCP 도구 재작성 (0-1, 0-2, 0-4 완료 후)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0-5: 통합 테스트                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

### 완료 기준

- [ ] 모든 `figma_*` 도구 삭제됨
- [ ] 모든 `sigma_*` 도구 정상 동작
- [ ] sigma 토큰 없이 API 호출 시 적절한 에러 메시지
- [ ] 바인딩 없이 Write 호출 시 적절한 에러 메시지
- [ ] 서버 재시작 시 sigma 토큰 휘발 확인
- [ ] AI Agent가 sigma 토큰/바인딩 기반으로 작업공간 관리 가능

---

## 기존 TODO (토큰 시스템 완료 후 진행)

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
- [ ] 다양한 컴포넌트에서 검증 필요

### 테스트 결과 (진행중)

| 컴포넌트 | 결과 | 이슈 |
|---------|------|------|
| CCBadge | ✅ PASS | - |
| CCInfoPanel | ✅ PASS | display: grid 지원 추가로 해결 |
| CCStatusIndicator | ⏭️ SKIP | JSON 8MB+ (너무 큼) |
| CCSpinner | ⚠️ 제한 | 애니메이션 + 면별 border 색상 (Figma 미지원) |
| CCButton | ✅ PASS | - |
| CCToggle | ✅ PASS | SVG 지원 구현 완료 (`createNodeFromSvg` 사용) |
| CCBanner | ✅ PASS | - |
| CCDropdown | ✅ PASS | SVG 드롭다운 화살표 포함 |
| CCIconButton | ✅ PASS | SVG 아이콘 포함 |
| CCTextArea | ✅ PASS | 텍스트 높이 auto 설정 필요 |
| CCModal | ✅ PASS | 복합 컴포넌트 (헤더/콘텐츠/푸터/닫기버튼) |

### 발견된 이슈 목록

#### 이슈 #1: 레이아웃 변환 문제 (CCInfoPanel)
- **증상**: 수평으로 배치된 label-value 쌍이 수직으로 변환됨
- **원인**: `display: grid`가 처리되지 않아 기본값 VERTICAL로 설정됨
- **해결**: `applyLayoutMode()`에 grid/inline-grid 지원 추가
- **상태**: ✅ 해결

#### 이슈 #2: 애니메이션 컴포넌트 (CCSpinner) - 알려진 제한사항
- **증상**: 스피너의 파란색 호(arc)가 전체 원으로 표시됨
- **원인**:
  1. Figma API는 면별(top/right/bottom/left) stroke 색상 미지원
  2. CSS 애니메이션(회전) 미지원
- **결론**: **Figma의 근본적 제한사항** - 애니메이션 컴포넌트는 정적 표현만 가능
- **개선**: 가장 불투명한 border 색상 선택하도록 개선 (시각적 의미 보존)
- **상태**: ⚠️ 제한사항 (수정 불가)

#### 이슈 #3: SVG 기반 UI 컴포넌트 (CCToggle) - 구현 완료
- **증상**: 토글 스위치 UI가 렌더링되지 않고 라벨만 표시됨
- **원인**: 토글 스위치가 **inline SVG**로 구현됨 (`<svg><path/><circle/></svg>`)
- **해결**:
  1. `ExtractedNode` 타입에 `svgString?: string` 필드 추가
  2. Chrome Extension에서 SVG 요소 감지 시 `outerHTML`을 `svgString`으로 캡처
  3. Figma Plugin에서 `figma.createNodeFromSvg(svgString)` API로 직접 변환
  4. CSS 변수(`var(--xxx, fallback)`)는 추출 시 fallback 값으로 변환
- **상태**: ✅ 해결

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
- [ ] SVG/아이콘 처리
- [ ] 이미지 배경 처리
- [ ] 복잡한 box-shadow (다중 그림자)
- [ ] CSS transform 처리
- [ ] overflow 처리

#### 1.4 완료 기준
- [ ] 10개 이상의 컴포넌트에서 시각적 차이 5% 미만
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
- [ ] `figma_extract_json` - 프레임을 JSON으로 추출
  ```typescript
  {
    name: 'figma_extract_json',
    description: 'Figma 프레임을 ExtractedNode JSON으로 추출',
    parameters: {
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
- [ ] `figma_extract_html` - 프레임을 HTML로 추출
  ```typescript
  {
    name: 'figma_extract_html',
    description: 'Figma 프레임을 HTML로 추출',
    parameters: {
      nodeId: { type: 'string', description: '추출할 노드 ID' },
      format: { type: 'string', enum: ['inline', 'classes'], default: 'inline' }
    }
  }
  ```

#### 3.3 Figma MCP와 비교 검증
- [ ] 동일 프레임에 대해:
  - Sigma `figma_extract_html` 결과
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
- [ ] `figma_delete_frame` - 프레임 삭제
  ```typescript
  {
    name: 'figma_delete_frame',
    parameters: { nodeId: { type: 'string' } }
  }
  ```

- [ ] `figma_update_frame` - 프레임 교체 (삭제 후 재생성)
  ```typescript
  {
    name: 'figma_update_frame',
    parameters: {
      nodeId: { type: 'string' },
      data: { type: 'object' },  // 새로운 ExtractedNode
      preservePosition: { type: 'boolean', default: true }
    }
  }
  ```

#### 4.2 부분 수정 기능 (선택적)
- [ ] `figma_update_styles` - 스타일만 수정
- [ ] `figma_update_text` - 텍스트 내용만 수정
- [ ] `figma_update_children` - 자식 노드 추가/제거

#### 4.3 완료 기준
- [ ] 프레임 삭제 동작 확인
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
| 2024-XX-XX | 초안 작성 |
