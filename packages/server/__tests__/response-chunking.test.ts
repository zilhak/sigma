import { describe, it, expect, afterAll } from 'bun:test';
import { WebSocket } from 'ws';
import { FigmaWebSocketServer } from '../src/websocket/server';

// 배경: docs/history/021-plugin-to-server-had-no-chunking.md
//
// Bun 의 WebSocket 수신 상한은 16MB 고정이고 `ws` 의 maxPayload 로 올릴 수 없다. 그래서
// 큰 응답을 통짜로 보내면 서버가 프레임을 거부하며 **소켓을 끊고**, 플러그인이 새 pluginId 로
// 재연결해 모든 에이전트의 바인딩이 무효가 됐다. 이 테스트는 그 크기가 청킹으로 통과하는지를
// 실제 소켓 위에서 확인한다 — 상한을 넘는 페이로드가 아니면 회귀를 못 잡는다.

const MB = 1024 * 1024;
const CHUNK = 1 * MB;

/** 플러그인 UI 의 sendToServer 와 같은 규약으로 나눠 보낸다 (bridge-plugin.ts). */
function sendChunked(ws: WebSocket, payload: Record<string, unknown>) {
  const json = JSON.stringify(payload);
  if (json.length <= CHUNK) {
    ws.send(json);
    return;
  }
  const streamId = payload.commandId as string;
  const totalChunks = Math.ceil(json.length / CHUNK);
  ws.send(JSON.stringify({ type: 'RESPONSE_CHUNK_START', streamId, totalChunks, messageType: payload.type, totalLength: json.length }));
  for (let i = 0; i < totalChunks; i++) {
    ws.send(JSON.stringify({ type: 'RESPONSE_CHUNK', streamId, index: i, data: json.slice(i * CHUNK, (i + 1) * CHUNK) }));
  }
  ws.send(JSON.stringify({ type: 'RESPONSE_CHUNK_END', streamId }));
}

interface Harness {
  server: FigmaWebSocketServer;
  client: WebSocket;
  pluginId: string;
  closed: Promise<number>;
}

const harnesses: Harness[] = [];

async function connect(port: number): Promise<Harness> {
  const server = new FigmaWebSocketServer(port);
  const client = new WebSocket(`ws://localhost:${port}`);

  let onClosed: (code: number) => void;
  const closed = new Promise<number>((r) => { onClosed = r; });
  client.on('close', (code) => onClosed(code));

  await new Promise<void>((resolve) => client.on('open', () => resolve()));
  client.send(JSON.stringify({
    type: 'REGISTER', client: 'figma-plugin', fileKey: 'k', fileName: 'f.fig',
    pages: [{ pageId: 'p1', pageName: 'Page' }], pageId: 'p1', pageName: 'Page',
  }));

  const pluginId = await new Promise<string>((resolve) => {
    client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REGISTERED') resolve(msg.pluginId);
    });
  });

  const h = { server, client, pluginId, closed };
  harnesses.push(h);
  return h;
}

afterAll(() => {
  for (const h of harnesses) {
    try { h.client.close(); } catch { /* 이미 닫힘 */ }
    h.server.close();
  }
});

