# 020. 플러그인 VM 이 abort 했다 — 큰 응답이 아니라 **오래 산 인스턴스**에서

> 관련 코드: `packages/server/src/websocket/server.ts` (`PluginStats`, `countCommand`,
> `recordDisconnect`, `formatPluginLossHint`, `LIFETIME_LOG_EVERY`),
> `packages/server/src/mcp/helpers.ts`, `packages/server/src/mcp/handlers/auth.ts`,
> `packages/server/src/mcp/handlers/management.ts` (`sigma_server_status.recentDisconnects`)
> 2026-08-10 사망 · 2026-08-11 진단·기록

## 증상

Figma 콘솔에 이것이 남고 플러그인이 사라졌다. 다음 날까지 **재연결 0**.

```
vendor-core-….min.js.br:54 Aborted()
Error: Plugin runtime aborted
    at t (…) / at e._abortHandler / at n.onAbort
    at abort (jsvm-cpp.js.br) / at __abort_js (jsvm-cpp.js.br)
    at jsvm-cpp.wasm.br:0x989ba … (wasm 프레임 6개)
    at Object.getPropStr (…)   ← 호스트 JS 가 VM 안의 문자열 프로퍼티를 읽는 중
    at e.getProp / at getNode / at Number.get / at d.get
    at Number.<anonymous> (figma_app-….min.js.br)
    at N.e.invokeCallback
    at 85756 (jsvm-cpp.js) / runEmAsmFunction / _emscripten_asm_const_int
    at jsvm-cpp.wasm.br:0x5e23 … (wasm 프레임 20여 개)
```

## 스택이 가른 것 — **층위**는 확정된다

아래에서 위로 읽으면 `wasm(code.ts 실행) → EM_ASM → invokeCallback → figma_app → 노드
프로퍼티 접근 → getNode → getProp → getPropStr → (VM 재진입) → abort()` 이다.

| 확정 | 근거 |
|---|---|
| 죽은 것은 **플러그인 샌드박스 VM(jsvm-cpp wasm)** | abort 가 wasm 안에서 났다. UI iframe·WebSocket·서버·Figma 렌더러가 아니다 |
| **응답을 만들다** 죽었다 | 노드 핸들의 프로퍼티를 읽는 중이다. postMessage·직렬화·송신 구간이 아니다 |
| C++ 쪽 `abort()` | `__abort_js`(= C `abort()`), 메시지 빈 문자열(`Aborted()`) |

⚠️ **스택에 sigma 프레임이 하나도 없다.** 전부 Figma 의 minified 호스트 JS 와 wasm 이다.
그래서 이 스택만으로는 **우리 코드의 어느 줄인지 짚을 수 없다.** "할당 실패류"는 모양이
맞을 뿐 확정이 아니다 — 스택은 **어디서**를 말하지 **왜**를 말하지 않는다.

## 서버 로그가 붙인 것 — **큰 응답이 아니었다**

[015](015-big-page-lint-killed-the-plugin.md) 가 넣은 close code 로깅이 처음으로 일했다.

```
14:21:14.818  Sending GET_TREE (depth: 1)
14:21:14.834  Plugin disconnected (id: figma-msn5c2m9-nep8, code: 1001, lived: 10476s)
```

- **close code 1001**(going away) = Figma 가 플러그인을 내렸다. 절단(1006)도 크기 위반(1009)도 아니다.
  런타임 abort 뒤의 정리와 맞는다.
- 마지막 명령은 `GET_TREE depth:1` — **응답 수십 KB 짜리**다.
- 그 인스턴스는 **2시간 55분 · 약 55,000 명령**을 처리했다:
  `GET_TREE` 16,179 · `MODIFY_NODE` 12,599 · `GET_NODE_DATA` 7,715 · `USE_COMPONENT_SPEC` 5,977 …
- **부하 스파이크가 없다.** 마지막 1분 341건, 2분 전 423건. 30분 내내 ~300건/분 평탄.

