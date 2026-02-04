# Sigma MCP 인증 시스템

AI Agent가 Sigma 서버의 MCP 도구를 사용하기 위한 **sigma 토큰** 기반 인증 시스템.

---

## 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AI Agent 워크플로우                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   1. sigma_login()                                                       │
│         │                                                                │
│         ▼                                                                │
│   ┌─────────────────────────────────────┐                               │
│   │  Sigma Token: "stk-a1b2c3d4e5f6"    │  ← AI 메모리에만 보관          │
│   │  Binding: (없음)                     │  ← 저장 금지!                 │
│   └─────────────────────────────────────┘                               │
│         │                                                                │
│         ▼                                                                │
│   2. sigma_bind(token, pluginId, pageId?)                               │
│         │                                                                │
│         ▼                                                                │
│   ┌─────────────────────────────────────┐                               │
│   │  Sigma Token: "stk-a1b2c3d4e5f6"    │                               │
│   │  Binding:                            │                               │
│   │    pluginId: "figma-xxx"            │                               │
│   │    pageId: "123:0"                  │                               │
│   │    fileName: "Design System"        │                               │
│   │    pageName: "Buttons"              │                               │
│   └─────────────────────────────────────┘                               │
│         │                                                                │
│         ▼                                                                │
│   3. CRUD 작업 (token만 필요!)                                           │
│      sigma_create_frame(token, data)                                    │
│      sigma_delete_frame(token, nodeId)                                  │
│      sigma_get_frames(token)                                            │
│         │                                                                │
│         ▼                                                                │
│   4. 작업 대상 변경 시                                                    │
│      sigma_bind(token, 다른pluginId, 다른pageId)                        │
│         │                                                                │
│         ▼                                                                │
│   5. 새 대상에서 CRUD 계속                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 핵심 규칙

### Sigma 토큰 규칙 (AI Agent 측)

| 규칙 | 설명 |
|------|------|
| **메모리 전용** | sigma 토큰은 AI의 작업 메모리에만 보관. 파일, 데이터베이스 등에 저장 금지. |
| **10분 만료** | 발급 후 10분간 유효. 사용할 때마다 만료 시간 갱신. |
| **1 토큰 = 1 Agent** | 각 AI Agent는 자신만의 sigma 토큰을 가짐. |
| **분실 시 재발급** | sigma 토큰을 잊었거나 만료되면 다시 `sigma_login()` 호출. |

### Sigma 토큰 규칙 (서버 측)

| 규칙 | 설명 |
|------|------|
| **메모리 전용** | 서버도 sigma 토큰 목록을 메모리에만 저장. 파일시스템 저장 안 함. |
| **서버 재시작 시 휘발** | 서버가 재시작되면 모든 sigma 토큰이 사라짐. |
| **지연 정리 (Lazy Cleanup)** | 만료된 sigma 토큰은 사용 시도할 때 제거됨. |
| **100회 로그인마다 정리** | 로그인 100회마다 만료된 sigma 토큰 일괄 정리. |

### 바인딩 규칙

| 규칙 | 설명 |
|------|------|
| **1 sigma 토큰 → 1 페이지** | 하나의 sigma 토큰은 **반드시 하나의 페이지**에만 바인딩 가능. |
| **N sigma 토큰 → 1 페이지** | 같은 페이지에 **여러 sigma 토큰**이 바인딩될 수 있음. (여러 AI Agent가 동시에 같은 페이지 작업 가능) |
| **바인딩 덮어쓰기** | 이미 바인딩된 sigma 토큰에 다시 `sigma_bind()` 호출 시, 기존 바인딩이 **새 바인딩으로 교체**됨. |
| **바인딩 해제 없음** | 별도의 "unbind" 개념 없음. 바인딩을 바꾸려면 다시 `sigma_bind()` 호출. |
| **바인딩 필수 (Write)** | 프레임 생성/수정/삭제는 바인딩 후에만 가능. |

