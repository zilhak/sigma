# 001. 미등록 alias 오류가 스펙 카탈로그 1427개를 통째로 뱉었다

> 관련 코드: `packages/server/src/mcp/spec-resolve.ts` (`suggest()`)
> 2026-08-07 실측 · 2026-08-08 수정

## 증상

`sigma_create_component_spec_instance` 등에 **오타 난 alias** 를 하나 넘기면, 오류 응답이
등록된 스펙을 **전부** 나열했다.

```jsonc
{ "error": "등록되지 않은 alias: \"tabel_cell\"",
  "available": ["oneui/table_cell", "oneui/button", /* … 1400여 개 계속 … */] }
```

실측: `~/.sigma/component-specs/` 의 스펙 파일 **1427개**. 오타 한 번에 그 목록 전체가
응답으로 나갔다. `namespace` 를 준 경우도 같은 구조(`availableInNamespace`)였다.

## 원인

`resolveSpec()` 이 미스 시 `listComponentSpecs()` 결과를 가공 없이 실었다. 레지스트리가
**서버 전역**(파일을 가로지름)이라 다른 Figma 파일에서 등록한 스펙까지 전부 포함된다 —
스펙이 쌓일수록 응답이 선형으로 커지는데, 상한이 없었다.

## 무엇을 했나

전량 나열을 없애고 **오타 후보 몇 개 + 개수 + 조회 힌트**로 바꿨다.

- `suggest()` — 완전포함 > 접두 공유 길이로 점수를 매겨 상위 8개. 라이브러리 없이 충분하다.
- `registeredTotal` / `registeredInNamespace` 로 규모만 알려준다.
- 전체가 정말 필요하면 `sigma_list_component_specs` 를 쓰라고 안내한다.

## 되돌리면 안 되는 이유

"목록을 다 줘야 호출자가 고를 수 있다"는 직관은 여기서 틀린다. **아무도 1427줄을 읽지 않는다** —
사람도, 모델도. 필요한 건 "혹시 이건가" 몇 개다. 그리고 이 목록은 남의 파일 스펙까지 포함하므로
길이만 늘리고 정답률은 올리지 않는다. 카탈로그 전량 조회는 그 일을 하는 전용 도구가 이미 있다.
