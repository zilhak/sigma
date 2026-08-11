# 012. `GET_NODES_INFO` 가 페이지를 통째로 요청해 플러그인을 죽였다

> 관련 코드: `packages/server/src/lint/enrich.ts` (`NODES_INFO_BATCH`, `fetchNodesInfoBatched`),
> `packages/server/src/lint/collect-context.ts`, `packages/server/src/mcp/handlers/figma.ts`
> 2026-08-08 실측 · 같은 날 수정

## 증상

integrate 워크스페이스에서 가장 큰 페이지(`📄 L1-2 · CI/CD·GitOps`, **28,979 노드**)에
`sigma_lint({scope:"page"})` 를 걸면 **응답 시간 초과**가 났다. 그걸로 끝이 아니었다 —
**Figma 플러그인이 끊기고 새 pluginId 로 재연결**됐다. 재현 **5/5**.

pluginId 는 연결마다 새로 만들어지므로(`generatePluginId`), 호출자의 바인딩이 통째로 무효가 된다.
그 파일에서 작업 중이던 **다른 에이전트의 세션까지 함께 끊겼다.** 한동안은 `get_node_info`
같은 가벼운 호출도 실패해서(그 사이 또 재연결) 아무 작업도 못 했다.

## 1차 진단은 틀렸다 — `GET_TREE` 를 범인으로 지목했다

처음엔 "페이지가 크니 트리 순회가 플러그인 메인 스레드를 오래 잡는다" 로 결론짓고
TODO 까지 그렇게 썼다. **틀렸다.** `GET_TREE` 는 같은 페이지에서 멀쩡히 돈다.

오진한 이유가 그 자체로 결함이다 — 서버 로그가 이렇게만 남는다:

```
[WebSocket] Sending GET_TREE to figma-… (depth: full)
[WebSocket] Sending GET_NODES_DATA to figma-… (100 nodes, key: role)
[WebSocket] Sending GET_NODES_INFO to figma-…          ← 개수가 없다
[WebSocket] Plugin disconnected (id: figma-…)
```

`getNodesData` 는 `logSuffix` 로 `(100 nodes, …)` 를 남기는데 **`GET_NODES_INFO` 는 아무것도
안 남긴다.** 그래서 로그만 봐서는 이 호출이 노드 100개짜리인지 3만 개짜리인지 알 수 없었고,
"큰 것 = 트리" 라는 선입견이 그대로 결론이 됐다.

## 실측 — 사다리로 재현

`sigma_get_nodes_info` 를 개수만 늘려 가며 부르고 전후 pluginId 를 비교했다.

| nodeIds | 소요 | 선형 예측 | 응답 | 결과 |
|---:|---:|---:|---:|---|
| 250 | 0.3s | — | 0.16MB | ok |
| 4,000 | 2.5s | — | 2.55MB | ok |
| 8,000 | 5.0s | — | 5.11MB | ok |
| 16,000 | 9.7s | — | 10.24MB | ok |
| 24,000 | 14.8s | 14.9s | 15.31MB | ok |
| 26,000 | 15.5s | 16.1s | 16.55MB | ok |
| 27,500 | 16.7s | 17.1s | 17.51MB | ok |
| **28,979** | **16.6s 에 사망** | 18.0s | ~18.4MB | ⛔ 플러그인 재시작 |

### 타임아웃이 원인이 아니다 (이게 핵심이다)

로그 타임스탬프가 갈랐다:

```
09:34:07.875  Sending GET_NODES_INFO   ← 28,979 개
09:34:24.461  Plugin disconnected      ← Δ 16.6s
09:34:37      서버 30s 타이머 발화 → 호출자에게 "응답 시간 초과"
```

**16.6초는 정상 처리 시간이다**(27,500 개가 16.7초). 플러그인은 제 시간에 다 만들었고
**넘기는 순간 죽었다.** 서버 타임아웃은 13초 뒤에 발화해 **이미 죽은 것을 "느리다" 고
잘못 보고**했을 뿐이다.

⇒ **타임아웃을 늘리는 것은 처방이 아니다.** 그렇게 고쳤다면 60초를 기다렸다가
똑같이 죽고, 진단은 더 헷갈렸을 것이다.

### 점진적 성능 열화도, 독이 든 노드도 아니다

- 27,500 까지 **선형 예측과 오차 0.5초 이내**다. 메모리 압박이 서서히 목을 조르는 곡선이 아니라 **절벽**이다.
- **꼬리 1,479개만 따로 요청하면 1.0초 / 0.95MB 로 통과한다.** 마지막 구간에 무거운 노드가 있는 게 아니다.

⇒ **누적 응답 크기 ~18MB 부근의 하드 절벽.** 그 크기가 지나가는 곳은
`샌드박스 → UI(figma.ui.postMessage) → WebSocket 송신` 이다. 셋 중 어디서 죽는지는 아직 안 갈랐다
(플러그인 콘솔을 봐야 한다). 참고로 같은 경로에서 **직렬화 때문에 통신이 끊긴 전례**가 이미 있다 —
`node-ops/query.ts` 의 `deepSanitizeMixed` 주석(`figma.mixed` 심볼이 구조화 복제를 깨뜨려
"Cannot unwrap symbol" 로 통신이 끊겼다). 이 브리지는 큰 것·이상한 것에 약하다.