```
┌───────────────────────────────────────────────────────────────────────┐
│  바인딩 관계 다이어그램                                                │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Sigma Token A ─────┐                                                  │
│                     │                                                  │
│  Sigma Token B ─────┼───→  Page "Buttons"   (동시 작업 가능)           │
│                     │                                                  │
│  Sigma Token C ─────┘                                                  │
│                                                                        │
│  Sigma Token D ─────────→  Page "Icons"     (별도 작업)                │
│                                                                        │
│  Sigma Token E ─────────→  (바인딩 없음)     → Write 불가, Read만 가능  │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 서버 Sigma 토큰 저장소 명세

### 데이터 구조

```typescript
interface TokenData {
  token: string;
  expiresAt: Date;           // 만료 시간 (핵심!)
  binding: {
    pluginId: string;        // Figma 플러그인 ID
    pageId: string;          // 페이지 ID
    fileName: string;        // 파일 이름 (표시용)
    pageName: string;        // 페이지 이름 (표시용)
  } | null;
}

// 서버 메모리 상태 (파일 저장 안 함!)
const tokens = new Map<string, TokenData>();
let loginAttemptCount = 0;  // 로그인 시도 카운터
```

### Sigma 토큰 생성

```typescript
function generateToken(): string {
  const random = crypto.randomBytes(8).toString('hex');
  return `stk-${random}`;  // stk = Sigma ToKen
}