⇒ [012](012-nodes-info-asked-for-a-whole-page-and-killed-the-plugin.md) 의 «단일 응답 ~18MB 절벽»
과 **다른 경로**다. 계기가 "한 번의 큰 호출"이 아니라 **"3시간 5.5만 콜"** 이다.
015 의 남은 후보 중 ②(탭 전환 등 환경 요인)는 wasm abort 를 만들지 못하므로 사실상 빠지고,
①(플러그인별 메모리 한도)이 남는다 — 다만 **계기가 새로 바뀌었다.**

플러그인 쪽에 무한히 자라는 모듈 전역은 없다(확인: `converter/font-loader.ts` 의 폰트 캐시 3개는
폰트 수로 유계, `ui/ui-state.ts` 의 `chunkBuffers` 는 VM 이 아니라 UI iframe). **우리 코드의
명백한 누수는 못 찾았다.** 여기까지가 관측이고, 그 위는 추정이다.

## 무엇을 했나 — 원인이 아니라 **다음 사망의 관측 가능성**을 고쳤다

원인을 못 짚었으므로 고칠 것은 «재발했을 때 알 수 있게 만드는 것» 이다.

**1. 인스턴스 수명 통계**(`PluginStats` · `countCommand`). 명령 수 · 타입별 분포 · 누적 수신
바이트 · 왕복시간을 인스턴스마다 센다. 청킹 경로(`createFrameChunked`/`updateFrameChunked`)도
같은 카운터에 싣는다 — 거기만 빠지면 아래 두 로그가 거짓이 된다.

**2. 종료 한 줄에 부검 정보 전부**(`recordDisconnect`):
```
Plugin disconnected (id: …, code: 1001, lived: 10476s, commands: 55123, in: 812.4MB,
                     avg rtt: 41ms, last: GET_TREE 16ms ago, pending: 1)
  ↳ lifetime commands (id: …): GET_TREE×16179 MODIFY_NODE×12599 GET_NODE_DATA×7715 …
```
`last: … Nms ago` 가 짧을수록 «그 명령을 처리하다 죽었다» 에 가깝다.

**3. 궤적**(`LIFETIME_LOG_EVERY` = 2000 명령마다):
```
Plugin lifetime (id: …, commands: 20000, lived: 3600s, in: 250.1MB, avg rtt: 41ms, recent rtt: 120ms)
```
`recent rtt` 는 **구간마다 초기화**한다. 이게 이 로그의 전부다 — 누적 평균은 나빠지는 것을
희석해서 «서서히 나빠졌나 / 갑자기 죽었나» 를 못 가른다. 020 에서 답 못 한 질문이 정확히 이것이다.

**4. 죽은 정황을 오류 메시지에 싣는다**(`formatPluginLossHint` · `describePluginLoss`).
`「연결되어 있지 않습니다」` 는 **"아직 안 켰다"와 "죽었다"를 구분하지 못한다.** 최근 종료 기록
8건을 들고 있다가 그 자리에서 붙인다:

> 바인딩된 플러그인(figma-…)이 연결되어 있지 않습니다. 플러그인(figma-…)이 12분 전 끊겼습니다 —
> close code 1001, 수명 2.9시간, 처리한 명령 55123건. 플러그인 런타임이 죽었을 수 있습니다
> (Figma 콘솔에 "Plugin runtime aborted" 가 있으면 확정입니다). Figma 에서 Sigma 플러그인을
> 다시 실행한 뒤, sigma_list_plugins 로 새 pluginId 를 받아 sigma_bind 로 다시 바인딩하세요.

`sigma_bind` · `sigma_list_pages` · `validateFigmaAccess` · `sendCommand` · 청킹 진입점에
배선했고, `sigma_server_status` 는 `recentDisconnects` 로 같은 기록을 구조화해 준다.

