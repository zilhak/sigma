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

이 경계는 **타입으로 강제된다.** 어겨도 빌드는 통과하고 런타임에서 죽기 때문에,
사람 체크리스트가 아니라 tsconfig 로 막는다.

| 설정 파일 | 대상 | 뺀 것 |
|---|---|---|
| `tsconfig.sandbox.json` | `code.ts`, `converter/`, `extractor/`, `node-ops/`, `testing/`, `utils.ts` | `lib` 에서 `DOM` — `document`/`DOMParser` 사용 시 컴파일 에러 |
| `tsconfig.ui.json` | `ui.ts`, `ui/` | `types` 에서 `@figma/plugin-typings` — `figma.*` 사용 시 컴파일 에러 |

`bun run typecheck` 가 둘 다 검사한다. `console`·`fetch`·타이머는 `@figma/plugin-typings` 가
직접 선언하므로 `DOM` 없이도 sandbox 쪽에서 그대로 쓸 수 있다.

**새 파일을 추가할 때는 두 `include` 중 정확히 한 곳에 들어가야 한다.**
어느 쪽에도 없으면 타입체크에서 통째로 빠지므로, 새 디렉토리를 만들면 `include` 도 함께 늘린다.
(현재 `src/**/*.ts` 45개 = sandbox 39 + ui 6.)

> **`@sigma/shared` 유입 주의**: `converter/html-parser.ts`·`converter/styles.ts` 가
> `parseColor` 를 값으로 import 하므로 shared 의 기본 배럴이 sandbox 타입 프로그램에 딸려 온다.
> 지금 들어오는 파일들은 DOM 을 쓰지 않아 문제가 없다. 나중에 `shared/src/index.ts` 가
> DOM 의존 모듈(`extractor/` 등)을 re-export 하면 여기서 DOM 에러가 난다 — **그건 올바른 실패다.**
> `lib` 에 `DOM` 을 되돌리지 말고 re-export 를 되돌릴 것.

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

번들 경계 = 디렉토리 경계다. 두 트리는 서로를 참조하지 않는다.

```
packages/figma-plugin/
├── src/
│   │                     ── ▼ dist/code.js (Figma Sandbox) ─ tsconfig.sandbox.json
│   ├── code.ts           # 메시지 핸들러 (명령 → node-ops 위임)
│   ├── converter/        # JSON/HTML → Figma 노드
│   ├── extractor/        # Figma 노드 → JSON/HTML (역추출)
│   ├── node-ops/         # Figma 노드 조작
│   ├── testing/          # 라운드트립 테스트
│   ├── utils.ts          # createSolidPaint 등
│   │
│   │                     ── ▼ dist/ui.html (iframe) ─ tsconfig.ui.json
│   ├── ui.ts             # WebSocket 통신, UI 진입점
│   ├── ui/               # 브리지·상태·청크 핸들러
│   ├── ui.html           # UI 템플릿 (빌드 시 ui.js 인라인)
│   │
│   └── manifest.json     # 플러그인 메타데이터
├── __tests__/            # 유닛테스트 (figma 전역 없이 도는 것만)
├── dist/                 # 빌드 출력 (git ignored)
├── build.ts              # esbuild 설정 + 산출물 문법 검사
├── tsconfig.sandbox.json # sandbox 트리 (DOM 없음)
├── tsconfig.ui.json      # iframe 트리 (figma 타이핑 없음)
└── CLAUDE.md             # 이 파일
```

## 체크리스트

코드 수정 시 확인:

- [ ] 새 파일이 `tsconfig.sandbox.json` 또는 `tsconfig.ui.json` 의 `include` 에 들어갔음
- [ ] `bun run typecheck` 통과 (런타임 경계 위반은 여기서 잡힌다)
- [ ] `bun run build` 성공 (산출물 문법 검사 포함)
- [ ] Figma Desktop에서 테스트 완료