function createToken(): string {
  const token = generateToken();
  const now = new Date();

  tokens.set(token, {
    token,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),  // 10분 후
    binding: null,
  });

  // 로그인 카운터 증가 및 100회마다 정리
  loginAttemptCount++;
  if (loginAttemptCount >= 100) {
    cleanupExpiredTokens();
    loginAttemptCount = 0;
  }

  return token;
}
```

### Sigma 토큰 검증 (지연 정리)

```typescript
function validateToken(token: string): TokenData | null {
  const data = tokens.get(token);

  // sigma 토큰이 존재하지 않음
  if (!data) {
    return null;
  }

  // 만료 확인 → 만료되었으면 그때서야 제거
  const now = new Date();
  if (now > data.expiresAt) {
    tokens.delete(token);  // 지연 정리!
    return null;
  }

  // 유효한 sigma 토큰 → 만료 시간 갱신
  data.expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  return data;
}
```

### 100회 로그인 시 만료된 Sigma 토큰 일괄 정리

```typescript
function cleanupExpiredTokens(): void {
  const now = new Date();
  let cleaned = 0;

  for (const [token, data] of tokens) {
    if (now > data.expiresAt) {
      tokens.delete(token);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Sigma Token] Cleaned up ${cleaned} expired tokens`);
  }
}
```

---

## API 명세

### 1. sigma_login

sigma 토큰을 발급받습니다. 모든 MCP 작업의 시작점입니다.

```typescript
// 요청
sigma_login {}

// 응답
{
  "token": "stk-a1b2c3d4e5f6g7h8",
  "expiresAt": "2024-01-15T10:40:00Z",
  "message": "sigma 토큰이 발급되었습니다. 이 토큰을 메모리에 보관하고, 모든 sigma 도구 호출에 사용하세요.",
  "nextStep": "sigma_list_plugins(token)로 연결된 플러그인을 확인한 후, sigma_bind(token, pluginId, pageId?)로 작업 대상을 지정하세요."
}
```

---

### 2. sigma_list_plugins

연결된 모든 Figma 플러그인 목록을 조회합니다. (바인딩 불필요)

```typescript
// 요청
sigma_list_plugins {
  token: string,  // 필수
}

// 응답 (성공)
{
  "plugins": [
    {
      "pluginId": "figma-m5x2k8r-a7b2",
      "fileKey": "abc123",
      "fileName": "Design System",
      "pages": [
        { "pageId": "0:1", "pageName": "Cover" },
        { "pageId": "123:0", "pageName": "Buttons" },
        { "pageId": "456:0", "pageName": "Icons" }
      ],
      "currentPageId": "123:0",
      "connectedAt": "2024-01-15T10:30:00Z"
    },
    {
      "pluginId": "figma-m5x3j9t-c4d1",
      "fileKey": "def456",
      "fileName": "App UI",
      "pages": [...],
      "currentPageId": "789:0",
      "connectedAt": "2024-01-15T11:00:00Z"
    }
  ],
  "count": 2
}

// 응답 (sigma 토큰 오류)
→ 공통 에러 응답 참조
```

---

### 3. sigma_bind

sigma 토큰을 특정 작업공간(플러그인 + 페이지)에 바인딩합니다.

```typescript
// 요청
sigma_bind {
  token: string,       // 필수
  pluginId: string,    // 필수 - 대상 Figma 플러그인 ID
  pageId?: string,     // 선택 - 대상 페이지 ID (생략 시 현재 페이지)
}

// 응답 (성공)
{
  "success": true,
  "binding": {
    "pluginId": "figma-m5x2k8r-a7b2",
    "pageId": "123:0",
    "fileName": "Design System",
    "pageName": "Buttons"
  },
  "message": "작업 대상이 설정되었습니다: Design System / Buttons"
}

// 응답 (플러그인 없음)
{
  "error": "PLUGIN_NOT_FOUND",
  "message": "지정된 플러그인이 연결되어 있지 않습니다: figma-xxx",
  "hint": "sigma_list_plugins(token)로 연결된 플러그인을 확인하세요."
}

// 응답 (페이지 없음)
{
  "error": "PAGE_NOT_FOUND",
  "message": "지정된 페이지를 찾을 수 없습니다: 999:0",
  "hint": "sigma_list_plugins(token)로 사용 가능한 페이지 목록을 확인하세요."
}
```

---

### 4. sigma_create_frame

바인딩된 작업공간에 프레임을 생성합니다.

```typescript
// 요청 (간소화됨 - pluginId, pageId 불필요!)
sigma_create_frame {
  token: string,              // 필수
  data: ExtractedNode,        // 필수 - JSON 데이터
  name?: string,              // 선택 - 프레임 이름
  position?: { x, y },        // 선택 - 생성 위치
}

// 응답 (성공)
{
  "success": true,
  "frame": {
    "id": "999:123",
    "name": "Button Primary"
  },
  "workspace": {
    "fileName": "Design System",
    "pageName": "Buttons"
  }
}

// 응답 (바인딩 없음)
→ 공통 에러 응답 참조
```

---

### 5. sigma_get_frames

프레임 목록을 조회합니다. **두 가지 호출 방식** 지원.

```typescript
// 방식 1: sigma 토큰 사용 (바인딩된 페이지에서 조회)
sigma_get_frames {
  token: string,
}

// 방식 2: 직접 지정 (sigma 토큰 불필요, 아무 페이지나 조회 가능)
sigma_get_frames {
  pluginId: string,
  pageId: string,
}

// 응답 (성공)
{
  "frames": [
    { "id": "100:1", "name": "Button Primary", "x": 0, "y": 0, "width": 120, "height": 40 },
    { "id": "100:2", "name": "Button Secondary", "x": 150, "y": 0, "width": 120, "height": 40 }
  ],
  "count": 2,
  "workspace": {
    "pluginId": "figma-xxx",
    "fileName": "Design System",
    "pageId": "123:0",
    "pageName": "Buttons"
  }
}

// 응답 (둘 다 없거나 둘 다 있음)
{
  "error": "INVALID_PARAMS",
  "message": "sigma 토큰 또는 (pluginId + pageId) 중 하나를 지정하세요.",
  "hint": "두 방식을 동시에 사용할 수 없습니다."
}
```

**사용 시나리오: A 페이지 참고해서 B 페이지 수정**
```
sigma 토큰이 B 페이지에 바인딩된 상태:

sigma_get_frames({ pluginId: "xxx", pageId: "A" })  ← A 참고 (직접)
sigma_create_frame({ token: myToken, data: ... })   ← B에 생성 (sigma 토큰)
sigma_get_frames({ pluginId: "xxx", pageId: "A" })  ← A 다시 참고
sigma_create_frame({ token: myToken, data: ... })   ← B에 또 생성
```

---

### 6. sigma_delete_frame

바인딩된 작업공간에서 프레임을 삭제합니다.

```typescript
// 요청 (간소화됨!)
sigma_delete_frame {
  token: string,    // 필수
  nodeId: string,   // 필수 - 삭제할 프레임 ID
}

// 응답 (성공)
{
  "success": true,
  "deleted": {
    "nodeId": "100:1",
    "name": "Button Primary"
  },
  "workspace": {
    "fileName": "Design System",
    "pageName": "Buttons"
  }
}
```

---

### 7. sigma_status

현재 sigma 토큰 상태와 바인딩 정보를 확인합니다.

```typescript
// 요청
sigma_status {
  token: string,  // 필수
}

// 응답 (바인딩 있음)
{
  "tokenValid": true,
  "expiresAt": "2024-01-15T10:45:00Z",
  "binding": {
    "pluginId": "figma-m5x2k8r-a7b2",
    "pageId": "123:0",
    "fileName": "Design System",
    "pageName": "Buttons"
  }
}

// 응답 (바인딩 없음)
{
  "tokenValid": true,
  "expiresAt": "2024-01-15T10:45:00Z",
  "binding": null,
  "hint": "sigma_bind(token, pluginId, pageId?)로 작업 대상을 지정하세요."
}
```

---

### 8. sigma_logout

sigma 토큰을 명시적으로 무효화합니다. (선택적)

```typescript
// 요청
sigma_logout {
  token: string,
}

// 응답
{
  "success": true,
  "message": "sigma 토큰이 무효화되었습니다."
}
```

---

## 공통 에러 응답

### Sigma 토큰 관련 에러

모든 API에서 sigma 토큰이 없거나 만료된 경우:

```typescript
// sigma 토큰 없음
{
  "error": "TOKEN_REQUIRED",
  "message": "sigma 토큰이 필요합니다.",
  "guide": {
    "step1": "sigma_login()을 호출하여 sigma 토큰을 발급받으세요.",
    "step2": "발급받은 sigma 토큰을 메모리에 보관하세요. (파일 저장 금지!)",
    "step3": "모든 sigma 도구 호출 시 token 파라미터에 포함하세요."
  }
}

// sigma 토큰 만료 또는 유효하지 않음
{
  "error": "TOKEN_INVALID",
  "message": "sigma 토큰이 유효하지 않거나 만료되었습니다.",
  "guide": {
    "step1": "sigma_login()을 호출하여 새 sigma 토큰을 발급받으세요.",
    "step2": "발급받은 sigma 토큰으로 다시 작업을 진행하세요.",
    "note": "sigma 토큰은 10분간 유효하며, 사용 시마다 갱신됩니다."
  }
}
```

### 바인딩 관련 에러

sigma 토큰은 유효하지만 바인딩이 필요한 작업에서 바인딩이 없는 경우:

```typescript
{
  "error": "BINDING_REQUIRED",
  "message": "작업 대상이 지정되지 않았습니다.",
  "guide": {
    "step1": "sigma_list_plugins(token)로 연결된 플러그인 목록을 확인하세요.",
    "step2": "sigma_bind(token, pluginId, pageId?)로 작업할 플러그인과 페이지를 지정하세요.",
    "step3": "그 후 이 작업을 다시 시도하세요."
  },
  "example": {
    "listPlugins": "sigma_list_plugins({ token: \"your-token\" })",
    "bind": "sigma_bind({ token: \"your-token\", pluginId: \"figma-xxx\", pageId: \"123:0\" })"
  }
}
```

---

## API 요약

### 파라미터 간소화 비교

| API | 기존 (가정) | 신규 |
|-----|-------------|------|
| `create_frame` | token, pluginId, pageId, data, name, position | **sigma 토큰**, data, name?, position? |
| `get_frames` | token, pluginId, pageId | **sigma 토큰** |
| `delete_frame` | token, pluginId, pageId, nodeId | **sigma 토큰**, nodeId |

**핵심**: pluginId와 pageId는 바인딩에 저장되므로, CRUD 호출 시 sigma 토큰만 있으면 됨!

### 바인딩 필요 여부

| API | sigma 토큰 필요 | 바인딩 필요 |
|-----|:---------:|:-----------:|
| `sigma_login` | - | - |
| `sigma_logout` | O | - |
| `sigma_list_plugins` | O | - |
| `sigma_status` | O | - |
| `sigma_bind` | O | - |
| `sigma_get_frames` | O | **O** |
| `sigma_create_frame` | O | **O** |
| `sigma_delete_frame` | O | **O** |

---

## 사용 예시

### 기본 워크플로우

```
User: "Design System 파일의 Buttons 페이지에 버튼 3개 만들어줘"

AI Agent:
┌─────────────────────────────────────────────────────────────────┐
│ 1. sigma 토큰 발급                                               │
│    sigma_login()                                                │
│    → token: "stk-a1b2c3d4"                                      │
│    [메모리 저장: myToken = "stk-a1b2c3d4"]                       │
├─────────────────────────────────────────────────────────────────┤
│ 2. 연결된 플러그인 확인                                          │
│    sigma_list_plugins({ token: myToken })                       │
│    → plugins: [                                                 │
│        { pluginId: "figma-xxx", fileName: "Design System", ... }│
│      ]                                                          │
├─────────────────────────────────────────────────────────────────┤
│ 3. 작업 대상 바인딩                                              │
│    sigma_bind({                                                 │
│      token: myToken,                                            │
│      pluginId: "figma-xxx",                                     │
│      pageId: "buttons-page-id"                                  │
│    })                                                           │
│    → binding: { fileName: "Design System", pageName: "Buttons" }│
├─────────────────────────────────────────────────────────────────┤
│ 4. 프레임 생성 (간소화된 호출!)                                   │
│    sigma_create_frame({ token: myToken, data: button1 })        │
│    sigma_create_frame({ token: myToken, data: button2 })        │
│    sigma_create_frame({ token: myToken, data: button3 })        │
│                                                                  │
│    ↑ pluginId, pageId 불필요! sigma 토큰에 바인딩되어 있음       │
└─────────────────────────────────────────────────────────────────┘
```

### 작업 대상 변경

```
User: "이번엔 App UI 파일의 Home 페이지에도 같은 버튼 넣어줘"

AI Agent:
┌─────────────────────────────────────────────────────────────────┐
│ 1. 새 대상으로 바인딩 변경 (같은 sigma 토큰!)                    │
│    sigma_bind({                                                 │
│      token: myToken,             ← 기존 sigma 토큰 재사용        │
│      pluginId: "figma-yyy",      ← 다른 플러그인                │
│      pageId: "home-page-id"                                     │
│    })                                                           │
│    → binding: { fileName: "App UI", pageName: "Home" }          │
├─────────────────────────────────────────────────────────────────┤
│ 2. 프레임 생성 (동일한 간소화된 호출)                             │
│    sigma_create_frame({ token: myToken, data: button1 })        │
│    sigma_create_frame({ token: myToken, data: button2 })        │
│    sigma_create_frame({ token: myToken, data: button3 })        │
└─────────────────────────────────────────────────────────────────┘
```

### Sigma 토큰 만료 시 복구

```
AI Agent:
┌─────────────────────────────────────────────────────────────────┐
│ sigma_create_frame({ token: myToken, data: ... })               │
│                                                                  │
│ → error: "TOKEN_INVALID"                                        │
│   guide: { step1: "sigma_login()을 호출하여..." }               │
├─────────────────────────────────────────────────────────────────┤
│ 복구 절차:                                                       │
│                                                                  │
│ 1. sigma_login()                                                │
│    → newToken: "stk-e5f6g7h8"                                   │
│    [메모리 업데이트: myToken = "stk-e5f6g7h8"]                   │
│                                                                  │
│ 2. sigma_bind({ token: myToken, pluginId: "figma-xxx", ... })   │
│                                                                  │
│ 3. sigma_create_frame({ token: myToken, data: ... })            │
│    → success!                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 설계 원칙: AI 오류 방지 메커니즘

> **핵심 목적: 보안이 아닌 "AI 헛짓거리 방어"**
>
> sigma 토큰 시스템은 보안을 위한 것이 아닙니다.
> AI Agent가 작업 컨텍스트를 잃어버리거나, 잘못된 작업공간에서 작업하거나,
> 이전 세션의 잔재로 엉뚱한 행동을 하는 것을 방지하기 위한 **오류 방지 메커니즘**입니다.

| 원칙 | 목적 |
|------|------|
| **AI 측 메모리 전용** | AI가 파일에 sigma 토큰을 저장하면 나중에 만료된 토큰을 재사용하려 시도함. 메모리에만 두면 세션이 끝나면 자연스럽게 사라짐. |
| **서버 측 메모리 전용** | 서버 재시작 시 모든 상태가 깨끗하게 초기화됨. 좀비 세션이나 유령 바인딩 없음. |
| **10분 만료** | AI가 sigma 토큰을 들고 오랜 시간 방치하면 컨텍스트가 오래된 것. 다시 로그인하면서 현재 상태를 재확인하게 함. |
| **바인딩 필수** | AI가 "어디에" 작업하는지 명시적으로 선언해야 함. 암묵적 가정 방지. |
| **지연 정리** | 쓸데없는 백그라운드 작업 없음. 필요할 때만 정리. |
| **localhost 전용** | 로컬 개발 환경에서만 동작. |

### 이 시스템이 방지하는 AI 실수들

| 실수 유형 | 방지 방법 |
|-----------|-----------|
| 잘못된 파일에 프레임 생성 | 바인딩 없이는 Write 불가 |
| 이전 세션의 작업공간 혼동 | sigma 토큰 만료로 강제 재인증 |
| 여러 플러그인 동시 조작 시 혼란 | 1 sigma 토큰 = 1 작업공간 |
| 끊어진 플러그인에 명령 시도 | 바인딩 시 연결 상태 확인 |
| 오래된 sigma 토큰으로 작업 재개 | 파일 저장 금지 + 만료 시스템 |

---

## API 목록

이 시스템의 전체 MCP API입니다. 기존 `figma_*` 도구들은 완전히 대체됩니다.

### 인증 API (sigma 토큰 불필요)

| API | 설명 |
|-----|------|
| `sigma_login` | sigma 토큰 발급. 모든 작업의 시작점. |

### 조회 API (sigma 토큰 필요, 바인딩 불필요)

바인딩 전에 상태를 파악하기 위한 API들입니다.

| API | 설명 | 용도 |
|-----|------|------|
| `sigma_list_plugins` | 연결된 플러그인 목록 + 각 플러그인의 페이지 목록 | 바인딩 대상 선택 |
| `sigma_status` | 현재 sigma 토큰 상태 및 바인딩 정보 확인 | 상태 확인 |
| `sigma_logout` | sigma 토큰 무효화 | 세션 종료 |

**`sigma_list_plugins` 응답에 포함되는 정보:**
```typescript
{
  plugins: [
    {
      pluginId: "figma-xxx",
      fileKey: "abc123",
      fileName: "Design System",
      pages: [                        // ← 페이지 목록 포함!
        { pageId: "0:1", pageName: "Cover" },
        { pageId: "123:0", pageName: "Buttons" },
        { pageId: "456:0", pageName: "Icons" }
      ],
      currentPageId: "123:0",         // ← 현재 열린 페이지
      connectedAt: "2024-01-15T10:30:00Z"
    }
  ]
}
```

이 정보로 AI는 바인딩할 대상(pluginId + pageId)을 선택할 수 있습니다.

### 바인딩 API (sigma 토큰 필요, 바인딩 불필요)

| API | 설명 |
|-----|------|
| `sigma_bind` | sigma 토큰을 특정 작업공간(pluginId + pageId)에 바인딩 |

### Read API (인증 선택적)

**변경이 없는 조회 작업**은 두 가지 방식으로 호출 가능합니다.

| API | 설명 |
|-----|------|
| `sigma_get_frames` | 프레임 목록 조회 |

**호출 방식 1: 직접 지정 (sigma 토큰 불필요)**
```typescript
sigma_get_frames({
  pluginId: "figma-xxx",
  pageId: "123:0"
})
```

**호출 방식 2: sigma 토큰 사용 (바인딩 필요)**
```typescript
sigma_get_frames({
  token: "stk-xxx"
})
```

> **왜 두 가지 방식?**
>
> "A 페이지를 참고해서 B 페이지를 수정"하는 시나리오에서,
> 매번 바인딩을 A→B→A→B 전환하는 것은 불필요하게 번거롭습니다.
>
> ```
> sigma 토큰이 B 페이지에 바인딩된 상태에서:
>
> sigma_get_frames({ pluginId, pageId: "A" })  ← A 페이지 참고 (직접 지정)
> sigma_create_frame({ token, data: ... })     ← B 페이지에 생성 (sigma 토큰 사용)
> sigma_get_frames({ pluginId, pageId: "A" })  ← A 페이지 다시 참고
> sigma_create_frame({ token, data: ... })     ← B 페이지에 또 생성
> ```
>
> 바인딩 전환 없이 자유롭게 읽기 가능!

### Write API (sigma 토큰 필수, 바인딩 필수)

**변경이 발생하는 작업**은 반드시 sigma 토큰 + 바인딩이 필요합니다.

| API | 설명 |
|-----|------|
| `sigma_create_frame` | 바인딩된 페이지에 프레임 생성 |
| `sigma_delete_frame` | 바인딩된 페이지에서 프레임 삭제 |

### API 요약 표

| API | sigma 토큰 | 바인딩 | 분류 | 비고 |
|-----|:----:|:------:|------|------|
| `sigma_login` | - | - | 인증 | |
| `sigma_logout` | O | - | 조회 | |
| `sigma_list_plugins` | O | - | 조회 | |
| `sigma_status` | O | - | 조회 | |
| `sigma_bind` | O | - | 바인딩 | |
| `sigma_get_frames` | **선택** | **선택** | Read | sigma 토큰 또는 pluginId+pageId |
| `sigma_create_frame` | O | **O** | Write | |
| `sigma_delete_frame` | O | **O** | Write | |
