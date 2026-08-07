# 복붙용 config 세트

## 기본 예제

```jsonc
{
  "builtins": {
    "section_gap": { "gap": 60 },
    "default_name": { "enabled": false }
  },
  "custom": [
    {
      "id": "card-radius-12",
      "select": { "type": "FRAME", "namePattern": "Card" },
      "check": { "op": "equals", "field": "cornerRadius", "value": 12 }
    },
    {
      "id": "modal-needs-overlay-sibling",
      "kind": "predicate",
      "code": "export default function(node, ctx) {\n  if (node.type !== 'FRAME' || !node.name.startsWith('Modal/')) return null;\n  if (!ctx.getSiblings(node.id).some((s) => s.name === 'Overlay')) {\n    return { message: `\"${node.name}\" 옆에 'Overlay' 형제가 없음` };\n  }\n  return null;\n}"
    }
  ]
}
```

## 찾기 쉬움 세트 (기획/디자인 페이지)

[`content_spread`](rules/content-spread.md)와 [`origin_anchor`](rules/origin-anchor.md)는
**같이 켜야 의미가 있다** — 이유는 각 룰 문서 참조.

```jsonc
sigma_lint({ token, config: { builtins: {
  content_spread: { enabled: true, maxGap: 3000 },
  origin_anchor:  { enabled: true, tolerance: 100 }
} } })
```

## 기획 페이지 세트

[기획 레이어](annotation-layer.md)를 쓰는 페이지에 per-page config로 저장한다.

```jsonc
sigma_set_page_data({ token, key: "lint", value: JSON.stringify({ builtins: {
  annotation_layer:       { enabled: true },
  annotation_marker_pair: { enabled: true },
  annotation_marker_gap:  { enabled: true }
} }) })
sigma_lint({ token, configMode: "per-page" })
```

## placeholder/lorem 텍스트 잔존 (추천 커스텀 규칙)

빌트인화하지 않고 커스텀 규칙만으로 바로 쓸 수 있는, 우선순위가 높은 예시. AI Agent가 생성한 문서에
"Lorem ipsum...", "placeholder", "TODO:" 같은 임시 텍스트가 그대로 남는 경우를 잡는다. 코드 변경이
전혀 필요 없다 — 아래 항목을 `config.custom`에 추가하기만 하면 된다.

```jsonc
{
  "id": "placeholder-text-leftover",
  "select": { "type": "TEXT" },
  "check": { "op": "regex", "field": "characters", "pattern": "Lorem ipsum|placeholder text|TODO:|dummy text" },
  "message": "\"{name}\" 에 placeholder/lorem 텍스트가 남아있음: {actual}"
}
```

`regex` op은 플래그를 지원하지 않아(대소문자 구분) 실제 사용하는 표기 그대로 패턴에 나열해야 한다
(필요하면 `[Ll]orem` 같은 문자 클래스로 대소문자 변형을 직접 명시).

## 폰트 일관성 (파일 전체 점검)

[`font_not_default`](rules/font-not-default.md)는 문서 `fonts.default`가 설정돼 있어야 동작한다.

```jsonc
sigma_set_page_data({ token, pageId: "document", key: "fonts", value: '{"default":"Pretendard"}' })
sigma_lint({ token, scope: "file", config: { builtins: { font_not_default: { enabled: true } } },
             configMode: "uniform" })
```
