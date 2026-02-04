# Shared 패키지 구조화 계획

## 현재 구조 분석

### 파일별 라인 수
| 파일 | 라인 수 | 상태 |
|------|---------|------|
| `types.ts` | 158 | 적정 |
| `colors.ts` | 105 | 적정 |
| `constants.ts` | 42 | 적정 |
| `index.ts` | 29 | 적정 |

**총 334줄** - 현재 구조가 적절함

---

## 현재 구조 (유지)

```
packages/shared/
├── src/
│   ├── index.ts        # 모든 export 집약
│   ├── types.ts        # 공통 타입 정의
│   ├── colors.ts       # 색상 파싱 유틸리티
│   └── constants.ts    # 상수 정의
└── package.json
```

---

## 향후 확장 시 제안 구조

Shared 패키지가 커질 경우를 대비한 확장 구조:

```
packages/shared/
├── src/
│   ├── index.ts              # 공개 API export
│   │
│   ├── types/                # 타입 분리
│   │   ├── index.ts          # 타입 re-export
│   │   ├── extracted.ts      # ExtractedNode 관련
│   │   ├── styles.ts         # ComputedStyles 관련
│   │   └── messages.ts       # 통신 메시지 타입
│   │
│   ├── utils/                # 유틸리티 분리
│   │   ├── index.ts
│   │   ├── colors.ts         # 색상 파싱
│   │   ├── css.ts            # CSS 관련 유틸
│   │   └── validation.ts     # 데이터 검증
│   │
│   └── constants/            # 상수 분리
│       ├── index.ts
│       ├── ports.ts          # 포트 번호
│       └── defaults.ts       # 기본값
│
└── package.json
```

---

## 현재 types.ts 분석

```typescript
// 잘 구조화된 타입들
export interface ExtractedNode { ... }     // 추출된 노드
export interface ComputedStyles { ... }    // 계산된 스타일
export interface RGBA { ... }              // 색상
```

### 타입 분리 기준 (향후)

| 현재 위치 | 분리 후 위치 | 내용 |
|-----------|-------------|------|
| `types.ts` | `types/extracted.ts` | ExtractedNode, NodeAttributes |
| `types.ts` | `types/styles.ts` | ComputedStyles, RGBA |
| (신규) | `types/messages.ts` | WebSocket/MCP 메시지 타입 |

---

## 현재 개선 필요 없음

Shared 패키지는 현재 규모에서 적절히 구조화되어 있음.

**분리가 필요한 시점:**
- `types.ts`가 300줄 초과 시
- 새로운 유틸리티 카테고리 추가 시
- 패키지 간 순환 의존성 발생 시

---

## 다른 패키지에서 사용 방법

```typescript
// 타입 import
import type { ExtractedNode, ComputedStyles, RGBA } from '@anthropic-sigma/shared';

// 유틸리티 import
import { parseColor, rgbToHex } from '@anthropic-sigma/shared';

// 상수 import
import { HTTP_PORT, WS_PORT, SERVER_URL } from '@anthropic-sigma/shared';
```

---

## 타입 일관성 권장사항

### 1. ExtractedNode 확장 시

모든 패키지에서 동일한 타입을 사용해야 함:

```typescript
// ✅ 올바른 방법: shared에서 import
import type { ExtractedNode } from '@anthropic-sigma/shared';

// ❌ 잘못된 방법: 각 패키지에서 별도 정의
interface ExtractedNode { ... } // 중복!
```

### 2. 새 필드 추가 시

1. `packages/shared/src/types.ts` 수정
2. 모든 패키지에서 빌드 확인
3. 필요한 패키지에서 새 필드 처리 로직 추가

### 3. 메시지 타입 추가 권장

현재 WebSocket/MCP 메시지 타입이 각 패키지에 흩어져 있음.
향후 `types/messages.ts`로 통합 권장:

```typescript
// types/messages.ts
export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface PluginMessage {
  type: 'create-from-json' | 'create-from-html' | ...;
  data?: ExtractedNode;
  name?: string;
}

export interface MCPToolResult {
  success: boolean;
  message?: string;
  data?: unknown;
}
```
