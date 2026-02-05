# Sigma - Modular Design-to-Code Bridge

웹 컴포넌트를 추출하고 Figma와 AI Agent가 상호작용할 수 있는 모듈형 시스템

---

## 유비쿼터스 언어 (Ubiquitous Language)

이 프로젝트에서 사용하는 공통 용어 정의입니다.

| 용어 | 정의 | 패키지 경로 |
|------|------|-------------|
| **Sigma 플러그인** | Figma Plugin - JSON/HTML을 Figma 프레임으로 변환 | `packages/figma-plugin/` |
| **Sigma 서버** | 중앙 서버 - MCP, HTTP API, WebSocket 통신 허브 | `packages/server/` |
| **Sigma 확장** | Chrome Extension - 웹 컴포넌트 추출 (사용자 수동) | `packages/chrome-extension/` |
| **Sigma 임베드 스크립트** | 웹 페이지에 `addScriptTag()`로 주입하는 자체 완결형 JS 번들 모음. AI Agent / Playwright 자동화용. 비공식적으로 "시그마 스크립트"라고도 부름 | `packages/shared/dist/` |
| **추출 스크립트** | Sigma 임베드 스크립트 중 하나. `window.__sigma__` API로 DOM → ExtractedNode JSON 추출. 소스: `extractor/core.ts`, 빌드 결과: `extractor.standalone.js` | `packages/shared/dist/extractor.standalone.js` |

---

## Claude Code 작업 지침

### 임시 파일 및 문서 저장 규칙

Claude가 생성하는 모든 임시 파일, 스크린샷, 작업 문서 등은 **프로젝트 루트의 `.claude/` 폴더**에 저장합니다.

```
sigma/
├── .claude/                    # Claude 전용 작업 폴더 (gitignore됨)
│   ├── screenshots/            # 스크린샷 저장
│   ├── temp/                   # 임시 파일
│   ├── docs/                   # 작업 중 문서
│   └── logs/                   # 로그 파일
├── src/
└── ...
```

**규칙:**
- `.claude/` 폴더는 global gitignore에 등록되어 소스코드에 포함되지 않음
- 소스코드에 포함되어야 하는 문서만 `.claude/` 폴더 바깥에 작성
- 임시 파일은 절대 Downloads 폴더나 시스템 /tmp에 저장하지 않음

### 컴포넌트 추출 방식

컴포넌트 추출은 두 가지 방식으로 수행합니다:

| 방식 | 사용 주체 | 용도 |
|------|-----------|------|
| **Sigma 확장** (Chrome Extension) | 사용자 (수동) | UI로 직접 컴포넌트 선택하여 추출 |
| **추출 스크립트** (Sigma 임베드 스크립트) | AI Agent / Playwright | 자동화된 컴포넌트 추출 |

#### 추출 스크립트 (Playwright 자동화용)

Playwright에서 컴포넌트를 추출할 때는 **추출 스크립트** (Sigma 임베드 스크립트 중 하나)를 사용합니다.

**소스:** `packages/shared/src/extractor/core.ts` (Single Source of Truth)
**빌드 결과:** `packages/shared/dist/extractor.standalone.js` (esbuild IIFE 번들)

**스크립트 경로 확인:** Sigma MCP의 `get_playwright_scripts` 도구를 호출하면 스크립트의 절대 경로와 API 정보를 반환합니다.

**사용법:**
```javascript
// 0. (권장) MCP로 스크립트 경로 확인
// sigma: get_playwright_scripts → { path: "/.../extractor.standalone.js", api: [...] }

// 1. 스크립트 inject
await page.addScriptTag({
  path: '/path/to/sigma/packages/shared/dist/extractor.standalone.js'
});

// 2. 컴포넌트 추출
const data = await page.evaluate(() => {
  return window.__sigma__.extract('button.primary');
});

// 3. Sigma MCP로 Figma에 생성 (선택)
// sigma_create_frame({ token, data, name: 'Button/Primary' })
```

**API:**
- `window.__sigma__.extract(selector)` - CSS 선택자로 요소 추출 (동기, ExtractedNode 반환)
- `window.__sigma__.extractAt(x, y)` - 좌표로 요소 추출 (동기, ExtractedNode 반환)
- `window.__sigma__.version` - 스크립트 버전 문자열

**장점:**
- Extension 설치/로드 불필요
- 완전 자동화 가능 (CI/CD 친화적)
- `packages/shared/src/extractor/core.ts`에서 빌드된 동일한 추출 로직 사용

**절대 하지 말 것:**
```javascript
// ❌ 잘못된 방법 - 추출 로직 직접 작성
await page.evaluate(() => {
  function extractElement(el) { ... }  // 직접 작성 금지!
  return extractElement(document.querySelector(...));
});

// ✅ 올바른 방법 - Standalone Extractor 사용
await page.addScriptTag({ path: '.../dist/extractor.standalone.js' });
const data = await page.evaluate(() => window.__sigma__.extract('...'));
```

