# 프로토타이핑, 주석, 페이지 관리

프로토타이핑 인터랙션, 주석(Annotations), 페이지 CRUD를 다루는 모듈입니다.

**소스:**
- `node-ops/prototyping.ts` — 인터랙션/리액션
- `node-ops/hyperlink.ts` — 노드 간 상호 이동 링크 (캔버스에서 클릭 가능)
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

**MCP 도구:** `sigma_delete_reactions(token, nodeId, triggerType?)`

- `triggerType` 지정: 해당 트리거의 인터랙션만 제거
- 미지정: 모든 인터랙션 제거

---

## 하이퍼링크 (hyperlink.ts)

**MCP 도구:** `sigma_set_hyperlink(token, links, direction?, slot?, remove?)`

노드 쌍이 서로를 가리키는 하이퍼링크를 건다. reaction 과 목적이 겹쳐 보이지만 **동작하는 자리가 다르다**:

| | reaction | 하이퍼링크 |
|---|---|---|
| 동작 시점 | 프로토타입 재생 모드 | **편집 캔버스에서 바로** |
| 대상 | 클릭 가능한 모든 노드 | TEXT 노드만 |
| 용도 | 화면 전이 데모 | 기획 문서형 이동 (주석 마커 ↔ 범례) |

같은 파일 안이므로 `{ type: 'NODE', value: nodeId }` 링크로 걸며 fileKey 가 필요 없다.

### 대상 텍스트 해석 (`resolveTextNode`)

링크는 TEXT 에만 걸리는데 호출자가 지정하는 건 보통 `anno/marker` 같은 **인스턴스**다. 그래서 인스턴스 안의 어느 텍스트에 걸지를 이 모듈이 정한다. 판정 기준은 이름이 아니라 스펙 등록 시 심어둔 slot pluginData(`SLOT_MARK_KEY = 'sigma-slot'`, `component-spec.ts`) — 이름 규약을 만들지 않기 위함이다.

1. TEXT 노드면 그대로
2. `slot`(기본 `"n"`)이 일치하는 하위 TEXT
3. 하위 TEXT 가 정확히 하나면 그것
4. 그 밖(후보 0개 또는 2개 이상)은 모호하므로 에러 — 사용 가능한 slot 목록을 함께 알린다

3번 폴백 덕분에 anno 전용이 아니라 slot 을 가진 모든 스펙 인스턴스에 쓸 수 있다. 순서에 의존하는 "첫 번째 TEXT" 방식과 달리, 텍스트가 둘인 `anno/legend`(번호 `n` + 설명 `desc`)에서도 번호만 정확히 집는다.

### 배선 규칙

- `direction`: `both`(기본) / `a_to_b` / `b_to_a`. 뷰포트 이동에는 뒤로가기가 없으므로 왕복하려면 양쪽에 다 걸어야 한다.
- 링크는 텍스트 **전체 범위**(0~length)에 건다. 빈 텍스트는 에러.
- 쌍 단위 부분 실패 허용 — 한 쌍이 실패해도 나머지는 진행. 단 **한 쌍 안에서는 양쪽 해석이 모두 성공해야** 걸기 시작한다(반쪽 배선 방지).
- `remove: true` 면 같은 대상에서 링크를 제거한다.

### 검증

`getTextHyperlinks()`(`query.ts`)가 `getStyledTextSegments(['hyperlink'])` 로 range 별 링크를 읽어 `sigma_get_node_info` 의 TEXT 응답에 `hyperlinks` 로 싣는다. `textNode.hyperlink` 단일 속성은 구간마다 다르면 `figma.mixed` 가 되어 쓸 수 없다.

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
