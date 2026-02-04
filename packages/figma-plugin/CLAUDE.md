# Figma Plugin 개발 지침

이 문서는 Claude Code 및 AI 에이전트가 Figma Plugin 코드를 수정할 때 반드시 따라야 하는 지침입니다.

## 핵심 제약사항

### 1. ES 버전 호환성 (CRITICAL)

**Figma 플러그인 런타임은 `??` (Nullish Coalescing) 연산자를 인식하지 못합니다.**

esbuild `target: 'es2017'`로 설정해도 `??` 연산자는 자동 변환되지 않습니다.

#### 절대 사용 금지

| 문법 | ES 버전 | 대안 |
|------|---------|------|
| `??` (Nullish Coalescing) | ES2020 | `!== undefined ? a : b` 또는 삼항 연산자 |
| `??=` | ES2021 | 일반 할당문 |

#### 사용 가능

| 문법 | 비고 |
|------|------|
| `?.` (Optional Chaining) | 사용 가능 |
| `||=`, `&&=` | 사용 가능 |

#### 예시

```typescript
// ❌ 금지 (Figma에서 인식 불가)
const value = match[2] ?? match[3] ?? '';

// ✅ 올바른 방법
const value = match[2] !== undefined ? match[2]
            : match[3] !== undefined ? match[3]
            : '';

// ✅ Optional Chaining은 사용 가능
const name = obj?.nested?.property;
```

### 2. Figma API 환경

- `figma` 전역 객체는 Figma 런타임에서만 사용 가능
- TypeScript 타입은 `@figma/plugin-typings`에서 제공
- `DOMParser`, `document` 등 브라우저 API 사용 불가 (sandbox 환경)

### 3. UI vs Code 분리

| 파일 | 실행 환경 | 사용 가능 API |
|------|-----------|---------------|
| `code.ts` | Figma Sandbox | `figma.*`, 제한된 JS |
| `ui.ts` | iframe | 브라우저 API, `fetch`, `WebSocket` |

두 환경 간 통신은 `postMessage`로만 가능:
```typescript
// ui.ts → code.ts
parent.postMessage({ pluginMessage: { type: 'action', data: ... } }, '*');

// code.ts → ui.ts
figma.ui.postMessage({ type: 'response', data: ... });
```

### 4. 빌드 확인

코드 수정 후 반드시 빌드하고 검증:

```bash
# 빌드
bun run build

# 빌드된 파일에서 금지된 문법 확인 (?? 연산자)
grep -E ' \?\? ' dist/code.js && echo "ERROR: 금지된 문법 발견!"
```

## 파일 구조

```
packages/figma-plugin/
├── src/
│   ├── code.ts       # 메인 플러그인 로직
│   ├── ui.ts         # WebSocket 통신, UI 로직
│   ├── ui.html       # UI 템플릿
│   └── manifest.json # 플러그인 메타데이터
├── dist/             # 빌드 출력 (git ignored)
├── build.ts          # esbuild 설정
└── CLAUDE.md         # 이 파일
```

## 체크리스트

코드 수정 시 확인:

- [ ] `??` 연산자 사용하지 않음 (`?.`는 사용 가능)
- [ ] `??=` 연산자 사용하지 않음
- [ ] `code.ts`에서 브라우저 API 사용하지 않음
- [ ] `ui.ts`에서 `figma.*` API 사용하지 않음
- [ ] 빌드 후 에러 없음
- [ ] Figma Desktop에서 테스트 완료
