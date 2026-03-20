# 스크린샷 기능

Figma 노드를 이미지로 캡처하여 파일로 저장하는 기능입니다. AI Agent가 시각적 결과를 확인하는 데 사용합니다.

**MCP 도구:** `sigma_screenshot`
**관련 소스:**
- Plugin: `node-ops/export.ts` — `exportImage()` (Figma `exportAsync()` 호출)
- Server: `mcp/handlers/figma.ts` — `sigma_screenshot` 핸들러
- Server: `image/process.ts` — 이미지 후처리 파이프라인 (sharp)

---

## 전체 파이프라인

```
sigma_screenshot(token, nodeId, format, scale, mode, ...)
  │
  ▼
1. Plugin에서 exportAsync() 실행
   → base64 이미지 반환 (WebSocket 경유)
  │
  ▼
2. Server에서 이미지 후처리 (sharp)
   Crop → Mode별 처리 → 파일 저장
  │
  ▼
3. 파일 경로 + 메타데이터 반환
```

---

## 1단계: Plugin Export (node-ops/export.ts)

```typescript
exportImage(nodeId, format?, scale?)
```

- `figma.getNodeById(nodeId)` → `SceneNode`
- `DOCUMENT`, `PAGE` 타입은 export 불가
- 지원 포맷: `PNG`, `JPG`, `SVG`, `PDF`
- 기본 scale: 2 (retina)
- `exportAsync(settings)` → `Uint8Array` → `figma.base64Encode()` → base64 문자열
- 반환: `{ base64, format, nodeId, nodeName, width, height }`

---

## 2단계: 이미지 후처리 (image/process.ts)

Server에서 sharp 라이브러리로 이미지를 처리합니다.

### 처리 모드 (ScreenshotMode)

| 모드 | 설명 | 용도 |
|------|------|------|
| `auto` | 토큰 예산(22,000) 내로 자동 축소 | **기본값**. 대부분의 경우 |
| `thumbnail` | Plugin scale 절반 + 자동 축소 | 빠른 전체 파악 |
| `tile` | 축소 없이 그리드 분할 | 원본 화질이 필요할 때 |
| `manual` | 명시적 비율/크기 지정 | `"70%"`, `"800px"` |
| `none` | 아무 처리 안 함 | crop 영역 원본 그대로 |

### 파이프라인 상세

```
1. Crop (선택, mode와 독립적으로 항상 먼저 적용)
   → { x, y, width, height } 영역 잘라내기
   → 범위 초과 시 에러

2. Mode별 처리
   ├── auto/thumbnail: 자동 축소 루프
   │   → 토큰 = (width × height) / 30
   │   → 토큰 > 22,000이면 0.7배로 반복 축소
   │   → 최소 200px까지 (MIN_DIMENSION)
   │   → thumbnail은 추가로 50% 사전 축소
   │
   ├── manual: 명시적 리사이즈
   │   → "70%" → width/height × 0.7
   │   → "800px" → 긴 변을 800px로 맞춤 (비율 유지)
   │
   ├── tile: 그리드 분할
   │   → 타일 크기 자동 계산: sqrt(20,000 × 30) ≈ 775px
   │   → rows × cols 그리드로 분할
   │   → 각 타일을 개별 파일로 저장
   │
   └── none: 패스스루

3. 파일 저장
   → ~/.sigma/screenshots/{safeName}-{timestamp}.{ext}
   → 타일 모드: {baseName}_r{row}_c{col}.{ext}
```

### 토큰 추정 공식

```
토큰 ≈ (width × height) / 30
```

- 실측 비율 ~34.3, 안전 마진 적용하여 30 사용
- `auto` 예산: 22,000 토큰 → 약 660,000px² → 약 812×812px
- `tile` 예산: 20,000 토큰/타일

### 자동 축소 루프 (auto/thumbnail)

```
while (estimateTokens(w, h) > 22,000) {
  w = w × 0.7
  h = h × 0.7
  if (w < 200 || h < 200) break
}
```

매 반복마다 면적이 약 절반(0.49)으로 줄어듭니다. 대부분 1~3회 반복으로 수렴합니다.

---

## 반환 구조

### 단일 이미지 (auto/thumbnail/manual/none)

```json
{
  "success": true,
  "filePath": "~/.sigma/screenshots/button-1711234567890.png",
  "filename": "button-1711234567890.png",
  "nodeId": "1:23",
  "nodeName": "Button",
  "format": "PNG",
  "mode": "auto",
  "original": { "width": 1600, "height": 900 },
  "cropped": { "width": 800, "height": 450 },  // crop 사용 시만
  "final": { "width": 560, "height": 315 },
  "resizeApplied": true,
  "resizeScale": 0.35,
  "resizeIterations": 2,
  "estimatedTokens": 5880,
  "withinTokenLimit": true
}
```

### 타일 이미지 (tile)

```json
{
  "success": true,
  "nodeId": "1:23",
  "nodeName": "FullPage",
  "format": "PNG",
  "mode": "tile",
  "original": { "width": 3200, "height": 1800 },
  "final": { "width": 3200, "height": 1800 },
  "resizeApplied": false,
  "resizeScale": 1,
  "tileSize": { "width": 775, "height": 775 },
  "grid": { "rows": 3, "cols": 5 },
  "tiles": [
    { "filePath": "..._r0_c0.png", "row": 0, "col": 0, "width": 775, "height": 775, "estimatedTokens": 20008 },
    { "filePath": "..._r0_c1.png", "row": 0, "col": 1, "width": 775, "height": 775, "estimatedTokens": 20008 },
    ...
  ],
  "totalTiles": 15
}
```

---

## SVG/PDF 특수 처리

SVG와 PDF는 sharp로 처리할 수 없으므로 이미지 파이프라인을 **바이패스**합니다:

1. Plugin에서 `exportAsync({ format: 'SVG' })` → base64
2. Server에서 base64를 그대로 파일로 저장
3. crop, 축소, 타일링 모두 미적용
4. `estimatedTokens: 0`, `withinTokenLimit: true`

---

## thumbnail 모드 최적화

thumbnail 모드는 전송량을 줄이기 위해 **두 단계 축소**를 사용합니다:

1. **Plugin 측:** `exportAsync` scale을 `userScale × 0.5`로 설정 → WebSocket 전송량 75% 감소
2. **Server 측:** 일반 auto 축소 루프 적용 (이미 작은 이미지이므로 빠르게 수렴)

```
예: 1600×900 노드, userScale=2
  Plugin export: scale=1 (2×0.5) → 1600×900 base64 (∼2MB)
  vs 일반: scale=2 → 3200×1800 base64 (∼8MB)
```

---

## 파일 저장 경로

```
~/.sigma/screenshots/
├── button-1711234567890.png          # 단일 이미지
├── full-page-1711234567890_r0_c0.png # 타일 (row 0, col 0)
├── full-page-1711234567890_r0_c1.png # 타일 (row 0, col 1)
└── ...
```

- 파일명 안전 문자 변환: `[^a-zA-Z0-9가-힣._-]` → `-`
- 기본 TTL: 7일 (storage 자동 정리)
- Docker 환경: `SIGMA_HOST_DATA_DIR`로 컨테이너→호스트 경로 변환
