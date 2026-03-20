# 프로토타이핑, 주석, 페이지 관리

프로토타이핑 인터랙션, 주석(Annotations), 페이지 CRUD를 다루는 모듈입니다.

**소스:**
- `node-ops/prototyping.ts` — 인터랙션/리액션
- `node-ops/annotations.ts` — 주석
- `node-ops/page.ts` — 페이지 관리
- `node-ops/figjam.ts` — FigJam 전용 (스티키, 커넥터)

---

## 프로토타이핑 (prototyping.ts)

Figma의 프로토타이핑 인터랙션(Reactions)을 조회, 추가, 제거합니다.

### 조회

**MCP 도구:** `sigma_get_reactions(token, nodeId?)`

선택 노드 또는 지정 노드의 인터랙션 목록을 반환합니다.

```json
{
  "reactions": [
    {
      "trigger": { "type": "ON_CLICK" },
      "action": {
        "type": "NAVIGATE",
        "destinationId": "1:234",
        "transition": { "type": "DISSOLVE", "duration": 0.3 }
      }
    }
  ]
}
```

### 추가

**MCP 도구:** `sigma_add_reaction(token, nodeId, trigger, action, ...)`

| 인자 | 설명 | 값 |
|------|------|-----|
| `trigger` | 트리거 타입 | `ON_CLICK`, `ON_HOVER`, `ON_PRESS`, `ON_DRAG`, `MOUSE_ENTER`, `MOUSE_LEAVE`, `AFTER_TIMEOUT` |
| `action` | 액션 타입 | `NAVIGATE`, `OVERLAY`, `BACK`, `CLOSE`, `OPEN_URL`, `SCROLL_TO`, `SWAP` |
| `destinationId` | 이동 대상 노드 ID | NAVIGATE, OVERLAY, SCROLL_TO, SWAP 시 필수 |
| `url` | 외부 URL | OPEN_URL 시 필수 |
| `transition` | 트랜지션 설정 | `{ type, duration, easing }` |
| `preserveScrollPosition` | 스크롤 위치 유지 | boolean |

### 제거

**MCP 도구:** `sigma_remove_reactions(token, nodeId, triggerType?)`

- `triggerType` 지정: 해당 트리거의 인터랙션만 제거
- 미지정: 모든 인터랙션 제거

---

## 주석 (annotations.ts)

Figma Dev Mode의 주석(Annotations) 기능을 관리합니다.

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `getAnnotations(nodeId?)` | `sigma_get_annotations` | 주석 목록 조회 |
| `setAnnotation(nodeId, label, labelType?)` | `sigma_set_annotation` | 주석 추가 |
| `setMultipleAnnotations(items)` | `sigma_set_multiple_annotations` | 여러 노드에 주석 일괄 추가 |

### labelType

주석의 카테고리를 지정합니다:

| labelType | 설명 |
|-----------|------|
| (기본) | 일반 주석 |
| 기타 Figma 지원 타입 | Figma Annotation API에 따름 |

### 일괄 추가 예시

```json
{
  "items": [
    { "nodeId": "1:23", "label": "제목 텍스트", "labelType": "TEXT" },
    { "nodeId": "1:45", "label": "메인 CTA 버튼" },
    { "nodeId": "1:67", "label": "아이콘 영역", "labelType": "ICON" }
  ]
}
```

---

## 페이지 관리 (page.ts)

Figma 파일의 페이지를 생성, 이름 변경, 전환, 삭제합니다.

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `createPage(name)` | `sigma_create_page` | 새 페이지 생성 |
| `renamePage(pageId, name)` | `sigma_rename_page` | 페이지 이름 변경 |
| `switchPage(pageId)` | `sigma_switch_page` | 페이지 전환 |
| `deletePage(pageId)` | `sigma_delete_page` | 페이지 삭제 (마지막 페이지 불가) |

### 내부 헬퍼

| 함수 | 용도 |
|------|------|
| `getTargetPage(pageId?)` | pageId로 페이지 찾기, 없으면 현재 페이지 |
| `getAllPages()` | 모든 페이지 목록 `[{ id, name }]` |
| `sendFileInfo()` | 파일명, 페이지 목록, 현재 페이지 정보를 UI에 전송 |
| `getEffectiveFileKey()` | 사용자 설정 또는 자동 감지된 File Key |

### 페이지 전환 시 동작

`switchPage()`은 `figma.currentPage`를 변경합니다. 이때 `currentpagechange` 이벤트가 발생하여 `sendFileInfo()`가 자동 호출되고, UI와 서버에 최신 페이지 정보가 전달됩니다.

---

## FigJam (figjam.ts)

FigJam 파일 전용 노드를 생성합니다.

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `createSticky(options)` | `sigma_create_sticky` | 스티키 노트 생성 |
| `createConnector(startNodeId, endNodeId, options)` | `sigma_create_connector` | 노드 간 연결선 생성 |

> FigJam 파일에서만 사용할 수 있습니다. Figma Design 파일에서 호출하면 에러가 발생합니다.

### 스티키 노트

```json
{
  "text": "메모 내용",
  "x": 100,
  "y": 200,
  "parentId": "section-id"  // 선택: Section에 넣기
}
```

### 커넥터

```json
{
  "startNodeId": "1:23",
  "endNodeId": "1:45",
  "strokeColor": { "r": 0, "g": 0, "b": 0 },
  "strokeWeight": 2
}
```
