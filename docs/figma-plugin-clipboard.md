# Figma Plugin iframe 클립보드 제약

## 요약

Figma 플러그인 UI는 **샌드박스 iframe**에서 실행되며, 브라우저 Clipboard API (`navigator.clipboard`) 권한이 차단된다.

## 핵심 규칙

### 1. `navigator.clipboard.writeText()` 사용 금지

```typescript
// ❌ Figma iframe에서 조용히 실패 (reject된 Promise가 무시됨)
navigator.clipboard.writeText(text).then(() => {
  showFeedback();
});
```

### 2. `document.execCommand('copy')` 동기 호출 필수

```typescript
// ✅ 클릭 핸들러 안에서 동기적으로 실행
button.addEventListener('click', () => {
  const ta = document.getElementById('textarea') as HTMLTextAreaElement;
  const prevValue = ta.value;
  ta.value = textToCopy;
  ta.select();
  document.execCommand('copy');
  ta.value = prevValue;
  showFeedback();
});
```

### 3. 반드시 사용자 제스처 컨텍스트 내에서 동기 호출

```typescript
// ❌ Promise .catch() 안에서 execCommand → 사용자 제스처 컨텍스트 벗어남
navigator.clipboard.writeText(text).catch(() => {
  document.execCommand('copy'); // 클릭 이벤트 이미 종료된 시점 → 브라우저가 차단
});

// ✅ 클릭 핸들러에서 직접 동기 호출
button.addEventListener('click', () => {
  document.execCommand('copy'); // 클릭 이벤트 내 동기 실행 → 허용
});
```

## 왜 Promise.catch() 폴백이 안 되는가

1. `clipboard.writeText()`가 즉시 reject된 Promise 반환
2. 클릭 이벤트 핸들러는 동기 코드 실행 후 종료
3. `.catch()` 콜백은 **마이크로태스크 큐**에서 비동기 실행
4. 이 시점에 사용자 제스처(클릭) 컨텍스트가 이미 소멸
5. `execCommand('copy')`는 사용자 제스처 없이 호출되어 브라우저가 차단

## 클립보드 읽기 (`readText`)

`navigator.clipboard.readText()`도 동일하게 차단된다. Figma iframe에서 클립보드 내용을 읽는 방법은 없다.

## 참고

- 이 제약은 Figma 플러그인 UI (`ui.ts`, `ui.html`) 에만 해당
- `code.ts` (Figma Sandbox)는 브라우저 API 자체에 접근 불가
- `execCommand('copy')`는 deprecated이지만, Figma iframe에서 유일하게 동작하는 방법