#### Chrome Extension (사용자 수동용)

사용자가 직접 컴포넌트를 선택할 때 사용합니다.

- 팝업 UI로 선택 모드 활성화
- 마우스로 컴포넌트 클릭
- 클립보드 복사 또는 서버 전송

### Playwright MCP 사용 지침

브라우저 자동화 시 Playwright MCP를 사용할 때 다음 규칙을 준수합니다.

#### 기본 설정

**MCP 설정 (`~/.claude.json`):**
```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "env": {}
    }
  }
}
```

#### 컴포넌트 추출 워크플로우

```
1. Sigma MCP: get_playwright_scripts → 스크립트 경로 + API 정보 확인
2. Playwright로 페이지 이동
3. extractor.standalone.js inject (addScriptTag)
4. window.__sigma__.extract() 호출
5. 결과를 Sigma MCP로 전달 → Figma에 프레임 생성
```

**전체 예시:**
```javascript
// 0. (사전) get_playwright_scripts MCP 도구로 스크립트 경로 확인
// → { path: "/.../packages/shared/dist/extractor.standalone.js", ... }

// 1. 페이지 이동
await page.goto('http://localhost:6006/?path=/story/button--primary');

// 2. Extractor inject (빌드된 standalone JS 사용)
await page.addScriptTag({
  path: scriptPath  // get_playwright_scripts에서 받은 경로
});

// 3. 컴포넌트 추출
const extracted = await page.evaluate(() => {
  return window.__sigma__.extract('.storybook-button');
});

// 4. Sigma MCP로 Figma에 생성
// sigma_create_frame({ token, data: extracted, name: 'Button/Primary' })
```

#### 기본 사용 규칙

**창 크기:**
```
width: 1600
height: 900
```

**스크린샷 저장:**
```
경로: {프로젝트루트}/.claude/screenshots/
예시: /Users/ljh/workspace/etc/sigma/.claude/screenshots/
```

**사용 예시:**
```typescript
// 네비게이션
playwright_navigate({ url: "...", width: 1600, height: 900 })

// 스크린샷
playwright_screenshot({
  name: "component-name",
  savePng: true,
  downloadsDir: "/Users/ljh/workspace/etc/sigma/.claude/screenshots"
})
```

### 시각적 결과 검증 프로토콜 (필수)

> **핵심 원칙:** "성공"은 증명해야 하는 것이다. 추정이나 추측으로 성공을 선언하지 않는다.

시각적 변환 작업(웹→Figma, 이미지 처리 등)의 결과를 검증할 때 반드시 다음 프로토콜을 따릅니다.

#### 1단계: 사전 준비

작업 시작 전 **핵심 요소 목록**을 작성합니다:

```
예시 - Google 메인페이지:
- [ ] 로고 (위치: 중앙 상단, 크기: 272x92)
- [ ] 검색창 (위치: 중앙, 가로 길이 충분)
- [ ] 버튼들 (Google 검색, I'm Feeling Lucky)
- [ ] 우측 상단 링크들 (Gmail, 이미지, 로그인)
```

#### 2단계: 원본-결과 병렬 비교 (필수)

결과 확인 시 **반드시** 원본과 결과를 나란히 비교합니다:

1. 원본 스크린샷 캡처
2. 결과 스크린샷 캡처
3. 두 이미지를 동시에 확인
4. 차이점을 명시적으로 나열

**절대 금지:**
```
❌ 결과 이미지만 보고 "성공적으로 완료되었습니다"
❌ "대체로", "거의", "대부분" 같은 모호한 표현
❌ 기술적 실행 성공만으로 품질 성공 선언
```

#### 3단계: 체크리스트 검증

각 핵심 요소에 대해 **PASS/FAIL**만 사용합니다:

```
검증 결과:
- 로고: PASS (위치 중앙, 크기 정상)
- 검색창: PASS (중앙 배치, 길이 적절)
- Gmail 버튼: FAIL (텍스트 잘림 - "Gm"으로 표시)
- 이미지 검색: FAIL (버튼 누락)

최종 판정: FAIL (2개 요소 문제 발견)
```

#### 4단계: 결과 보고

사용자에게 보고 시 다음 형식을 사용합니다:

```markdown
## 변환 결과

### 원본 vs 결과
[원본 스크린샷 또는 링크]
[결과 스크린샷 또는 링크]

### 검증 결과
| 요소 | 상태 | 비고 |
|------|------|------|
| 로고 | PASS | - |
| 검색창 | PASS | - |
| Gmail | FAIL | 텍스트 잘림 |

### 최종 판정
**FAIL** - 위 문제 해결 필요
```

