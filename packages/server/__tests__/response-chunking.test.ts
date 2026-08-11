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
