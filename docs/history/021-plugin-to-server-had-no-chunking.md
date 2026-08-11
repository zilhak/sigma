# 021. 플러그인 → 서버 방향에 청킹이 없어서, 큰 응답이 **소켓을 끊었다**

> 관련 코드: `packages/figma-plugin/src/ui/bridge-plugin.ts` (`RESPONSE_CHUNK_SIZE`, `sendToServer`),
> `packages/figma-plugin/src/ui/constants.ts` (`RESPONSE_CHUNK_MSG`),
> `packages/server/src/websocket/server.ts` (`handleResponseChunk`, `failPending`, `RESPONSE_ASSEMBLY_LIMIT`)
> 테스트: `packages/server/__tests__/response-chunking.test.ts`
> 2026-08-11 실측 · 같은 날 수정

## 증상

플러그인이 **2~3분마다** 끊기고 새 pluginId 로 재연결했다. 플러그인 UI 로그에는 이것뿐이다.

```
서버 연결이 끊어졌습니다 / WebSocket 연결 시도... / 서버에 연결되었습니다
플러그인 ID 할당됨: figma-msocwdfi-bd12
```

pluginId 가 바뀌면 **모든 에이전트의 바인딩이 통째로 무효**가 된다([012](012-nodes-info-asked-for-a-whole-page-and-killed-the-plugin.md)·[015](015-big-page-lint-killed-the-plugin.md) 와 같은 부수 피해).

## 원인 — 서버(Bun)의 WebSocket 수신 상한 16MB

[015](015-big-page-lint-killed-the-plugin.md) 가 넣은 close code 로깅이 바로 답을 줬다.

```
07:45:56  Sending GET_TREE (depth: full)
07:46:07  Plugin disconnected (code: 1006, reason: Received too big message, lived: 80s)
```

**"too big" 으로 끊긴 8건 전부, 8~13초 전에 `GET_TREE (depth: full)` 이 있다.** 예외 없다.

### 실측 — 16MB 고정이고, `ws` 옵션으로는 못 올린다

| 보낸 크기 | 설정 | 결과 |
|---:|---|---|
| 8MB | `ws` 기본 | OK |
| 15MB | `ws` 기본 | OK |
| 17MB | `ws` 기본 | ⛔ `code=1006 "Received too big message"` |
| 17MB | **`ws` `maxPayload: 64MB`** | ⛔ **같은 실패 — 옵션이 무시된다** |
| 17MB / 40MB / 64MB | `Bun.serve` `maxPayloadLength` 64~128MB | OK |
| 17MB | `Bun.serve` `maxPayloadLength: 16MB` | ⛔ 증상 재현 |

- `"Received too big message"` 문자열은 `node_modules/ws` 에 **없고 bun 바이너리 안에 있다.**
  Bun 이 `ws` 를 자체 구현으로 바꿔치기하고 있고 그 상한이 16MB 다.
- **`new WebSocketServer({ maxPayload })` 는 먹지 않는다.** 지금 코드 형태로는 올릴 방법이 없다.

### 왜 거부가 아니라 절단인가 (이걸 알아야 처방이 갈린다)

WebSocket 에는 **메시지 하나만 거부하는 수단이 없다.** RFC 6455 는 이 상황 전용으로
close code 1009(Message Too Big)를 두고 있다 — 규격이 정한 거부 방식이 곧 **종료**다.
한 메시지는 continuation frame 여러 개로 오고 총 크기는 FIN 이 와야 아는데, "버리고 다음부터
읽자" 를 하려면 끝을 모르는 바이트를 계속 읽어야 한다. 그게 상한이 막으려던 것이다.

### 양쪽이 보는 것이 다르다 — 플러그인은 이유를 모른다

```
server sees: code=1006 reason="Received too big message"
client sees: code=1006 reason="Connection ended"  wasClean=false
```

이유 문자열은 **와이어로 나가는 close frame 이 아니라 Bun 이 로컬에서 붙이는 설명**이다.
그래서 **원인을 아는 것은 서버뿐**이고, 플러그인은 방금 보낸 것이 잘렸는지조차 모른 채
2초 뒤 재연결한다. ⇒ **보내기 전에 플러그인이 스스로 나눠야 한다.**

### 근본 비대칭 — 012 가 예고한 자리