#### 금지 표현 목록

다음 표현 사용 시 반드시 증거와 함께 제시:

| 금지 표현 | 대체 표현 |
|-----------|-----------|
| "성공적으로 완료" | "N개 중 N개 요소 PASS" |
| "잘 변환됨" | "체크리스트 전체 PASS 확인" |
| "문제없어 보임" | "비교 검증 결과 차이점 없음" |
| "대체로 성공" | "N개 요소 PASS, N개 요소 FAIL" |

---

## 핵심 철학

**"서로 연동하면 최고의 효율, 따로따로도 사용 가능"**

각 모듈은 독립적으로 동작하면서도, 로컬 서버를 중심으로 연결되면 강력한 자동화 파이프라인이 됨.

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AI Agent                                    │
│                         (Claude Code + MCP)                              │
│                                                                          │
│  ┌──────────────────┐              ┌──────────────────┐                 │
│  │   Playwright MCP │              │    Sigma MCP     │                 │
│  │  (브라우저 제어)  │              │  (데이터 + Figma) │                 │
│  └────────┬─────────┘              └────────┬─────────┘                 │
└───────────│────────────────────────────────│────────────────────────────┘
            │                                │
            │ 브라우저 직접 조종              │ stdio
            │ (navigate, click 등)           │
            ▼                                ▼
┌───────────────────────────┐    ┌────────────────────────────────────────┐
│      Chrome Browser       │    │            Local Server                 │
│  ┌─────────────────────┐  │    │         http://localhost:19832           │
│  │   Chrome Extension  │  │    │                                         │
│  │  ┌───────────────┐  │  │    │  ┌─────────────┐  ┌─────────────────┐  │
│  │  │ 컴포넌트 추출  │  │──────────▶│  HTTP API   │  │   WebSocket     │  │
│  │  │               │  │  │POST│  │  (REST)     │  │    Server       │  │
│  │  └───────────────┘  │  │    │  └──────┬──────┘  └────────┬────────┘  │
│  └─────────────────────┘  │    │         │                  │           │
│                           │    │   ┌─────┴──────┐           │           │
│  ┌─────────────────────┐  │    │   │   File     │           │           │
│  │     Web Page        │  │    │   │  Storage   │           │           │
│  │   (Storybook 등)    │  │    │   └────────────┘           │           │
│  └─────────────────────┘  │    │                            │           │
└───────────────────────────┘    └────────────────────────────│───────────┘
                                                              │
                                                         WebSocket
                                                              │
                                                              ▼
                                              ┌────────────────────────────┐
                                              │       Figma Plugin         │
                                              │   (JSON → Figma Frame)     │
                                              └────────────────────────────┘
```

**핵심 원칙:**
- **Extension → Server**: Extension이 서버로 데이터를 일방적으로 Push (서버는 Listen만)
- **Playwright → Browser**: MCP 자동화 시 Playwright가 브라우저/Extension을 직접 조종
- **Server → Figma**: 서버가 WebSocket으로 Figma Plugin에 명령 전달

---

## 통신 방식

### Extension → Server (단방향 Push)

Extension이 추출한 데이터를 서버로 전송. 서버는 명령을 보내지 않음.

```
┌─────────────┐                    ┌─────────────┐
│  Extension  │                    │   Server    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  사용자가 추출 버튼 클릭          │
       │  (또는 Playwright가 클릭)        │
       │                                  │
       │  컴포넌트 추출 실행               │
       │                                  │
       │  POST /api/extracted             │
       │  { name, data, format }          │
       │─────────────────────────────────▶│
       │                                  │ 저장
       │         { success: true, id }    │
       │◀─────────────────────────────────│
       │                                  │
```

### Server → Figma Plugin (WebSocket)

서버가 Figma Plugin에 프레임 생성 명령 전달.

```
┌─────────────┐                    ┌─────────────┐
│Figma Plugin │                    │   Server    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  GET /api/health (5초 폴링)      │
       │─────────────────────────────────▶│
       │         { status: "ok" }         │
       │◀─────────────────────────────────│
       │                                  │
       │  서버 발견! WebSocket 연결       │
       │  ws://localhost:19831             │
       │═════════════════════════════════▶│
       │                                  │
       │    { type: "CREATE_FRAME", ... } │
       │◀═════════════════════════════════│
       │                                  │
       │  프레임 생성 후 결과 응답         │
       │═════════════════════════════════▶│
       │                                  │
