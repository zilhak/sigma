# 컴포넌트, 변수, 스타일

Figma의 컴포넌트/인스턴스, 디자인 변수, 스타일, Team Library를 관리하는 모듈입니다.

**소스:**
- `node-ops/components.ts` — 컴포넌트/인스턴스
- `node-ops/variables.ts` — 변수/컬렉션
- `node-ops/styles.ts` — 스타일 CRUD
- `node-ops/library.ts` — Team Library

---

## 컴포넌트 (components.ts)

### 조회

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `getLocalComponents()` | `sigma_get_local_components` | 로컬 컴포넌트 목록 (key, name, 크기) |
| `getComponentPropertyDefinitions(nodeId)` | `sigma_get_component_properties` | 컴포넌트 속성 정의 조회 |
| `getInstanceOverrides(nodeId)` | `sigma_get_instance_overrides` | 인스턴스의 오버라이드 속성 |

### 생성

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `createComponent(x, y, w, h, ...)` | `sigma_create_component` | 새 ComponentNode 생성 |
| `createComponentInstance(componentKey, x, y, ...)` | `sigma_create_component_instance` | 컴포넌트 인스턴스 생성 |
| `createComponentSet(componentIds, name?)` | `sigma_create_component_set` | 여러 컴포넌트를 Variants 세트로 결합 |

### 수정

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `setInstanceOverrides(nodeId, overrides)` | `sigma_set_instance_overrides` | 인스턴스 오버라이드 설정 |
| `addComponentProperty(nodeId, name, type, default)` | `sigma_add_component_property` | 컴포넌트 속성 추가 |
| `editComponentProperty(nodeId, name, newValues)` | `sigma_edit_component_property` | 컴포넌트 속성 수정 |
| `deleteComponentProperty(nodeId, name)` | `sigma_delete_component_property` | 컴포넌트 속성 삭제 |

### 변환

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `convertToComponent(nodeId)` | `sigma_convert_to_component` | Frame → Component 변환 |
| `detachInstance(nodeId)` | `sigma_detach_instance` | Instance → Frame 분리 |
| `swapComponent(nodeId, newComponentKey)` | `sigma_swap_component` | 인스턴스의 컴포넌트 교체 |

### 컴포넌트 인스턴스 생성 흐름

```
sigma_create_component_instance(token, componentKey, x, y)
  │
  ▼
1. componentKey로 컴포넌트 찾기
   → 로컬: figma.root.findAll()에서 key 매칭
   → 라이브러리: importComponentByKeyAsync()로 임포트
  │
  ▼
2. component.createInstance()
  │
  ▼
3. 위치 설정 (x, y)
4. parentId 있으면 reparent
```

---

## 변수 (variables.ts)

Figma의 디자인 변수(Design Variables)를 관리합니다.

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `createVariableCollection(name)` | `sigma_create_variable_collection` | 변수 컬렉션 생성 |
| `createVariable(name, collectionId, resolvedType)` | `sigma_create_variable` | 변수 생성 |
| `getVariables(type?)` | `sigma_get_variables` | 로컬 변수/컬렉션 조회 |
| `setVariableValue(variableId, modeId, value)` | `sigma_set_variable_value` | 모드별 값 설정 |
| `bindVariable(nodeId, field, variableId)` | `sigma_bind_variable` | 노드 속성에 변수 바인딩 |
| `addVariableMode(collectionId, name)` | `sigma_add_variable_mode` | 컬렉션에 모드 추가 (Light/Dark 등) |
| `setVariableScopes(variableId, scopes)` | `sigma_set_variable_scopes` | 변수 사용 범위 설정 |
| `setVariableAlias(variableId, modeId, aliasTargetId)` | `sigma_set_variable_alias` | 변수 alias 설정 |
| `setVariableCodeSyntax(variableId, platform, syntax)` | `sigma_set_variable_code_syntax` | 변수 코드 구문 설정 |

### resolvedType

| 타입 | 설명 | 값 예시 |
|------|------|---------|
| `COLOR` | RGBA 색상 | `{ r: 0.2, g: 0.4, b: 0.8, a: 1 }` |
| `FLOAT` | 숫자 | `16`, `1.5` |
| `STRING` | 문자열 | `"Hello"` |
| `BOOLEAN` | 불리언 | `true`, `false` |

### 변수 바인딩 예시

```
// 1. 컬렉션 생성
sigma_create_variable_collection(token, "Colors")
  → collectionId

// 2. 변수 생성
sigma_create_variable(token, "primary", collectionId, "COLOR")
  → variableId

// 3. 모드별 값 설정
sigma_set_variable_value(token, variableId, modeId, { r: 0.2, g: 0.4, b: 0.8, a: 1 })

// 4. 노드에 바인딩
sigma_bind_variable(token, nodeId, "fills/0/color", variableId)
```

---

## 스타일 (styles.ts)

Figma 로컬 스타일을 생성, 적용, 삭제합니다.

### 생성

| 함수 | MCP 도구 | 생성 타입 |
|------|----------|-----------|
| `createPaintStyle(name, paints, description?)` | `sigma_create_paint_style` | PaintStyle (색상/그라데이션) |
| `createTextStyle(name, options)` | `sigma_create_text_style` | TextStyle (폰트/크기/높이) |
| `createEffectStyle(name, effects, description?)` | `sigma_create_effect_style` | EffectStyle (그림자/블러) |
| `createGridStyle(name, grids, description?)` | `sigma_create_grid_style` | GridStyle (그리드 레이아웃) |

### 적용/삭제

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `applyStyle(nodeId, styleType, styleId)` | `sigma_apply_style` | 노드에 스타일 적용 |
| `deleteStyle(styleId)` | `sigma_delete_style` | 스타일 삭제 |

`styleType`: `PAINT`, `TEXT`, `EFFECT`, `GRID`

---

## Team Library (library.ts)

Team Library의 컴포넌트, 변수, 스타일을 조회하고 임포트합니다.

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `getAvailableLibraries()` | `sigma_list_libraries` | 사용 가능한 Team Library 목록 |
| `getLibraryComponents(libraryKey)` | `sigma_list_library_components` | 라이브러리 컴포넌트 목록 |
| `getLibraryVariables(collectionKey)` | `sigma_list_library_variables` | 라이브러리 변수 컬렉션 |
| `importLibraryComponent(key)` | `sigma_import_library_component` | 라이브러리 컴포넌트 임포트 |
| `importLibraryStyle(key)` | `sigma_import_library_style` | 라이브러리 스타일 임포트 |

### Library 사용 흐름

```
// 1. 사용 가능한 라이브러리 확인
sigma_list_libraries(token)
  → [{ name: "Design System", key: "lib-abc", ... }]

// 2. 라이브러리 컴포넌트 조회
sigma_list_library_components(token, "lib-abc")
  → [{ name: "Button", key: "comp-123", ... }]

// 3. 컴포넌트 임포트
sigma_import_library_component(token, "comp-123")
  → 로컬에서 사용 가능

// 4. 인스턴스 생성
sigma_create_component_instance(token, "comp-123", 100, 100)
```

> Plugin manifest에 `"teamlibrary"` 권한이 필요합니다.
