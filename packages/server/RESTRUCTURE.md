# Server 구조화 계획

## 현재 구조 분석

### 파일별 라인 수
| 파일 | 라인 수 | 상태 |
|------|---------|------|
| `mcp/tools.ts` | 1,064 | **과대** - 분리 필요 |
| `websocket/server.ts` | 569 | 분리 고려 |
| `http/server.ts` | 402 | 적정 |
| `auth/token.ts` | 273 | 적정 |
| `storage/index.ts` | 207 | 적정 |
| `mcp/server.ts` | 149 | 적정 |
| `index.ts` | 104 | 적정 |

### mcp/tools.ts 관심사 분석 (1,064줄)

현재 단일 파일에 모든 MCP 도구가 정의되어 있음:

1. **토큰 관리 도구** (약 150줄)
   - `sigma_login`
   - `sigma_logout`
   - `sigma_status`
   - `sigma_bind`

2. **플러그인 관리 도구** (약 100줄)
   - `sigma_list_plugins`
   - `sigma_list_pages`

3. **컴포넌트 저장소 도구** (약 150줄)
   - `save_extracted`
   - `list_saved`
   - `load_extracted`
   - `delete_extracted`

4. **Figma 연동 도구** (약 200줄)
   - `sigma_create_frame`
   - `sigma_import_file`
   - `sigma_get_frames`
   - `sigma_delete_frame`
   - `save_and_import`

5. **유틸리티 함수** (약 50줄)
   - `validateToken()`
   - `getTargetFromBinding()`

6. **도구 정의 배열** (약 400줄)
   - 모든 도구의 inputSchema 정의

### websocket/server.ts 관심사 (569줄)

1. **연결 관리** - 클라이언트 등록/해제
2. **메시지 라우팅** - 타입별 핸들러
3. **Figma 명령 전송** - CREATE_FRAME 등
4. **상태 조회** - 플러그인 목록, 페이지 목록

---

## 제안 구조

```
packages/server/
├── src/
│   ├── index.ts                   # 서버 진입점 (유지)
│   │
│   ├── mcp/
│   │   ├── server.ts              # MCP 서버 설정 (유지)
│   │   ├── tools/                 # 도구별 분리
│   │   │   ├── index.ts           # 도구 등록 및 export
│   │   │   ├── definitions.ts     # 도구 스키마 정의
│   │   │   ├── token.ts           # 토큰 관리 도구
│   │   │   ├── plugin.ts          # 플러그인 관리 도구
│   │   │   ├── storage.ts         # 컴포넌트 저장소 도구
│   │   │   └── figma.ts           # Figma 연동 도구
│   │   └── utils.ts               # MCP 유틸리티
│   │
│   ├── websocket/
│   │   ├── server.ts              # WebSocket 서버 (유지, 축소)
│   │   ├── handlers/              # 메시지 핸들러 분리
│   │   │   ├── index.ts           # 핸들러 라우팅
│   │   │   ├── register.ts        # REGISTER 핸들러
│   │   │   ├── figma.ts           # Figma 관련 핸들러
│   │   │   └── status.ts          # 상태 조회 핸들러
│   │   └── connection.ts          # 연결 관리
│   │
│   ├── http/
│   │   ├── server.ts              # HTTP 서버 (유지)
│   │   └── routes/                # 라우트 분리 (선택)
│   │       ├── health.ts
│   │       ├── extracted.ts
│   │       └── figma.ts
│   │
│   ├── auth/
│   │   └── token.ts               # 토큰 관리 (유지)
│   │
│   ├── storage/
│   │   └── index.ts               # 파일 스토리지 (유지)
│   │
│   └── types/
│       └── index.ts               # 서버 전용 타입
│
└── package.json
```

---

## 모듈별 책임

### `mcp/tools/index.ts`
```typescript
// 모든 도구 등록
import { tokenTools } from './token';
import { pluginTools } from './plugin';
import { storageTools } from './storage';
import { figmaTools } from './figma';

export const allTools = [
  ...tokenTools,
  ...pluginTools,
  ...storageTools,
  ...figmaTools,
];

export { handleToolCall } from './handlers';
```

### `mcp/tools/definitions.ts`
```typescript
// 도구 스키마 정의만 분리
export const toolDefinitions = {
  sigma_login: {
    name: 'sigma_login',
    description: '...',
    inputSchema: { ... }
  },
  // ...
};
```