```

---

## 모듈 상세

### 1. Chrome Extension

**목적:** 웹페이지에서 컴포넌트를 선택하여 구조화된 데이터로 추출

> **핵심 취지: "그 자체로도 쓸 수 있지만, 로컬 서버 설정하면 더 편리하다"**

#### 두 가지 독립적인 기능

| 기능 | 설명 | 서버 필요 |
|------|------|:---------:|
| **클립보드 복사** | 추출된 데이터를 클립보드에 복사 | ❌ |
| **서버 전송** | 추출된 데이터를 서버로 전송 | ✅ |

- 두 기능은 **완전히 별개의 액션**
- 서버가 떠있어도 클립보드 복사만 할 수 있음
- 사용자가 원하는 방식 선택

#### Popup UI 구성
```
┌─────────────────────────────┐
│  Sigma Component Extractor  │
├─────────────────────────────┤
│  [📋 복사]  [📤 서버 전송]   │  ← 별개 버튼
├─────────────────────────────┤
│  형식: ○ JSON  ○ HTML       │
├─────────────────────────────┤
│  서버: 🟢 연결됨             │  ← 상태 표시
└─────────────────────────────┘
```

#### 사용 흐름
1. 팝업 UI로 컴포넌트 선택 모드 활성화
2. 웹페이지에서 원하는 컴포넌트 클릭
3. 추출 완료 후:
   - **[복사]** 클릭 → 클립보드에 복사
   - **[서버 전송]** 클릭 → 서버로 POST (서버 연결 시에만 활성화)

#### 출력 형식

**HTML 형식** (범용, 다른 도구와 호환)
```html
<div style="display: inline-flex; background-color: rgb(0, 102, 255);
            padding: 4px 12px; border-radius: 9999px;">
  <span style="color: white; font-size: 14px; font-weight: 500;">
    Badge
  </span>
</div>
```

**JSON 형식** (Figma 최적화, 파싱 완료)
```json
{
  "tagName": "div",
  "className": "badge",
  "styles": {
    "display": "inline-flex",
    "backgroundColor": { "r": 0, "g": 0.4, "b": 1, "a": 1 },
    "paddingTop": 4,
    "paddingRight": 12,
    "borderRadius": 9999
  },
  "boundingRect": { "width": 72, "height": 28 },
  "children": [...]
}
```

#### manifest.json 설정
```json
{
  "manifest_version": 3,
  "name": "Sigma Component Extractor",
  "permissions": ["activeTab", "scripting", "storage", "clipboardWrite"],
  "host_permissions": [
    "<all_urls>",
    "http://localhost:19832/*"
  ]
}
```

#### Extension 통신 로직
```typescript
// popup.ts (또는 content.ts)
const SERVER_URL = 'http://localhost:19832';

let extractedData: ExtractedNode | null = null;
let serverConnected = false;

// 서버 상태 확인 (주기적으로 호출)
async function checkServerStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`);
    serverConnected = res.ok;
    updateUI(); // 서버 상태 UI 업데이트
    return serverConnected;
  } catch {
    serverConnected = false;
    updateUI();
    return false;
  }
}

// 추출 완료 시 데이터 저장 (아직 전송/복사 안 함)
function onExtractComplete(data: ExtractedNode) {
  extractedData = data;
  updateUI(); // 버튼 활성화
}

// [복사] 버튼 클릭 시 - 서버 상태와 무관하게 동작
async function onCopyClick() {
  if (!extractedData) return;

  const format = getSelectedFormat(); // 'json' | 'html'
  const text = format === 'json'
    ? JSON.stringify(extractedData, null, 2)
    : convertToHTML(extractedData);

  await navigator.clipboard.writeText(text);
  showToast('클립보드에 복사됨');
}

// [서버 전송] 버튼 클릭 시 - 서버 연결 시에만 활성화
async function onSendToServerClick() {
  if (!extractedData || !serverConnected) return;

  await fetch(`${SERVER_URL}/api/extracted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: getComponentName() || `component-${Date.now()}`,
      data: extractedData,
      format: getSelectedFormat(),
      timestamp: Date.now()
    })
  });

  showToast('서버로 전송됨');
}

// UI 업데이트
function updateUI() {
  // 서버 전송 버튼: 서버 연결 시에만 활성화
  sendButton.disabled = !serverConnected || !extractedData;

  // 복사 버튼: 데이터 있으면 항상 활성화
  copyButton.disabled = !extractedData;

  // 서버 상태 표시
  statusIndicator.className = serverConnected ? 'connected' : 'disconnected';
}