## 원인

`lint/enrich.ts` 가 **페이지의 모든 노드**를 한 왕복에 요청했다.

```ts
const nodeIds = collectNodeIds(roots);   // flattenTree(roots).map(n => n.id) — 필터 없음
await wsServer.command('GET_NODES_INFO', { nodeIds }, { pluginId });   // 배치 없음, 기본 30s
```

이 왕복은 커스텀 규칙이 하나라도 있거나 `fully_occluded_sibling`·`annotation_marker_*`·
`font_not_default`·`instance_resized_from_spec` 중 하나가 켜지면 실행된다.

같은 모양의 무제한 호출이 **4곳**이었다 — `enrich.ts` · `collect-context.ts`
(`collectInstanceComponentNames`) · `sigma_get_nodes_info` 도구 · `find_node` 질의 경로.

### 근본 비대칭 — 청킹이 한 방향에만 있다

`websocket/server.ts` 는 **서버 → 플러그인** 방향만 1MB 임계로 청킹한다
(`CHUNK_THRESHOLD`/`CHUNK_START`/`CHUNK`/`CHUNK_END`). **플러그인 → 서버** 방향에는
청킹도 크기 가드도 없다. **큰 것은 늘 응답 쪽인데 보호는 요청 쪽에만 있다.**

### 왜 하필 그때 터졌나

integrate 파일의 페이지 저장 lint config 16개가 `_intent`/`_note` 주석 키 때문에
[011](011-lint-config-typos-were-silently-ignored.md) 의 엄격 검증에 걸려 무시되고 있었다.
그동안은 **커스텀 규칙이 0개라 `enrichIfNeeded` 가 `null` 을 돌려주고 이 왕복 자체를 안 탔다.**
config 를 복구하자 커스텀 5종이 살아나면서 처음으로 큰 페이지에 걸렸다.

즉 **011 을 고친 것이 이 버그를 깨웠다.** 조용히 죽어 있던 코드가 살아나면 그 코드의
확장성 문제도 함께 깨어난다.

## 무엇을 했나

`fetchNodesInfoBatched()` 하나로 모으고 **4,000개씩 순차 배치**로 나눈다. 위 4곳 전부 이걸 쓴다.

- **4,000** = 실측 2.5MB/2.5s. 마지막 성공값(27,500 = 17.5MB)의 1/7 이라 안전 계수가 크다.
- **순차다.** 병렬로 던지면 플러그인이 동시에 여러 응답을 만들어 **합산으로 절벽을 넘을 수 있다.**
- 배치마다 `timeoutMs: 60000`(`getNodesData` 와 동일)과 **개수·진행이 담긴 `logSuffix`** 를 붙였다.
- `sigma_get_nodes_info` 의 응답 형태 `{total, succeeded, nodes}` 는 **그대로 유지**했다
  (처음에 `{nodes}` 로 바꿨다가 플러그인 반환 타입을 확인하고 되돌렸다 — 도구 소비자가 깨진다).

## 되돌리면 안 되는 이유

- **`NODES_INFO_BATCH` 를 없애거나 크게 올리면 큰 페이지에서 플러그인이 죽는다.**
  "왕복이 여러 번이라 비효율" 로 보여 한 번에 합치고 싶어질 수 있는데, 그 한 번이 절벽을 넘는다.
- **병렬(`Promise.all`)로 바꾸지 말 것.** 왕복 수는 같지만 플러그인이 동시에 응답을 만들어
  합산 크기가 절벽을 넘는다. 지금 for 루프는 느려서가 아니라 **일부러** 순차다.
- **`timeoutMs` 를 늘리는 것으로 대체하지 말 것.** 위 실측대로 이건 시간 문제가 아니다.
- **`logSuffix` 를 지우지 말 것.** 개수가 없어서 1차 진단이 통째로 빗나갔다.

## 남은 것

- ~~**플러그인 → 서버 방향 청킹**(근본책)~~ → **[021](021-plugin-to-server-had-no-chunking.md) 에서 들어갔다.**
  이 배치 상한은 이제 안전망으로만 남는다. 021 이 밝힌 것: 이 방향의 벽은 **서버(Bun)의
  WebSocket 수신 상한 16MB** 이고, 넘으면 «거부» 가 아니라 **소켓 절단**이라 pluginId 가 돈다.
  ⚠️ 위 「실측 — 사다리로 재현」의 17.5MB 통과 / 18.4MB 사망은 16MB 와 수치가 맞지 않는다.
  측정 기준이 달랐는지 별건인지 아직 안 갈렸으니 **021 과 섞어 읽지 말 것.**
- **enrich 후보 좁히기** — 규칙 하나만 켜져도 전 노드 상세를 받는다. 규칙별로 실제 필요한
  노드 종류(TEXT·INSTANCE·마커…)만 모으면 왕복량이 크게 준다.
- **재연결 안내** — 플러그인이 재연결됐으면 오류 메시지에 "`sigma_list_plugins` 로 pluginId 를
  다시 받으세요" 를 넣는다. 지금은 호출자가 "응답 시간 초과" 만 보고 죽은 id 로 재시도한다.
- **절벽의 정확한 위치와 층위** — 17.5MB 통과 / ~18.4MB 사망까지만 좁혔다.
  postMessage 인지 WebSocket 송신인지는 미확인.