### `mcp/tools/token.ts`
```typescript
// 토큰 관련 도구 핸들러
export async function handleSigmaLogin(): Promise<ToolResult>;
export async function handleSigmaLogout(token: string): Promise<ToolResult>;
export async function handleSigmaStatus(token: string): Promise<ToolResult>;
export async function handleSigmaBind(token: string, pluginId: string, pageId: string): Promise<ToolResult>;
```

### `mcp/tools/figma.ts`
```typescript
// Figma 연동 도구 핸들러
export async function handleCreateFrame(token: string, data: ExtractedNode, name?: string): Promise<ToolResult>;
export async function handleImportFile(token: string, id: string): Promise<ToolResult>;
export async function handleGetFrames(token: string): Promise<ToolResult>;
export async function handleDeleteFrame(token: string, nodeId: string): Promise<ToolResult>;
```

### `websocket/handlers/index.ts`
```typescript
// 메시지 라우팅
import { handleRegister } from './register';
import { handleFigmaCommand } from './figma';
import { handleStatusQuery } from './status';

export function routeMessage(ws: WebSocket, message: WSMessage): void {
  switch (message.type) {
    case 'REGISTER':
      return handleRegister(ws, message);
    case 'CREATE_FRAME':
    case 'DELETE_FRAME':
      return handleFigmaCommand(ws, message);
    // ...
  }
}
```

### `websocket/connection.ts`
```typescript
// 연결 관리 분리
export class ConnectionManager {
  register(ws: WebSocket, clientInfo: ClientInfo): void;
  unregister(ws: WebSocket): void;
  getPlugins(): PluginInfo[];
  findPlugin(pluginId: string): WebSocket | null;
}
```

---

## 마이그레이션 단계

### Phase 1: MCP 도구 분리
```bash
mkdir -p src/mcp/tools
```

1. `mcp/tools/definitions.ts` - 스키마 정의 추출
2. `mcp/tools/token.ts` - 토큰 도구 핸들러
3. `mcp/tools/plugin.ts` - 플러그인 도구 핸들러
4. `mcp/tools/storage.ts` - 저장소 도구 핸들러
5. `mcp/tools/figma.ts` - Figma 도구 핸들러
6. `mcp/tools/index.ts` - 통합

### Phase 2: WebSocket 핸들러 분리
```bash
mkdir -p src/websocket/handlers
```

1. `websocket/connection.ts` - ConnectionManager 클래스
2. `websocket/handlers/register.ts`
3. `websocket/handlers/figma.ts`
4. `websocket/handlers/status.ts`
5. `websocket/handlers/index.ts` - 라우터

### Phase 3: 테스트
1. `bun run build`
2. 서버 시작 테스트
3. MCP 도구 호출 테스트
4. Figma Plugin 연결 테스트

---

## 예상 결과

### MCP 관련
| 파일 | 예상 라인 수 |
|------|-------------|
| `mcp/tools/index.ts` | ~50 |
| `mcp/tools/definitions.ts` | ~300 |
| `mcp/tools/token.ts` | ~100 |
| `mcp/tools/plugin.ts` | ~80 |
| `mcp/tools/storage.ts` | ~120 |
| `mcp/tools/figma.ts` | ~180 |
| `mcp/utils.ts` | ~50 |

### WebSocket 관련
| 파일 | 예상 라인 수 |
|------|-------------|
| `websocket/server.ts` | ~150 |
| `websocket/connection.ts` | ~100 |
| `websocket/handlers/index.ts` | ~50 |
| `websocket/handlers/register.ts` | ~80 |
| `websocket/handlers/figma.ts` | ~100 |
| `websocket/handlers/status.ts` | ~60 |

**목표: 모든 파일 200줄 이하**

---

## 추가 개선 사항

### HTTP 라우트 분리 (선택적)

현재 `http/server.ts`가 402줄로 관리 가능하지만,
추후 API가 늘어나면 라우트별로 분리:

```
http/
├── server.ts          # Hono 앱 설정
└── routes/
    ├── health.ts      # /api/health
    ├── extracted.ts   # /api/extracted/*
    └── figma.ts       # /api/figma/*
```

### 타입 정리

서버 전용 타입을 `types/index.ts`로 분리:

```typescript
// types/index.ts
export interface WSMessage { ... }
export interface ClientInfo { ... }
export interface ToolResult { ... }
```