// 5초마다 서버 상태 확인
setInterval(checkServerStatus, 5000);
```

---

### 2. Local Server

**목적:** 데이터 저장소 + MCP 브릿지 + Figma 통신 허브

#### 구성 요소

| 컴포넌트 | 역할 | 포트/프로토콜 |
|----------|------|---------------|
| MCP Server | AI Agent와 통신 | stdio |
| HTTP Server | REST API + Dashboard | http://localhost:19832 |
| WebSocket Server | Figma Plugin 통신 | ws://localhost:19831 |
| File Storage | 추출 데이터 저장/관리 | ~/.sigma/extracted/ |

#### HTTP API 엔드포인트

```
HTTP Server (localhost:19832)
│
├── 상태 확인
│   └── GET  /api/health                 # 서버 상태
│
├── 데이터 관리 (Extension → Server)
│   ├── GET  /api/extracted              # 저장된 데이터 목록
│   ├── GET  /api/extracted/:id          # 특정 데이터 조회
│   ├── POST /api/extracted              # 새 데이터 저장 (Extension이 호출)
│   └── DELETE /api/extracted/:id        # 데이터 삭제
│
├── Figma 통신
│   └── POST /api/figma/create           # Figma로 프레임 생성 요청
│
└── Dashboard
    └── GET  /                           # Web UI
```

#### MCP Tools

```typescript
const mcpTools = [
  // === 데이터 관리 ===
  {
    name: "list_extracted",
    description: "저장된 추출 데이터 목록 조회",
    parameters: {}
  },
  {
    name: "get_extracted",
    description: "특정 추출 데이터 조회",
    parameters: {
      id: { type: "string" }
    }
  },
  {
    name: "delete_extracted",
    description: "추출 데이터 삭제",
    parameters: {
      id: { type: "string" }
    }
  },

  // === Figma 제어 ===
  {
    name: "figma_status",
    description: "Figma Plugin 연결 상태 확인",
    parameters: {}
  },
  {
    name: "figma_create_frame",
    description: "저장된 데이터로 Figma에 프레임 생성",
    parameters: {
      id: { type: "string", description: "추출 데이터 ID" },
      name: { type: "string", optional: true, description: "Figma 프레임 이름" }
    }
  },
  {
    name: "figma_create_from_data",
    description: "JSON 데이터로 Figma에 프레임 직접 생성",
    parameters: {
      data: { type: "object", description: "ExtractedNode JSON" },
      name: { type: "string", optional: true }
    }
  },

  // === Sigma 임베드 스크립트 ===
  {
    name: "get_playwright_scripts",
    description: "Sigma 임베드 스크립트 목록 반환 (경로 + API 정보). 추출 스크립트 등 포함",
    parameters: {}
    // 반환값: [{ name, path, exists, api: [...], usage }]
  }
];
```

**Note:** Extension 제어 Tools는 없음. Playwright 자동화 시 `get_playwright_scripts`로 Sigma 임베드 스크립트 경로를 확인한 후 `page.addScriptTag()`로 inject.

#### 디렉토리 구조
```
~/.sigma/
├── config.json           # 서버 설정
├── extracted/            # 추출된 데이터 저장
│   ├── button-primary.json
│   ├── badge-success.json
│   └── card-default.json
└── logs/                 # 로그 파일
    └── server.log
```

---

### 3. Figma Plugin

**목적:** JSON 데이터를 Figma 프레임으로 변환

> 📄 **구현 상세:** [FIGMA_IMPLEMENTATION.md](./FIGMA_IMPLEMENTATION.md)
>
> ExtractedNode 타입 정의, CSS→Figma 매핑, Figma API 사용법 등은 별도 문서 참조

> **Target: Figma Desktop App Only**
>
> 이 플러그인은 **Figma Desktop App 전용**입니다. Figma Web 버전은 브라우저 샌드박스 환경에서 localhost 접근이 불가능하므로 지원하지 않습니다. Desktop App의 Electron 환경에서는 localhost WebSocket/HTTP 연결이 정상 동작합니다.

#### 독립 사용 (Standalone)
- 플러그인 UI에서 JSON 직접 붙여넣기
- 가져오기 버튼으로 Figma 프레임 생성

#### 서버 연동 시

**연결 프로세스:**
```
1. Plugin UI 로드
       ↓
2. 5초마다 GET /api/health 폴링
       ↓
3. 서버 응답 시 → WebSocket 연결
       ↓
4. 서버 명령 대기 (CREATE_FRAME 등)
       ↓
5. 연결 끊기면 → 다시 폴링으로 복귀
```

#### Plugin UI 통신 코드
```typescript
// figma-plugin/src/ui.ts
const HTTP_URL = 'http://localhost:19832';
const WS_URL = 'ws://localhost:19831';

let ws: WebSocket | null = null;
let pollingInterval: number | null = null;

