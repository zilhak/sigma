# 노드 단위 억제 (inline suppress · `lint-ignore`)

페이지/파일 config가 "어떤 룰을 켜는가"라면, 노드 단위 억제는 "이 노드에서만 이 룰을 봐준다"이다 —
ESLint의 `// eslint-disable-next-line`, mypy의 `# type: ignore`에 해당한다. 억제 의도가 **노드에 붙어**
있어 이름을 오염시키지 않고, 리네임에 견디며, 새 예외를 만든 자리에서 국소적으로 표시된다.

- 저장 위치: 그 노드의 sharedPluginData("sigma", **"lint-ignore"**) — `sigma_set_node_data`로 세팅.
- 값 형태(JSON):
  - `true` → 이 노드의 **모든** 룰 억제
  - `["raw_node"]` → 지정 룰만
  - `{"rules":["raw_node"],"reason":"primitive"}` → 지정 룰 + **의도(reason)** 기록 (primitive/stub 등)
- 동작: `sigma_lint`는 룰을 다 돌린 뒤 **위반이 난 노드만** "lint-ignore"를 배치 조회해 억제된 위반을
  걸러낸다(eslint-disable와 동일. 위반 없는 노드는 조회 안 하므로 왕복 비용 최소). page/file 스코프 모두 적용.
- 응답/리포트에 `suppressed`(억제 건수)가 표기된다.

**page-config vs node-suppress는 상호보완**: 페이지 통짜로 성격이 같으면 page config
(`raw_node.enabled=false`)가 싸고, 한 페이지에 정당 raw와 진짜 위반이 섞이면 node-suppress로 정밀 면제한다.

```jsonc
// 이 스와치는 토큰 프리미티브라 raw_node 영구 면제
sigma_set_node_data({ token, nodeId:"1:23", key:"lint-ignore", value:'{"rules":["raw_node"],"reason":"primitive"}' })
// 이 회색 박스는 임시 플레이스홀더라 전면 면제
sigma_set_node_data({ token, nodeId:"1:24", key:"lint-ignore", value:'{"rules":"all","reason":"stub"}' })
// 해제
sigma_delete_node_data({ token, nodeId:"1:23", key:"lint-ignore" })
```

구현: `packages/server/src/lint/suppress.ts`
