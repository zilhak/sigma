# 022. 궤적 로그가 한 줄도 안 찍혔다 — 부하의 축이 «횟수» 가 아니라 «양» 이었다

> 관련 코드: `packages/server/src/websocket/server.ts`
> (`LIFETIME_LOG_EVERY_COMMANDS`/`_BYTES`/`_MS`, `shouldLogLifetime`, `PluginStats.peakPending`)
> 테스트: `packages/server/__tests__/lifetime-log-trigger.test.ts`
> 2026-08-13 사망 실측 · 같은 날 계측 보완

## 사건 — 세 번째 죽음, 세 번째 다른 패턴

Figma 콘솔에 다시 `Plugin runtime aborted`(wasm abort). 서버 로그의 부검 한 줄:

```
Plugin disconnected (id: figma-msr455rc-oolz, code: 1001, lived: 633s,
                     commands: 1270, in: 576.5MB, avg rtt: 1244ms,
                     last: GET_NODES_DATA 562ms ago, pending: 6)
  ↳ lifetime commands: MODIFY_NODE×571 GET_TREE×277 GET_NODE_DATA×183
                       GET_NODES_INFO×108 GET_NODES_DATA×96 GET_PAGE_DATA×25 …
```

| | [020](020-plugin-vm-aborted-after-a-long-lived-session.md) | [021](021-plugin-to-server-had-no-chunking.md) | 이번 |
|---|---|---|---|
| 계기 | 2시간 55분 · 5.5만 명령 | 단일 메시지 16MB 초과 | **10분 33초 · 1,270 명령 · 576.5MB** |
| close code | 1001 | 1006 `Received too big message` | 1001 |
| 죽은 주체 | 플러그인 VM | 아무도 안 죽음(서버가 프레임 거부) | 플러그인 VM |

**021 의 청킹은 잘 돌았다** — 재조립 108건 471MB 전부 성공, `too big` 절단 0건.

### 죽기 직전 5초 — 동시 전수 조회

```
06:14:49.962  GET_TREE (depth: full)  ┐
06:14:49.966  GET_TREE (depth: full)  │ 4ms 안에 3개
06:14:49.976  GET_TREE (depth: full)  ┘
06:14:51.690  GET_TREE (depth: full)
06:14:54.095  GET_TREE (depth: full)
06:14:54.758  Plugin disconnected                    ← pending: 6
```

각 응답이 5.45MB 다. 플러그인 VM 이 **전수 트리 직렬화 대여섯 개를 동시에 반쯤 만든 채**
들고 있었다. 이 동시성은 사고가 아니라 **설계**다 — `figma.ui.onmessage` 는 명령마다 독립
async 핸들러를 띄우고, `tree.ts` 의 `tick()` 양보(015)가 그 사이를 인터리브시킨다.
큐도 동시 실행 상한도 없다(`grep -riE "\bqueue\b"` → 0건).

> 015 의 양보는 **한 개짜리 순회**를 기준으로 옳았다. 하트비트 굶김을 막는 그 한 줄이,
> 동시에 N 개의 순회가 나란히 자라게 하는 장치이기도 하다. 되돌리라는 뜻이 아니라,
> 전제가 «동시 1개» 였다는 것을 적어 둔다.

### 스택이 020 과 다른 자리를 가리켰다 (그리고 그게 단서다)

| | 020 | 이번 |
|---|---|---|
| 마지막 프레임 | `getNode → getProp → getPropStr` (**읽기**) | `conditionalEditScope → cb → deepUnwrap ×14 → getPropStr` (**쓰기**) |

**터진 자리가 매번 다르다는 것 자체가 신호다.** 특정 호출의 버그라면 같은 자리에서
재현돼야 한다. 둘 다 `getPropStr`(= VM 문자열 할당) 직전이라는 공통점만 있다 —
«힙이 바닥난 뒤 다음 할당이 죽는다» 에 부합한다. 다만 **여전히 추정이다**
(플러그인 VM 의 실제 사용량도 상한도 아직 측정한 적이 없다).

## 계측의 구멍 — 궤적 로그가 **한 줄도** 안 찍혔다

020 이 「서서히 나빠졌나 / 갑자기 죽었나」를 가르려고 넣은 궤적 로그가 **2000 명령마다**
하나였다. 그건 020 의 5.5만 명령 마라톤을 보고 잡은 값이고, 이번은 **1,270 명령 만에**
죽었다. 그래서 그 인스턴스의 궤적은 로그에 **없다.**

없는 대신, 021 이 넣은 `Reassembled` 줄의 조립 소요시간을 손으로 모아 재구성해야 했다:

| 시각 | 건수 | 합계 | 최대 조립시간 |
|---|---:|---:|---:|
| 06:04 | 5 | 18.1MB | 2,841ms |
| 06:06 | 16 | 89.0MB | 11,576ms |
| 06:09 | 7 | 17.5MB | **13,982ms** |
| 06:11 | 3 | 15.1MB | **14,513ms** |
| 06:14 | 13 | 59.5MB | 5,836ms |

정상 40~100ms 가 11~14초까지 튄다. **열화는 분명히 있었는데 그걸 볼 장비가 우연히
다른 목적의 로그였다.**

두 번째 구멍: **동시 처리 개수를 죽을 때만 안다.** `pending: 6` 이 사인에 가장 가까운
숫자인데, 최고치가 **언제 어디까지** 갔는지는 기록이 없었다.

## 무엇을 했나

**1. 궤적 발화를 세 축으로 — 셋 중 먼저 오는 것**(`shouldLogLifetime`).
명령 2000 · 누적 100MB · 경과 5분. 이번 사망은 «횟수는 적고 양이 많은» 경우였고,
축이 하나뿐이면 그런 경우를 통째로 놓친다.
- 판정은 **명령을 보낼 때만** 돌므로 놀고 있는 플러그인은 로그를 만들지 않는다.
- 기준점은 **마지막 발화 시점**이다(누적이 아니라 구간). 아니면 조건이 한 번 참이 된 뒤
  계속 참이 된다.

**2. 동시 처리 최고치**(`peakPending`/`peakPendingAt`). 궤적·부검 양쪽에 싣는다.
최고치는 **언제** 가 함께 있어야 쓸모가 있다 — 죽기 직전 피크와 30분 전 피크는 다른 이야기다.

```
Plugin lifetime (id: …, commands: 800, lived: 300s, in: 210.4MB,
                 avg rtt: 380ms, recent rtt: 1240ms, in-flight: 4, peak: 5)
Plugin disconnected (…, pending: 6, peak: 7 (12s ago))
```

`sigma_server_status` 의 `recentDisconnects` 에도 `peakPending`·`peakPendingAt`·`avgRttMs` 를 넣었다.

## 되돌리면 안 되는 이유

- **발화 축을 다시 명령 수 하나로 줄이지 말 것.** 이 문서의 사망이 정확히 그래서 안 찍혔다.
  «조건이 셋이라 복잡하다» 로 보이면 `lifetime-log-trigger.test.ts` 의 회귀 케이스
  (1,270 명령 / 576MB / 633초)를 먼저 볼 것 — 그 값이 실측이다.
- **`peakPendingAt` 을 빼지 말 것.** 시각 없는 최고치는 해석이 안 된다.
- **`countCommand` 의 `+1` 은 호출 순서 의존이다.** 이 함수는 `pendingCommands.set` **전**에
  불린다. 순서를 바꾸면 최고치가 1씩 어긋난다.
- 이 변경은 **원인을 고친 것이 아니다.** 다음 사망을 읽을 수 있게 만든 것뿐이다.

## 남은 것

- **동시 예산 실측**(하기로 한 다음 단계). 같은 페이지에 전수 트리 조회를 2 → 3 → 4 개
  동시에 던져 어디서 넘어가는지 본다. 새 코드가 필요 없고, **큐 상한에 그대로 쓸 숫자**가 나온다.
  ⚠️ 실제로 죽는 실험이다 — 그 파일에 붙은 **다른 에이전트들의 바인딩도 함께 날아간다.**
  파일이 한가한 시점에 돌릴 것.
- **무거운 명령 동시 상한(큐).** 에이전트가 몇이든 서버는 하나이므로 **플러그인 수정 없이
  서버에서만** 조일 수 있다. 전부 직렬화는 안 된다(14초짜리 전수 스캔이 20ms 짜리 rename 을
  막는다) — `GET_TREE(depth:full)`·`GET_NODES_INFO`·`SCAN_*` 같은 MB 급만 조인다.
  격리는 안 깨진다(순서만 바뀌고 `commandId`·바인딩·페이지 타겟팅은 그대로).
  **타임아웃 시작점을 «전송 시점» 으로 옮겨야 한다** — 지금은 큐에 넣는 순간부터 세므로
  대기 중에 타임아웃이 난다. 대기 시간도 로그에 남겨야 «느린 게 큐인지 플러그인인지» 를 가른다.
- **플러그인 VM 힙 실측.** 020·015 가 「진단 3종」으로 미뤄 둔 것. `performance.memory` 로는
  안 된다 — 그건 UI iframe 의 힙이고 죽는 것은 렌더러 안의 wasm VM 이라 다른 메모리다.
