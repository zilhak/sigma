# 002. 스펙 삭제가 다른 파일의 마스터 컴포넌트를 지울 수 있었다

> 관련 코드: `packages/server/src/mcp/handlers/component-spec.ts` (`sigma_delete_component_spec`),
> `packages/server/src/websocket/server.ts` (`getPluginFileId`), `packages/figma-plugin/src/node-ops/page.ts` (`sendFileInfo`)
> 2026-08-07 실측 · 2026-08-08 수정

## 증상

`sigma_delete_component_spec` 은 **토큰이 필요 없었고**(도구 설명에 "토큰 불필요"로 명시),
컴포넌트 스펙 레지스트리는 **파일을 가로지른다**. 그래서 A 파일에서 작업 중인 세션이
B 파일 소유 스펙을 지울 수 있었고, `deleteNode: true` 면 **B 파일의 마스터 컴포넌트 노드까지**
사라졌다 — B 파일에 있던 인스턴스가 통째로 깨진다.

실측(Playground 에 바인딩된 세션에서 토큰 없이 호출):

```
sigma_list_component_specs(alias:"table_cell", namespace:"oneui")
→ { …, "fileId":"file-mrlj2j4n-3vkwrh", "fileName":"Native Platform", "componentNodeId":"194:50971" }
```

바인딩은 Playground 인데 **Native Platform 의 마스터 노드 id 가 그대로 나왔다.** 삭제도 같은
무토큰 경로였다. 당시 `integrate` 워크스페이스는 두 파일(`Playground` + `Native Platform`)에
플러그인을 **동시에 연결**한 채 작업했고, 목업 정본이 `Native Platform` 이라 이 경로가
정본 파일을 조용히 훼손할 수 있는 유일한 통로였다.

## 원인

두 겹이다.

1. **토큰이 없으니 대상 파일을 특정할 수 없다.** 이 도구의 토큰은 인증이 아니라
   "지금 어느 파일에서 지우는가" 를 정하는 값인데, 그게 없었다.
2. **`deleteFrame(nodeId)` 를 pluginId 없이 불렀다.** 그러면 `resolveTargetPlugin(undefined)` 가
   **먼저 연결된 플러그인**으로 폴백한다. 즉 명령이 엉뚱한 파일로 간다.

반대편 사례가 이미 있었다 — 인스턴스 **생성** 경로는 `expectedFileId` 를 플러그인에 넘겨
파일 경계를 제대로 막고 있었다("컴포넌트 X는 Native Platform 파일에서 등록되었습니다"). 같은
레지스트리를 쓰면서 **생성만 막고 삭제는 안 막은** 비대칭이 결함의 실체다. 되돌리기 비용이
비대칭인 쪽(삭제)이 오히려 열려 있었다.

## 무엇을 했나

### 서버가 "지금 어느 파일인가" 를 알 수 있게 배선을 깔았다

`fileId`(플러그인 root pluginData `sigma-file-id`)는 그때까지 **플러그인 안에만** 있었다.
서버의 `FigmaFileInfo` 에는 `fileKey`/`fileName` 뿐이라 서버는 소유 대조를 할 수 없었다
(그래서 생성 경로는 플러그인에게 대조를 시켰던 것이다). REGISTER · FILE_INFO 메시지에
`fileId` 를 실어 서버가 플러그인별로 보관하게 하고, `getPluginFileId(pluginId)` 로 꺼낸다.

### 삭제 경로를 막았다

- `token` 을 **required** 로 올렸다.
- `pluginId` 를 `deleteFrame` 에 **반드시** 넘긴다.
- 스펙의 `fileId` ≠ 바인딩된 파일의 `fileId` 면 **거부**하고, 응답에 소유 파일명을 싣는다.
  의도적 크로스 파일 삭제는 `allowCrossFile: true` 로만 통과한다.
- 성공 응답에도 `fileName` 을 항상 싣는다(사후에 어디를 지웠는지 남게).

## 되돌리면 안 되는 이유 / 주의

- **`fileId` 가 한쪽이라도 없으면 막지 않는다.** 구버전 플러그인이거나 `fileId` 도입 전에
  등록된 스펙이면 판정이 불가능하다. "확인 불가"를 위반으로 단정하면 정상 삭제까지 죽는다.
  대신 `pluginId` 를 넘기는 것만으로도 파괴적 경로는 닫힌다 — 노드 ID 는 파일 스코프라
  바인딩된 플러그인은 자기 파일 노드만 지울 수 있다.
- **`pluginId` 를 optional 로 흘려보내지 말 것.** 핸들러에 명시적 `if (!pluginId)` 가드를 뒀다.
  타입이 `string | undefined` 라 무심코 넘기면 폴백이 되살아난다 — 이 사고가 정확히 그것이었다.
- **`sigma_list_component_specs` 는 같이 잠그지 않았다.** 읽기는 "다른 파일 스펙을 참고해
  등록" 이라는 정당한 용법이 있고, 응답에 `fileName` 이 실려 호출자가 구분할 수 있다.
- 훅으로는 못 막는다 — 바인딩 정보는 서버에만 있어 훅은 파일 경계를 원리상 볼 수 없다.
