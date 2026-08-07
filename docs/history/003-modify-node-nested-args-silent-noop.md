# 003. `sigma_modify_node` 의 중첩 args 오타가 "성공 + 아무 일도 안 함" 으로 통과했다

> 관련 코드: `packages/figma-plugin/src/node-ops/modify.ts` (`AllowedMethod.params`, `executeModifyNode` 3번 가드)
> 테스트: `packages/figma-plugin/__tests__/modify-params-guard.test.ts`
> 2026-08-07 실측 · 2026-08-08 수정

## 증상

```python
mcp.call('sigma_modify_node', {'token': T, 'nodeId': '246:75069',
                               'method': 'move', 'args': {'left': 10}})   # x/y 가 아니라 left
# → 오류 없음. 응답에 error 없음.
mcp.call('sigma_get_node_info', {'token': T, 'nodeId': '246:75069'})
# {'x': 0, 'y': 27780, ...}   ← 안 움직였다
```

`sigma_batch_modify` 는 더 나빴다. 오타 op 가 예외를 안 던지므로 **`succeeded` 에 포함**된다 —
호출자가 할 수 있는 유일한 방어(개수 확인)가 무력화된다. 300건짜리 배치에서
`succeeded == len(ops)` 가 통과하는데 아무것도 안 바뀌어 있을 수 있었다.

## 원인

`8eeaed1` 이 "모르는 인자를 조용히 버림" 부류를 통째로 막았지만, 그 가드
(`tool-handler.ts` `rejectUnknownArgs`)는 **최상위 인자만** 본다. `sigma_modify_node` 의
`inputSchema.properties.args` 는 `{type:'object'}` 라 **그 안에 스키마가 없어** 무엇이든 통과했다.

그리고 메서드마다 엄격도가 구현자 취향으로 갈려 있었다 — `rename`/`setOpacity`/`setVisible` 은
없는 인자에 throw 하지만, `move` 는 `if (x !== undefined)` 로 건너뛰고 `resize` 는 현재 값을
유지한다. **옵셔널 인자 설계 자체는 옳다**(`resize` 는 "높이만 줄이기" 를 위해 일부러 그렇게 됐다).
문제는 **"안 준 것" 과 "틀린 이름으로 준 것" 을 구분하지 않았다**는 점이다. 앞은 정상, 뒤는 사고다.

디스패치에는 이미 ①메서드 존재 ②타입 지원 두 가드가 있었고, 각각 `availableMethods` /
`supportedMethods` 를 함께 돌려준다. ③args 키 검사만 없었다.

## 무엇을 했나

- `AllowedMethod` 에 **`params: string[]` 을 필수 필드**로 넣고 73개 메서드에 채웠다.
- `executeModifyNode` 디스패치 직전에 3번 가드를 넣어, ①② 와 같은 모양으로
  `unknownArgs` + `acceptedArgs` + `methodDescription` 을 돌려준다.
- 가드를 **플러그인 쪽에 둔 이유**: `sigma_modify_node` · `sigma_batch_modify` ·
  서버 내부 호출(`wsServer.modifyNode`)이 전부 `executeModifyNode` 한 곳으로 모인다.
  서버에 두면 배치·내부 경로를 따로 또 막아야 한다.

### `params` 는 손으로 유지하지 않는다

`params` 가 소스와 어긋나는 방향마다 실패 모양이 다르다 — 선언이 모자라면 정상 호출이
요란하게 거부되고(금방 발견), 선언이 남으면 오타가 통과해 **조용히** 깨진다(이 사고 그대로).
그래서 테스트가 `modify.ts` 원본을 읽어 각 메서드가 실제로 읽는 `args.X` 와 대조한다.

⚠️ 그 대조에 **`handler.toString()` 을 쓰면 안 된다.** Bun 트랜스파일러가 연속된
`const a = args.x; const b = args.y;` 를 `const { x, y } = args` 구조분해로 접어서, 읽는 키가
소스에서 사라진 것처럼 보인다(`setRangeHyperlink` 에서 실제로 겪었다 — `url`/`nodeId` 가
증발해 보였다). 원본 `.ts` 를 `readFileSync` 로 읽어야 한다.

## 주의

- `params` 를 채울 때 **설명 문자열이 아니라 핸들러가 실제로 읽는 키**가 정답이다.
  둘이 어긋나면(실측 73개 중 1건이 그렇게 보였다) 대개 설명 쪽이 낡은 것이다.
- 서버 내부 호출이 쓰는 키(`setClipsContent {clips}` — `clipsContent` 가 아니다,
  lint 자동수정의 `resize {width,height}` · `move {x,y}`)는 테스트로 못 박아 뒀다.

## 곁가지 — 이건 sigma 결함이 아니었다

같은 조사에서 "거부 메시지가 뭐가 맞는지 안 알려 준다" 고 적을 뻔했는데 **틀렸다.**
`acceptedArgs` 는 이미 응답에 다 들어 있었고, 못 본 이유는 호출자 스크립트의
`raise RuntimeError(f"{name} 실패: {r['error']}")` 가 `error` 문자열만 남기고 나머지를
버렸기 때문이다. **도구를 유죄로 단정하기 전에 응답 전문을 먼저 볼 것.**
