# 컴포넌트 스펙 등록 정책 (`componentSpec.warn`)

config의 `builtins`/`custom`이 **문서에 놓인 노드**를 검사한다면, `componentSpec`은
**`sigma_create_component_spec` 호출 자체**를 검사한다(등록·`overwrite` 갱신 양쪽).

```jsonc
{ "componentSpec": { "warn": [
    { "aliasPattern": "^table$", "message": "테이블은 wire/table 프리셋을 쓰세요" },
    { "aliasPattern": "^btn_",  "message": "버튼은 ui_button 권장", "namespace": "design" },
    // 이름으로는 못 잡는 규약 — 아이콘 창작은 대부분 "다른 컴포넌트 HTML 안에 묻힌 inline <svg>" 로 들어온다
    { "htmlPattern": "<svg", "unlessDescription": "출처",
      "message": "아이콘을 새로 그리지 말고 등록된 세트에서 가져오세요 — 부득이하면 description 에 출처를 적으세요" }
] } }
```

## 판정 입력 4개

| 필드 | 역할 |
|---|---|
| `aliasPattern` | alias에 거는 정규식 |
| `htmlPattern` | **스펙 HTML 내용**에 거는 정규식 |
| `unlessDescription` | description이 이 정규식에 걸리면 **면제** |
| `namespace` | 이 namespace에서만 적용 (생략 시 전체) |

- `aliasPattern`과 `htmlPattern`을 함께 주면 **AND**(둘 다 걸려야 경고).
- 규칙 하나에는 **둘 중 최소 하나가 필요**하다. 조건이 없으면 전 스펙에 매칭돼 경고가
  무의미해지므로 config 검증 단계에서 거부된다.
- `message`는 필수다.

## 동작

- **문서(document)에 저장된 config만** 참조한다(= 그 Figma 파일의 등록 정책). 페이지 저장 config는 보지 않는다.
- 매칭되면 등록 응답에 `policyWarnings`가 실린다 — **경고만, 거부하지 않는다.**
- 검사 시점·대상이 lint 규칙과 다르지만(호출 인자 vs 문서 상태), "파일별 규약"이라는 성격이 같아
  저장소를 나누지 않고 같은 config에 둔다.
- 잘못된 정규식은 조용히 무시하지 않고 "패턴이 잘못돼 건너뛰었다"는 경고를 대신 낸다
  (안 도는 정책이 통과처럼 보이는 걸 막는다).

## 한계

상세·한계(도구 경로만 덮음 / 레지스트리는 서버 전역이라 우회 가능)는
[../component-spec.md](../component-spec.md) §파일별 등록 정책 참조.

구현: `packages/shared/src/component-spec/policy.ts` · 검증은 `packages/server/src/lint/load-config.ts`