`websocket/server.ts` 는 **서버 → 플러그인** 방향만 1MB 로 청킹한다(`CHUNK_START`/`CHUNK`/`CHUNK_END`).
**플러그인 → 서버** 방향에는 없었다. 012 의 「큰 것은 늘 응답 쪽인데 보호는 요청 쪽에만 있다」가
그대로 터진 것이고, 012 가 「남은 것」의 근본책으로 적어 둔 항목이 바로 이거다.

## 무엇을 했나

**양방향 대칭.** 플러그인 UI 의 `sendToServer` 가 1MB 를 넘으면 나눠 보내고
(`RESPONSE_CHUNK_START`/`RESPONSE_CHUNK`/`RESPONSE_CHUNK_END`), 서버가 `handleMessage` **앞에서**
조립한다. `sendToServer` 는 플러그인 → 서버의 **유일한 대용량 통로**라(나머지 직접 `ws.send` 는
REGISTER·PONG·청크 오류 응답뿐) 여기 한 곳만 고치면 모든 명령이 덮인다.

- **이름을 `CHUNK_*` 와 다르게 뒀다.** 한 소켓에 두 방향이 흐르므로 이름을 공유하면
  어느 쪽 스트림인지 구분할 수 없다.
- **스트림 키는 `commandId`.** 동시 명령이 겹쳐도 서버가 각 스트림을 따로 모은다
  (루트 CLAUDE.md 「멀티에이전트 동시 작업」 — 명령 간 공유 전역을 만들지 않는다).
  버퍼는 플러그인별 `responseStreams` 에 들어가 소켓이 닫히면 통째로 사라진다.
- **실패는 반드시 pending 을 깨운다**(`failPending`). 청크 누락·파싱 실패·조립 상한 초과 모두
  즉시 에러로 끝낸다. 조용히 버리면 호출자는 60초 뒤 «응답 시간 초과» 만 보는데,
  그건 012 에서 «느리다» 로 오진했던 바로 그 모양이다.
- **조립 상한 256MB**(`RESPONSE_ASSEMBLY_LIMIT`). 청킹이 생겼다고 무한히 받아도 되는 것은 아니다.

## 되돌리면 안 되는 이유

- **`RESPONSE_CHUNK_SIZE`(1MB)를 크게 올리지 말 것.** 단위가 **문자 수**인데 상한은 **바이트**다.
  한글은 UTF-8 에서 3배가 되므로 1MB 문자 = 최대 3MB 바이트. 16MB 대비 5배 여유가 이 값의 근거다.
  "왕복이 많아 비효율" 로 보여 올리고 싶어지는데, 넘는 순간 소켓이 끊기고 pluginId 가 돈다.
- **`maxPayload` 를 올려서 대신하려 하지 말 것 — 안 먹는다**(위 실측). `Bun.serve` 로 갈아타면
  올릴 수는 있지만, 그건 **벽을 옮길 뿐**이라 페이지가 더 커지면 같은 일이 다시 난다.
- **실패 경로에서 `failPending` 을 빼지 말 것.** 끊기지 않는 대신 **영원히 안 오는 응답**이 되면
  진단이 더 어려워진다(끊기는 건 시끄럽지만 정직한 신호였다).
- **`response-chunking.test.ts` 의 20MB 를 줄이지 말 것.** 16MB 상한을 넘지 않는 페이로드로는
  이 회귀를 못 잡는다. 「통짜로 보내면 끊긴다」 테스트도 함께 남긴 이유가 그것이다.

## 남은 것

- **플러그인 쪽 바이트 예산**(당시 검토한 B 안): 트리 직렬화가 일정 크기를 넘으면 `truncated: true`
  로 끊고 반환. 청킹이 들어가 전송은 뚫렸지만, **응답이 무한정 커져도 되는 것은 아니다**
  (조립 상한에 걸리면 여전히 에러다). `timedOut`/`scanTruncated` 와 같은 결로 붙이면 된다.
- **012 의 «~18MB 절벽» 재확인.** 012 의 사다리는 17.5MB 통과 / 18.4MB 사망이라 16MB 와 수치가
  맞지 않는다. 측정 기준이 달랐는지(WS 프레임 vs MCP 응답) 별건인지 아직 안 갈랐다 — 섞어 읽지 말 것.
- **`GET_TREE depth:full` 자체의 비용**은 그대로다. 큰 페이지에서는 `nodeId` 스코프·`omit`/`keep`·
  `fields:"geometry"` 로 좁히는 편이 여전히 낫다.