describe('플러그인 → 서버 응답 청킹', () => {
  it('16MB 상한을 넘는 응답이 청킹으로 온전히 도착한다', async () => {
    const h = await connect(19851);

    // 20MB — Bun 수신 상한(16MB)을 확실히 넘는 크기
    const big = 'x'.repeat(20 * MB);
    h.client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'GET_TREE') return;
      sendChunked(h.client, { type: 'GET_TREE_RESULT', commandId: msg.commandId, success: true, result: { blob: big } });
    });

    const result = await h.server.command<{ blob: string }>('GET_TREE', {}, { pluginId: h.pluginId, timeoutMs: 60000 });
    expect(result.blob.length).toBe(20 * MB);
    expect(result.blob).toBe(big);
  }, 60000);

  it('통짜로 보내면 소켓이 끊긴다 — 이 테스트가 청킹의 존재 이유다', async () => {
    const h = await connect(19852);

    h.client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'GET_TREE') return;
      // 일부러 청킹 없이 통짜 전송
      h.client.send(JSON.stringify({ type: 'GET_TREE_RESULT', commandId: msg.commandId, success: true, result: { blob: 'x'.repeat(20 * MB) } }));
    });

    // 소켓이 끊긴 뒤 pending 이 타임아웃으로 정리되는 것까지 기다리므로 짧게 잡는다.
    const pending = h.server.command('GET_TREE', {}, { pluginId: h.pluginId, timeoutMs: 3000 }).catch((e: Error) => e);
    const code = await h.closed;
    expect(code).toBe(1006);   // 정상 종료가 아니라 절단
    await pending;
  }, 30000);

  // 배경: docs/history/023-read-concurrency-did-not-reproduce-the-death.md
  // 실측에서 CHUNK_START 1.9초 뒤에 타임아웃이 터져, 015 가 만들어 준 «부분 결과» 를
  // 호출자가 통째로 못 받았다. 타임아웃은 총 경과가 아니라 «침묵 시간» 을 재야 한다.
  it('청크가 흐르는 동안은 타임아웃이 재설정된다 — 총 경과가 타임아웃을 넘겨도 완주한다', async () => {
    const h = await connect(19854);

    const CHUNKS = 6;
    const GAP = 700;          // 청크 간격
    const TIMEOUT = 1500;     // 총 전송(≈4.2초)보다 훨씬 짧다

    h.client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'GET_TREE') return;
      const json = JSON.stringify({ type: 'GET_TREE_RESULT', commandId: msg.commandId, success: true, result: { n: 'y'.repeat(600) } });
      const size = Math.ceil(json.length / CHUNKS);
      h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK_START', streamId: msg.commandId, totalChunks: CHUNKS, messageType: 'GET_TREE_RESULT' }));
      for (let i = 0; i < CHUNKS; i++) {
        setTimeout(() => {
          h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK', streamId: msg.commandId, index: i, data: json.slice(i * size, (i + 1) * size) }));
          if (i === CHUNKS - 1) h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK_END', streamId: msg.commandId }));
        }, (i + 1) * GAP);
      }
    });

    const t0 = Date.now();
    const result = await h.server.command<{ n: string }>('GET_TREE', {}, { pluginId: h.pluginId, timeoutMs: TIMEOUT });
    const elapsed = Date.now() - t0;

    expect(result.n.length).toBe(600);
    expect(elapsed).toBeGreaterThan(TIMEOUT);   // 총 경과가 타임아웃을 넘겼는데도 성공했다
  }, 30000);

  // 배경: docs/history/023 — 처음엔 해당 streamId 만 연장했더니 실측에서 4개 중 1개만 살았다.
  // 플러그인은 스트림을 순차로 밀기 때문에, 뒤 순번은 «조용한» 게 아니라 «줄 서 있는» 것이다.
  it('형제 스트림이 흐르는 동안 아직 차례가 안 온 명령도 죽지 않는다', async () => {
    const h = await connect(19856);

    const TIMEOUT = 1200;
    const ids: string[] = [];

    h.client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'GET_TREE') return;
      ids.push(msg.commandId);
      if (ids.length < 2) return;      // 둘 다 받은 뒤에 순차로 응답한다

      const send = (commandId: string, tag: string, startAt: number) => {
        const json = JSON.stringify({ type: 'GET_TREE_RESULT', commandId, success: true, result: { tag } });
        const size = Math.ceil(json.length / 4);
        setTimeout(() => h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK_START', streamId: commandId, totalChunks: 4, messageType: 'GET_TREE_RESULT' })), startAt);
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK', streamId: commandId, index: i, data: json.slice(i * size, (i + 1) * size) }));
            if (i === 3) h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK_END', streamId: commandId }));
          }, startAt + (i + 1) * 400);
        }
      };

      // A: 0.4~1.6초에 흐른다. B: A 가 끝난 뒤 2.0초부터 — B 자신의 타임아웃(1.2초)은 이미 지났다.
      send(ids[0], 'A', 0);
      send(ids[1], 'B', 2000);
    });

    const [a, b] = await Promise.all([
      h.server.command<{ tag: string }>('GET_TREE', {}, { pluginId: h.pluginId, timeoutMs: TIMEOUT }),
      h.server.command<{ tag: string }>('GET_TREE', {}, { pluginId: h.pluginId, timeoutMs: TIMEOUT }),
    ]);

    expect(a.tag).toBe('A');
    expect(b.tag).toBe('B');   // 자기 청크는 타임아웃 한참 뒤에 왔지만 A 의 트래픽이 살려 뒀다
  }, 30000);

  it('청크가 멈추면 원래 타임아웃 그대로 발화한다 — 무한 대기가 되지 않는다', async () => {
    const h = await connect(19855);

    h.client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'GET_TREE') return;
      // START 와 청크 하나만 보내고 침묵한다
      h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK_START', streamId: msg.commandId, totalChunks: 3, messageType: 'GET_TREE_RESULT' }));
      h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK', streamId: msg.commandId, index: 0, data: '{"a"' }));
    });

    const t0 = Date.now();
    const err = await h.server.command('GET_TREE', {}, { pluginId: h.pluginId, timeoutMs: 1500 }).catch((e: Error) => e);
    const elapsed = Date.now() - t0;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('시간 초과');
    expect(elapsed).toBeLessThan(5000);   // 연장은 침묵과 함께 끝난다
  }, 30000);

  it('청크가 누락되면 조용히 기다리지 않고 즉시 에러로 끝난다', async () => {
    const h = await connect(19853);

    h.client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'GET_TREE') return;
      // 3개를 예고하고 1개만 보낸 뒤 END
      h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK_START', streamId: msg.commandId, totalChunks: 3, messageType: 'GET_TREE_RESULT' }));
      h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK', streamId: msg.commandId, index: 0, data: '{"partial"' }));
      h.client.send(JSON.stringify({ type: 'RESPONSE_CHUNK_END', streamId: msg.commandId }));
    });

    const err = await h.server.command('GET_TREE', {}, { pluginId: h.pluginId, timeoutMs: 20000 }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('청크가 누락');
    expect((err as Error).message).toContain('1/3');
  }, 30000);
});