function startServerDetection() {
  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${HTTP_URL}/api/health`);
      if (res.ok) {
        stopPolling();
        connectWebSocket();
      }
    } catch {
      updateStatus('서버 대기 중...', 'waiting');
    }
  }, 5000);
}

function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    updateStatus('서버 연결됨', 'connected');
    ws.send(JSON.stringify({ type: 'REGISTER', client: 'figma-plugin' }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    updateStatus('연결 끊김', 'disconnected');
    ws = null;
    startServerDetection();
  };
}

function handleServerMessage(msg: any) {
  switch (msg.type) {
    case 'CREATE_FRAME':
      parent.postMessage({
        pluginMessage: {
          type: 'create-from-json',
          data: msg.data,
          name: msg.name
        }
      }, '*');

      ws?.send(JSON.stringify({
        type: 'RESULT',
        commandId: msg.commandId,
        success: true
      }));
      break;

    case 'PING':
      ws?.send(JSON.stringify({ type: 'PONG' }));
      break;
  }
}

startServerDetection();
```

---

### 4. Playwright 연동

**목적:** 브라우저 자동화 (별도 MCP)

MCP 자동화 시 Playwright로 브라우저를 제어하고, Sigma 임베드 스크립트(추출 스크립트)로 컴포넌트를 추출합니다.

```
AI Agent
    │
    ├── Sigma MCP ──→ get_playwright_scripts()
    │   │              → 스크립트 경로 + API 정보 반환
    │   │
    │   └──→ figma_create_frame() → Figma에 프레임 생성
    │
    └── Playwright MCP ──→ 브라우저 제어
        │                  - navigate(url)
        │                  - addScriptTag(extractor.standalone.js)
        │                  - evaluate(window.__sigma__.extract(...))
        │
        └──→ ExtractedNode JSON 반환
```

**Playwright로 컴포넌트 추출하는 방법:**
```typescript
// 1. Sigma MCP로 스크립트 경로 확인
// get_playwright_scripts → { path: "/.../dist/extractor.standalone.js", api: [...] }

// 2. 페이지 이동
await page.goto('http://localhost:6006/?path=/story/button--primary');

// 3. Standalone Extractor inject
await page.addScriptTag({ path: scriptPath });

// 4. 컴포넌트 추출 (Extension 불필요)
const data = await page.evaluate(() => {
  return window.__sigma__.extract('.my-component');
});

// 5. Sigma MCP로 Figma에 전송
// sigma_create_frame({ token, data, name: 'Button/Primary' })
```

---

## 사용 시나리오

### 시나리오 1: 수동 사용 (서버 없이)

```
1. Chrome Extension 아이콘 클릭
2. "선택 모드" 버튼 클릭
3. 웹페이지에서 원하는 컴포넌트 클릭
4. 추출된 JSON이 클립보드에 복사됨
5. Figma Plugin 열기
6. JSON 붙여넣기
7. "가져오기" 버튼 클릭
```

### 시나리오 2: 서버 사용 (반자동)

```
1. sigma 서버 실행: sigma start
2. Extension이 서버 연결 상태 표시
3. Extension으로 컴포넌트 추출 → 서버에 자동 저장됨
4. http://localhost:19832 대시보드에서 저장된 컴포넌트 확인
5. "Figma로 보내기" 클릭
6. Figma Plugin이 자동으로 프레임 생성
```

### 시나리오 3: AI Agent 완전 자동화

```
User: "Storybook에서 Badge 컴포넌트를 Figma에 가져와줘"

AI Agent:
1. [Sigma] get_playwright_scripts()
   → 스크립트 경로 확인
2. [Playwright] navigate("http://localhost:6006/?path=/story/badge")
3. [Playwright] addScriptTag(extractor.standalone.js)
4. [Playwright] evaluate(() => window.__sigma__.extract('.badge'))
   → ExtractedNode JSON 반환
5. [Sigma] sigma_create_frame({ token, data: extracted, name: 'Badge' })
   → Figma에 프레임 생성됨

AI: "Badge 컴포넌트를 Figma에 가져왔습니다!"
```

### 시나리오 4: 일괄 디자인 시스템 동기화

```
User: "Storybook의 모든 Button variant를 Figma로 동기화해줘"

AI Agent:
1. [Sigma] get_playwright_scripts() → 스크립트 경로 확인
2. [Playwright] navigate("http://localhost:6006")
3. [Playwright] 사이드바에서 Button 스토리 목록 수집
4. for each variant in ["primary", "secondary", "outline", "ghost"]:
   - [Playwright] click(variant story)
   - [Playwright] addScriptTag(extractor.standalone.js) (페이지 변경 시 재inject)
   - [Playwright] evaluate(() => window.__sigma__.extract('.storybook-button'))
   - [Sigma] sigma_create_frame({ token, data, name: `Button/${variant}` })
5. 완료

AI: "4개의 Button variant를 Figma에 동기화했습니다!"
```

---

## 프로젝트 구조

```
sigma/
├── packages/
│   ├── chrome-extension/         # Chrome Extension
│   │   ├── src/
│   │   │   ├── background.ts     # Service Worker
│   │   │   ├── content.ts        # Content Script (shared/extractor 사용)
│   │   │   ├── popup/            # Popup UI
│   │   │   │   ├── popup.html
│   │   │   │   ├── popup.ts
│   │   │   │   └── popup.css
│   │   │   └── extractor/        # Extension 전용 래퍼
│   │   │       ├── index.ts
│   │   │       └── formats.ts    # HTML/JSON 변환
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   ├── server/                   # Local Server
│   │   ├── src/
│   │   │   ├── index.ts          # 메인 엔트리
│   │   │   ├── mcp/              # MCP Server
│   │   │   │   ├── server.ts
│   │   │   │   └── tools.ts      # get_playwright_scripts 포함
│   │   │   ├── scripts/          # Playwright 스크립트 관리
│   │   │   │   └── registry.ts   # 스크립트 메타데이터 레지스트리
│   │   │   ├── http/             # HTTP Server
│   │   │   │   ├── server.ts
│   │   │   │   └── routes/
│   │   │   │       ├── health.ts
│   │   │   │       ├── extracted.ts
│   │   │   │       └── figma.ts
│   │   │   ├── websocket/        # WebSocket Server
│   │   │   │   └── server.ts
│   │   │   ├── storage/          # File Storage
│   │   │   │   └── index.ts
│   │   │   └── dashboard/        # Web Dashboard
│   │   │       ├── index.html
│   │   │       └── assets/
│   │   └── package.json
│   │
│   ├── figma-plugin/             # Figma Plugin
│   │   ├── src/
│   │   │   ├── code.ts           # Plugin Main (Figma API)
│   │   │   ├── ui.ts             # Plugin UI
│   │   │   ├── ui.html
│   │   │   └── converter/        # JSON → Figma 변환
│   │   │       ├── index.ts
│   │   │       ├── frame.ts
│   │   │       ├── text.ts
│   │   │       └── styles.ts
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   └── shared/                   # 공유 타입/유틸/추출 로직
│       ├── src/
│       │   ├── types.ts          # ExtractedNode 등 공통 타입
│       │   ├── colors.ts         # 색상 파싱 유틸
│       │   ├── extractor/        # 추출 로직 (Single Source of Truth)
│       │   │   ├── core.ts       # extractElement 등 16개 함수
│       │   │   └── index.ts      # Barrel export
│       │   ├── extractor-standalone-entry.ts  # IIFE 진입점 (window.__sigma__)
│       │   ├── utils.ts          # 공통 유틸리티
│       │   └── constants.ts      # 포트 번호 등 상수
│       ├── build.ts              # esbuild (TS → Sigma 임베드 스크립트)
│       ├── dist/                 # Sigma 임베드 스크립트 빌드 결과
│       │   └── extractor.standalone.js  # 추출 스크립트 (IIFE 번들)
│       └── package.json
│
├── CLAUDE.md                     # 아키텍처 및 구현 명세
├── FIGMA_IMPLEMENTATION.md       # Figma Plugin 구현 가이드 (JSON→Figma 변환)
├── README.md                     # 프로젝트 소개
├── package.json                  # 모노레포 설정
└── bunfig.toml                   # Bun 설정 (workspace 포함)
```

---

## 기술 스택

| 모듈 | 기술 |
|------|------|
| Chrome Extension | TypeScript, Chrome Extension Manifest V3 |
| Local Server | Bun, TypeScript, Hono, @modelcontextprotocol/sdk |
| Figma Plugin | TypeScript, Figma Plugin API |
| Shared | TypeScript |
| Build | esbuild (Extension/Plugin), Bun (Server) |
| Package Manager | Bun workspace |
| Dashboard | Vanilla JS 또는 Preact (경량) |

---

## 포트 및 프로토콜

| 서비스 | 포트 | 프로토콜 | 용도 |
|--------|------|----------|------|
| HTTP Server | 19832 | HTTP | REST API, Dashboard |
| WebSocket Server | 19831 | WebSocket | Figma Plugin 통신 |
| MCP Server | - | stdio | AI Agent 통신 |

---

## 설정 파일

### Server 설정
```json
// ~/.sigma/config.json
{
  "server": {
    "httpPort": 19832,
    "wsPort": 19831
  },
  "storage": {
    "path": "~/.sigma/extracted",
    "autoSave": true
  },
  "figma": {
    "pingInterval": 10000
  }
}
```

### Extension 설정 (storage.local)
```json
{
  "serverUrl": "http://localhost:19832",
  "defaultFormat": "json",
  "autoSendToServer": true
}
```

### Figma Plugin 설정
```json
{
  "serverHttpUrl": "http://localhost:19832",
  "serverWsUrl": "ws://localhost:19831",
  "pollingInterval": 5000
}
```

---

## 개발 명령어

```bash
# 의존성 설치
bun install

# 전체 개발 모드
bun dev

# 개별 패키지
bun run --filter @sigma/extension dev      # Extension (watch)
bun run --filter @sigma/server dev         # Server (watch)
bun run --filter @sigma/figma-plugin dev   # Figma Plugin (watch)

# 빌드
bun run build

# 서버 실행 (production)
bun run --filter @sigma/server start

# Extension 로드
# chrome://extensions → 개발자 모드 → packages/chrome-extension/dist 로드

# Figma Plugin 로드
# Figma → Plugins → Development → Import plugin from manifest
# → packages/figma-plugin/manifest.json 선택
```

---

## Docker 배포

### 개요

Sigma 서버를 Docker 컨테이너로 실행하여 시스템 부팅 시 자동 시작되도록 구성할 수 있습니다.

| 환경 | 실행 방식 | 용도 |
|------|-----------|------|
| **개발** | `bun run dev` | 코드 변경 시 자동 재시작 (watch) |
| **프로덕션** | `docker compose up -d` | 항상 실행, 자동 재시작 |

### Docker Compose 실행

```bash
# 서버 시작 (백그라운드)
docker compose up -d

# 로그 확인
docker compose logs -f sigma

# 서버 중지
docker compose down

# 이미지 재빌드 (코드 변경 후)
docker compose up -d --build
```

### 프로젝트 구조 (Docker 관련)

```
sigma/
├── Dockerfile              # 서버 이미지 빌드
├── docker-compose.yml      # 컨테이너 오케스트레이션
├── .dockerignore           # 빌드 제외 파일
└── packages/
    └── server/             # 컨테이너에서 실행되는 서버
```

### Dockerfile 명세

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# 의존성 설치
FROM base AS deps
COPY package.json bun.lock* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
RUN bun install --frozen-lockfile

# 프로덕션 실행
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY package.json ./

EXPOSE 19831 19832

CMD ["bun", "run", "--filter", "@sigma/server", "start"]
```

### docker-compose.yml 명세

```yaml
services:
  sigma:
    build: .
    container_name: sigma-server
    ports:
      - "19831:19831"  # WebSocket (Figma Plugin)
      - "19832:19832"  # HTTP API + MCP
    volumes:
      - sigma-data:/root/.sigma  # 추출된 컴포넌트 데이터 영속성
    restart: always  # Docker Desktop 시작 시 자동 실행
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:19832/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  sigma-data:
```

### Docker Desktop 자동 시작 설정

1. Docker Desktop 설정 → General → "Start Docker Desktop when you sign in" 활성화
2. `docker compose up -d` 실행 후 `restart: always` 정책으로 자동 재시작

### 주의사항

- **개발 중 코드 변경 시**: `docker compose up -d --build`로 이미지 재빌드 필요
- **볼륨 마운트**: `~/.sigma` 데이터는 Docker volume으로 영속화됨
- **네트워크**: `host.docker.internal`로 호스트 접근 가능 (필요 시)

---

## 개발 단계

### Phase 1: 기반 구축 (3-4일)
- [ ] Shared 패키지: ExtractedNode 타입 정의
- [ ] Extension: 컴포넌트 추출 + 클립보드 복사
- [ ] Extension: 서버 연결 시 자동 POST
- [ ] Figma Plugin: JSON 붙여넣기 → 프레임 생성
- [ ] 독립 사용 가능하게 완성

### Phase 2: Server 구현 (4-5일)
- [ ] HTTP Server + REST API
- [ ] WebSocket Server (Figma 통신)
- [ ] File Storage
- [ ] 간단한 Dashboard

### Phase 3: MCP 구현 (2-3일)
- [ ] MCP Server 기본 구조
- [ ] 데이터 관리 Tools
- [ ] Figma 제어 Tools

### Phase 4: 통합 및 문서화 (2일)
- [ ] Playwright + Sigma MCP 연동 테스트
- [ ] 에러 핸들링
- [ ] README 및 사용 가이드

**예상 총 기간: 약 2주**

---

## 보안 고려사항

1. **localhost만 허용**
   - 서버는 127.0.0.1에서만 리스닝
   - 외부 네트워크 접근 차단

2. **CORS 설정**
   ```typescript
   app.use(cors({
     origin: [
       /^chrome-extension:\/\//,
       'http://localhost:19832'
     ]
   }));
   ```

3. **Extension host_permissions**
   ```json
   "host_permissions": ["http://localhost:19832/*"]
   ```

4. **입력 검증**
   - POST /api/extracted 에서 데이터 스키마 검증
   - 파일명 sanitization (path traversal 방지)

---

## 향후 확장 가능성

- [ ] 디자인 토큰 추출 (CSS 변수 → Figma Variables)
- [ ] 반대 방향 동기화 (Figma → Code)
- [ ] 컴포넌트 버전 관리 및 diff
- [ ] 팀 협업 (클라우드 서버 옵션)
- [ ] VS Code Extension 연동
- [ ] 다른 디자인 도구 지원 (Sketch, Adobe XD)
