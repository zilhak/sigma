# Figma Plugin 개발 지침

이 문서는 Claude Code 및 AI 에이전트가 Figma Plugin 코드를 수정할 때 반드시 따라야 하는 지침입니다.

## 핵심 제약사항

### 1. ES 버전 호환성

**esbuild 가 문법은 lowering 하지만, 런타임 내장 메서드는 lowering 하지 않는다.**

`build.ts` 는 `target: 'es2017'` 로 빌드한다. 이 설정에서:

| 대상 | 처리 | 근거 |
|------|------|------|
| **문법** (`??`, `?.`, `??=`, `\|\|=`) | esbuild 가 es2017 문법으로 **변환한다** | `code.ts:405` 의 `??` → `dist/code.js` 에서 `(_a = msg.data) != null ? _a : ""`. 빌드 후 `grep -c '??' dist/code.js` = 0 |
| **런타임 내장** (`Object.fromEntries`, `Array.prototype.at`, `String.prototype.replaceAll` 등) | **변환하지 않는다** (polyfill 없음) | esbuild 는 syntax lowering 만 한다 |

따라서 **문법은 자유롭게 써도 되고, 내장 메서드는 조심해야 한다.**

> 과거 이 문서는 "`??` 는 자동 변환되지 않는다"고 적었으나 빌드 산출물 확인 결과 사실이 아니었다.
> 그 전제로 작성된 `??` → `||` 대체(`converter/html-parser.ts:289`)는 `0`/`''`/`false` 를
> 다르게 처리하므로 의미가 같지 않다. 새 코드에서 그런 대체를 하지 말 것.

#### 확인 방법 (사람이 아니라 빌드가 한다)

`build.ts` 가 빌드 직후 `dist/code.js` 를 검사하고, 변환되지 않은 문법이 남아 있으면
빌드를 실패시킨다. 별도로 grep 을 칠 필요가 없다.

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
bun run build
```

빌드 스크립트가 산출물을 자동 검사한다 — 변환되지 않은 문법이 `dist/code.js` 에 남으면
빌드가 실패하고 무엇이 남았는지 출력한다. 수동 grep 은 필요 없다.

### 5. 핫 리로드 (CRITICAL)

**Figma 플러그인은 핫 리로드를 지원한다. `bun run build`로 `dist/`를 갱신하면
별도의 플러그인 재실행 없이 Figma에 새 코드가 자동 반영된다.**

- 코드 수정 → 빌드만 하면 끝. 사용자에게 "플러그인을 다시 실행해 달라"고 요청하지 말 것.
- 빌드 직후 곧바로 Sigma MCP 도구(`sigma_create_frame` 등)로 라이브 검증하면 새 코드 기준으로 동작한다.
- 핫 리로드 시 플러그인이 재연결되며 **`pluginId`가 갱신**된다. 빌드 후 라이브 검증 전
  `sigma_list_plugins`로 새 `pluginId`를 확인해 `sigma_bind`로 **재바인딩**해야 한다
  (이전 토큰은 그대로 쓰되 바인딩만 갱신).
- (주의) 이는 **Figma 플러그인** 한정이다. **Sigma MCP 서버**는 핫 리로드가 아니며,
  재시작도 금지다(루트 `CLAUDE.md`의 "MCP 서버 재시작 금지" 참조).

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

- [ ] `code.ts`에서 브라우저 API 사용하지 않음
- [ ] `ui.ts`에서 `figma.*` API 사용하지 않음
- [ ] `bun run build` 성공 (산출물 문법 검사 포함)
- [ ] Figma Desktop에서 테스트 완료