**5. 타임아웃이 사망을 가린다**. `sendCommand` 의 타임아웃은 발화 시점에 플러그인 생사를 확인해
죽었으면 그렇게 말한다. 012 가 «느리다» 로 보고된 것이 사실 «이미 죽었다» 였고, 그 착각이
처방(타임아웃 늘리기)을 통째로 틀리게 했다.

## 되돌리면 안 되는 이유

- **`describePluginLoss` 를 «장황하다»고 줄이지 말 것.** 짧은 오류로 되돌리면 호출자는 죽은
  pluginId 로 재시도한다(015 에서 실제로 그랬다). 정황은 서버 컨테이너 로그에만 있었고
  그건 에이전트가 볼 수 없는 자리다.
- **`recent rtt` 를 누적 평균으로 합치지 말 것.** 두 값이 있어야 궤적이 보인다.
- **`countCommand` 를 청킹 경로에서 빼지 말 것.** 종료 로그의 `commands`·`pending` 이 거짓이 된다.
- **1001 을 "정상 종료니까 무시" 로 다루지 말 것.** 020 의 사망이 정확히 1001 이다.
- 이 로그들은 원인을 고친 것이 **아니다.** 재발하면 위 세 줄(종료·궤적·`recentDisconnects`)을
  먼저 보고, 「남은 것」의 재현으로 넘어갈 것.

## → 후속: [022](022-lifetime-log-never-fired-and-peak-was-invisible.md) 에서 축이 하나 더 나왔다

2026-08-13 에 같은 wasm abort 가 **10분 33초 · 1,270 명령 · 576.5MB** 만에 났다. «오래 산
인스턴스» 가 아니어도 죽는다 ⇒ 조건은 수명도 명령 수도 아니고 **피크 힙**일 가능성이 크다
(그렇게 보면 020 과 022 는 같은 병에 도달 경로만 다른 것이 된다). 스택도 020 의 **읽기**
경로가 아니라 **쓰기**(`deepUnwrap`) 경로였는데, **터진 자리가 매번 다르다는 것 자체가**
«힙 고갈 뒤 다음 할당이 죽는다» 를 가리킨다.

⚠️ 이 문서가 넣은 궤적 로그는 **022 사망에서 한 줄도 찍히지 않았다** — 발화 조건이 «2000
명령마다» 하나뿐이라 1,270 에서 죽은 인스턴스를 통째로 놓쳤다. 022 에서 세 축(명령·바이트·시간)
으로 고쳤다.

## 남은 것 (하지 않은 것)

- **원인 미확정.** «오래 산 인스턴스» 가 조건인지, 특정 명령이 조건인지 아직 못 가른다.
  (022 실측으로 **둘 다 아닐 가능성**이 커졌다 — 위 후속 참조.)
  재현안: 같은 파일에서 **가벼운 명령만 수만 번** 돌려 시간·콜 수만으로 abort 가 나는지 본다.
  나면 "인스턴스 수명 상한"이 확정되고, 안 나면 명령별로 좁혀야 한다.
- **VM 힙 사용량 관측**. 015 가 「진단 3종」의 ③으로 적은 것. 샌드박스에는 `performance.memory`
  가 없어 UI iframe 값으로 대신할 수 있는지부터 확인해야 한다. 지금 대리 지표는 `recent rtt` 뿐이다.
- **죽기 직전 워크로드의 모양**: 마지막 30분은 `GET_TREE(depth:1)` ↔ `GET_NODE_DATA(role)` 를
  20~30ms 간격으로 번갈아 수천 번 — 에이전트가 트리를 **손으로 N+1 크롤**한 패턴이다.
  사망 원인인지는 미확인이지만, 이 워크로드 자체가 비싸다(`sigma_get_tree` 한 번 + `keep`/`fields`
  로 대체 가능한 경우가 많다).
- **플러그인 → 서버 방향 청킹**([012](012-nodes-info-asked-for-a-whole-page-and-killed-the-plugin.md)
  「남은 것」)은 여전히 남아 있다. 이번 사망의 원인은 아니지만 그 절벽은 그대로다.
