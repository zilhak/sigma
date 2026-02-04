# Sigma Figma Plugin

Sigma 서버와 연동하여 웹 컴포넌트를 Figma 프레임으로 변환하는 플러그인입니다.

## 기능

- **JSON → Figma**: ExtractedNode JSON 데이터를 Figma 프레임으로 변환
- **HTML → Figma**: HTML 문자열을 파싱하여 Figma 프레임으로 변환
- **서버 연동**: WebSocket을 통해 Sigma 서버와 실시간 통신
- **SVG 지원**: SVG 요소를 Figma 벡터로 변환

## 설치

1. Figma Desktop App 실행 (Web 버전 미지원)
2. Plugins → Development → Import plugin from manifest
3. `dist/manifest.json` 선택

## 빌드

```bash
# 빌드
bun run build

# 개발 모드 (watch)
bun run dev
```

## 주의사항

### ES 버전 호환성

**Figma 플러그인 런타임은 최신 JavaScript 문법을 완전히 지원하지 않습니다.**

지원되지 않는 문법:
- `??` (Nullish Coalescing Operator) - ES2020
- `?.` (Optional Chaining) - ES2020
- `#private` fields - ES2022

대안:
```typescript
// ❌ 사용 금지
const value = a ?? b;

// ✅ 대신 사용
const value = a !== undefined ? a : b;
```

빌드 시 `target: 'es2017'`로 설정되어 있지만, 일부 문법은 수동으로 변환해야 합니다.

### Desktop App 전용

Figma Web 버전은 브라우저 샌드박스 환경에서 `localhost` 접근이 불가능하므로 지원하지 않습니다.
Desktop App의 Electron 환경에서만 localhost WebSocket/HTTP 연결이 가능합니다.

## 구조

```
src/
├── code.ts       # 메인 플러그인 코드 (Figma sandbox에서 실행)
├── ui.ts         # UI 코드 (iframe에서 실행)
├── ui.html       # UI HTML 템플릿
└── manifest.json # 플러그인 매니페스트
```
