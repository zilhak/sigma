import { WebSocketServer, WebSocket } from 'ws';
import type { ExtractedNode, TreeNode } from '@sigma/shared';

// 1MB 청크 크기
const CHUNK_SIZE = 1024 * 1024;
const CHUNK_THRESHOLD = 1024 * 1024; // 1MB 이상이면 청킹

/**
 * 플러그인 → 서버 수신 메시지가 이 크기를 넘으면 크기를 로그에 남긴다.
 * 이 방향은 아직 청킹이 없어(012 「남은 것」) 통짜 한 메시지로 온다 — 절벽이 어디인지
 * 사후에 따지려면 실제로 얼마가 왔는지가 남아 있어야 한다.
 */
const LARGE_MESSAGE_LOG_THRESHOLD = 1024 * 1024;

/**
 * 인스턴스 누적 통계("궤적")를 남기는 주기. **셋 중 먼저 오는 것**에 발화한다.
 * 배경: docs/history/020-…(궤적이 필요한 이유) · docs/history/022-…(왜 셋인가)
 *
 * 죽는 순간의 한 줄만으로는 «갑자기 죽었나, 서서히 나빠지다 죽었나» 를 가릴 수 없다.
 *
 * ⚠️ **명령 수 하나로 두면 안 된다.** 처음엔 2000 명령마다로만 뒀는데, 020 의
 * 5.5만 명령 마라톤을 기준으로 잡은 값이라 2026-08-13 사망(**1,270 명령 만에** 죽음)
 * 에서는 **한 줄도 찍히지 않았다.** 그 인스턴스는 명령은 적었지만 10분 동안 576MB 를
 * 받아냈다 — 즉 부하의 축이 «횟수» 가 아니라 «양» 인 경우가 실재한다.
 * 시간 조건은 둘 다 느린 경우의 바닥이다(명령이 아예 없으면 발화하지 않는다 —
 * 이 판정은 명령을 보낼 때만 돌기 때문이다. 놀고 있는 플러그인은 로그를 만들지 않는다).
 */
const LIFETIME_LOG_EVERY_COMMANDS = 2000;
const LIFETIME_LOG_EVERY_BYTES = 100 * 1024 * 1024;
const LIFETIME_LOG_EVERY_MS = 5 * 60 * 1000;

/** 사후 진단용으로 들고 있는 최근 종료 기록 수 (메모리 유계). */
const DISCONNECT_HISTORY = 8;

/**
 * 플러그인 → 서버 응답 청킹 (`RESPONSE_CHUNK_*`).
 * 배경: docs/history/021-plugin-to-server-had-no-chunking.md
 *
 * ⚠️ **서버→플러그인 방향의 `CHUNK_*` 와 다른 이름이다.** 한 소켓에 두 방향이 흐르므로
 * 이름을 공유하면 어느 쪽 스트림인지 구분할 수 없다.
 */
const RESPONSE_CHUNK_START = 'RESPONSE_CHUNK_START';
const RESPONSE_CHUNK = 'RESPONSE_CHUNK';
const RESPONSE_CHUNK_END = 'RESPONSE_CHUNK_END';

/**
 * 조립 상한. 넘으면 스트림을 버리고 그 명령을 **에러로 끝낸다**.
 *
 * 청킹이 생겼다고 무한히 받아도 되는 것은 아니다 — 이 값이 없으면 깨진 스트림 하나가
 * 서버 힙을 계속 먹는다. 조용히 버리지 않고 pending 을 깨우는 것이 핵심이다
 * (012: 응답이 안 오면 60초 타임아웃이 «느리다» 로 잘못 보고한다).
 */
const RESPONSE_ASSEMBLY_LIMIT = 256 * 1024 * 1024;

/**
 * 응답이 **오는 중이면** 타임아웃을 청크마다 다시 건다. 상한은 원래 타임아웃의 이 배수.
 * 배경: docs/history/023-read-concurrency-did-not-reproduce-the-death.md
 *
 * 타임아웃은 «총 경과» 가 아니라 «침묵 시간» 을 재야 한다. 실측(2026-08-13):
 * 전수 트리 4개 동시 → 순회는 예산(55초)에 맞춰 멈추고 `timedOut` 부분 결과를 만들었는데,
 * **직렬화+청킹+전송에 80초가 더** 걸렸다. CHUNK_START 는 07:53:14.54 에 왔고 서버는
 * 07:53:16.46 에 포기했다 — **청크가 흐르기 시작한 1.9초 뒤에 죽인 것이다.**
 * 그래서 호출자는 015 가 만들어 준 «부분 결과» 를 받지 못하고 아무것도 못 받았다.
 *
 * ⚠️ 무한 연장은 안 된다. 진짜로 못 끝내는 요청이 영원히 매달린다 — 그래서 절대 상한을 둔다.
 */
const STREAM_TIMEOUT_MAX_FACTOR = 5;

interface ResponseStream {
  streamId: string;
  messageType?: string;
  totalChunks: number;
  parts: Map<number, string>;
  bytes: number;
  startedAt: number;
}

/**
 * 페이지 정보
 */
export interface PageInfo {
  pageId: string;
  pageName: string;
}

/**
 * Figma 파일 정보 (내부용)
 */
interface FigmaFileInfo {
  fileKey: string | null;
  /**
   * 파일별 안정 ID (플러그인 root pluginData `sigma-file-id`).
   * 컴포넌트 스펙 레코드의 `fileId` 와 대조해 "이 스펙이 지금 바인딩된 파일 것인가" 를 판정한다.
   * 구버전 플러그인은 보내지 않으므로 optional — 없으면 검사를 건너뛴다(막지 않는다).
   */
  fileId?: string;
  fileName: string;
  pages: PageInfo[];          // 전체 페이지 목록
  currentPageId: string;      // 현재 열린 페이지
  currentPageName: string;
}

/**
 * 한 플러그인 인스턴스가 살아 있는 동안의 누적 사용량.
 * 배경: docs/history/020-plugin-vm-aborted-after-a-long-lived-session.md
 */
interface PluginStats {
  commands: number;
  byType: Map<string, number>;
  /** 플러그인 → 서버 수신 누적 바이트 */
  bytesIn: number;
  rttTotalMs: number;
  rttCount: number;
  /** 직전 궤적 구간의 왕복시간 (구간마다 초기화 — 궤적을 보려면 누적 평균으로는 안 된다) */
  windowRttMs: number;
  windowRttCount: number;
  lastCommandType?: string;
  lastCommandAt?: number;
  /** 궤적 로그 발화 판정용 기준점 (셋 중 먼저 오는 것) */
  lastLifetimeLogAt: number;
  lastLifetimeLogCommands: number;
  lastLifetimeLogBytes: number;
  /**
   * 동시에 처리 중이던 명령의 **최고치**. 022 사망의 사인에 가장 가까운 숫자가
   * `pending: 6` 이었는데, 그건 죽는 순간의 값이라 «언제 어디까지 갔나» 를 알 수 없었다.
   */
  peakPending: number;
  peakPendingAt?: number;
}

/**
 * 궤적 로그를 지금 남겨야 하는가. 순수 함수라 유닛테스트가 가능하다.
 * 배경: docs/history/022-lifetime-log-never-fired-and-peak-was-invisible.md
 */
export function shouldLogLifetime(
  s: Pick<PluginStats, 'commands' | 'bytesIn' | 'lastLifetimeLogAt' | 'lastLifetimeLogCommands' | 'lastLifetimeLogBytes'>,
  now: number,
): boolean {
  return (
    s.commands - s.lastLifetimeLogCommands >= LIFETIME_LOG_EVERY_COMMANDS ||
    s.bytesIn - s.lastLifetimeLogBytes >= LIFETIME_LOG_EVERY_BYTES ||
    now - s.lastLifetimeLogAt >= LIFETIME_LOG_EVERY_MS
  );
}

/**
 * 종료 기록 → 사람이 읽는 안내 문장. 순수 함수라 유닛테스트가 가능하다.
 * 배경: docs/history/020-plugin-vm-aborted-after-a-long-lived-session.md
 */
export function formatPluginLossHint(record: PluginDisconnectRecord | undefined, now: number): string {
  const restart = 'Figma 에서 Sigma 플러그인을 다시 실행한 뒤, sigma_list_plugins 로 새 pluginId 를 받아 sigma_bind 로 다시 바인딩하세요 (재연결마다 pluginId 가 바뀝니다).';
  if (!record) return restart;

  const agoMin = Math.round((now - record.at) / 60000);
  const when = agoMin < 1 ? '방금' : `${agoMin}분 전`;
  // code 1001(going away) = Figma 가 플러그인을 내렸다. 런타임이 abort 된 뒤의 정리도 이 코드로
  // 온다(020 실측). 1006 은 비정상 절단. 둘 다 «죽었을 수 있다» 를 말해야 하는 경우다.
  const died = record.code === 1001 || record.code === 1006
    ? ' 플러그인 런타임이 죽었을 수 있습니다 (Figma 콘솔에 "Plugin runtime aborted" 가 있으면 확정입니다).'
    : '';
  const lived = record.livedSec >= 3600
    ? `${(record.livedSec / 3600).toFixed(1)}시간`
    : `${Math.round(record.livedSec / 60)}분`;
  return (
    `플러그인(${record.pluginId})이 ${when} 끊겼습니다 — close code ${record.code}` +
    `${record.reason ? ` (${record.reason})` : ''}, 수명 ${lived}, 처리한 명령 ${record.commands}건.${died} ${restart}`
  );
}

/**
 * 플러그인 (내부용)
 */
interface Plugin {
  id: string;  // 고유 플러그인 ID (pluginId)
  ws: WebSocket;
  type: 'figma-plugin' | 'unknown';
  connectedAt: Date;
  fileInfo?: FigmaFileInfo;
  stats: PluginStats;
  /** 조립 중인 응답 스트림 (streamId 별). 소켓이 닫히면 통째로 버려진다 — 021 */
  responseStreams: Map<string, ResponseStream>;
}

/**
 * 끊긴 플러그인의 부검 기록.
 *
 * 이걸 들고 있는 이유는 로그가 아니라 **오류 메시지** 때문이다. 플러그인이 죽으면 호출자가
 * 보는 것은 «연결되어 있지 않습니다» 뿐이고, 그건 "아직 안 켰다" 와 구분되지 않는다.
 * 죽은 정황(언제·close code·얼마나 살았고 몇 개를 처리했나)을 그 자리에서 같이 보여준다.
 */
export interface PluginDisconnectRecord {
  pluginId: string;
  at: number;
  code: number;
  reason?: string;
  livedSec: number;
  commands: number;
  bytesIn: number;
  lastCommandType?: string;
  /** 마지막 명령을 보내고 끊기기까지 (ms). 짧을수록 «그 명령을 처리하다 죽었다» 에 가깝다. */
  msSinceLastCommand?: number;
  fileName?: string;
  /** 살아 있는 동안의 동시 처리 최고치와 그 시각 — 022 */
  peakPending: number;
  peakPendingAt?: number;
  /** 평균 왕복시간 (ms). 정상 40ms 대가 1000ms 를 넘었다면 그 자체가 신호다. */
  avgRttMs: number;
}

/**
 * 플러그인 정보 (외부 노출용)
 */
export interface FigmaPluginInfo {
  pluginId: string;
  fileKey: string | null;
  fileName: string;
  pages: PageInfo[];
  currentPageId: string;
  currentPageName: string;
  connectedAt: Date;
}

/**
 * 프레임 생성 결과 — 플러그인이 실제로 만든 노드다.
 *
 * ⚠️ 이 값을 응답에 실어야 하는 이유: 예전에는 `Promise<void>` 였고 MCP 응답은 "생성되었습니다"
 * 와 **요청받은 pageId 를 되울린** 문장이었다. 그래서 아무것도 만들어지지 않아도 성공으로 보였다.
 */
export interface CreateFrameResult {
  nodeId: string;
  name: string;
  childCount: number;
  pageName: string;
}

/**
 * 플러그인 ID 생성기
 */
function generatePluginId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `figma-${timestamp}-${random}`;
}

interface PendingCommand {
  id: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  /** 왕복시간 집계용 (020). 없으면 집계만 건너뛴다. */
  pluginId?: string;
  sentAt?: number;
  /** 아래 넷은 «오는 중이면 기다린다» 연장용 (023). 없으면 연장하지 않는다. */
  commandType?: string;
  timeoutMs?: number;
  fireTimeout?: () => void;
  hardDeadline?: number;
  extensions?: number;
  /** 「연장이 실제로 살려냈다」 로그를 한 번만 남기기 위한 표시 */
  loggedRescue?: boolean;
}

export class FigmaWebSocketServer {
  private wss: WebSocketServer;
  private plugins: Map<WebSocket, Plugin> = new Map();
  private pluginsById: Map<string, Plugin> = new Map();  // ID로 플러그인 조회
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  /** 최근 종료 기록 (최신이 앞). 최대 DISCONNECT_HISTORY 개 — 020 */
  private disconnects: PluginDisconnectRecord[] = [];

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocket] Server error:', error);
    });

    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.pingPlugins();
    }, 30000);

    console.log(`[WebSocket] Server listening on port ${port}`);
  }

  private handleConnection(ws: WebSocket) {
    const pluginId = generatePluginId();
    const plugin: Plugin = {
      id: pluginId,
      ws,
      type: 'unknown',
      connectedAt: new Date(),
      stats: {
        commands: 0,
        byType: new Map(),
        bytesIn: 0,
        rttTotalMs: 0,
        rttCount: 0,
        windowRttMs: 0,
        windowRttCount: 0,
        lastLifetimeLogAt: Date.now(),
        lastLifetimeLogCommands: 0,
        lastLifetimeLogBytes: 0,
        peakPending: 0,
      },
      responseStreams: new Map(),
    };

    this.plugins.set(ws, plugin);
    console.log(`[WebSocket] Plugin connected (id: ${pluginId})`);

    ws.on('message', (data) => {
      try {
        const text = data.toString();
        plugin.stats.bytesIn += Buffer.byteLength(text, 'utf-8');
        const message = JSON.parse(text);

        // 응답 청킹은 handleMessage 앞에서 걷어낸다 — 조립이 끝나야 비로소 하나의 메시지다 (021).
        if (this.handleResponseChunk(plugin, message)) return;

        // 큰 응답은 크기를 남긴다. 012 에서 `GET_NODES_INFO` 에 **개수**가 안 남아 1차 진단이
        // 통째로 빗나갔고, 015 두 번째 사고에서는 **크기**가 안 남아 트리 응답이 몇 MB 인지를
        // 표본에서 환산해야 했다. 절벽이 크기에 있는 이상 크기는 로그에 있어야 한다.
        if (text.length >= LARGE_MESSAGE_LOG_THRESHOLD) {
          const mb = (Buffer.byteLength(text, 'utf-8') / 1024 / 1024).toFixed(2);
          console.log(`[WebSocket] Large response from ${plugin.id}: ${message.type} ${mb}MB`);
        }
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('[WebSocket] Message parse error:', error);
      }
    });

    // ⚠️ code·reason 을 반드시 받는다. 예전엔 `() => {}` 라 로그가 "Plugin disconnected" 한 줄뿐이었고,
    // 그래서 **정상 종료(1000/1001 = Figma 가 플러그인을 내림)인지, 비정상 절단(1006)인지,
    // 크기 위반(1009)인지 구분할 방법이 없었다.** 015 두 번째 사고를 이 한 줄이 없어서 못 닫았다.
    ws.on('close', (code, reason) => {
      const closingPlugin = this.plugins.get(ws);
      if (closingPlugin) {
        this.pluginsById.delete(closingPlugin.id);
        this.recordDisconnect(closingPlugin, code, reason && reason.length > 0 ? reason.toString() : undefined);
      }
      this.plugins.delete(ws);
    });

    ws.on('error', (error) => {
      const errorPlugin = this.plugins.get(ws);
      console.error(`[WebSocket] Plugin error (id: ${errorPlugin ? errorPlugin.id : 'unknown'}):`, error);
      if (errorPlugin) {
        this.pluginsById.delete(errorPlugin.id);
      }
      this.plugins.delete(ws);
    });
  }

  /**
   * 플러그인 → 서버 응답 청킹을 조립한다. 이 메시지를 소화했으면 true.
   * 배경: docs/history/021-plugin-to-server-had-no-chunking.md
   *
   * ⚠️ **실패는 반드시 pending 을 깨워서 끝낸다.** 조용히 버리면 호출자는 60초를 기다린 뒤
   * «응답 시간 초과» 만 보고, 그건 012 에서 «느리다» 로 오진했던 바로 그 모양이다.
   */
  private handleResponseChunk(plugin: Plugin, message: { type?: string; [key: string]: unknown }): boolean {
    const streamId = message.streamId as string | undefined;
    if (message.type === RESPONSE_CHUNK_START) {
      if (!streamId) return true;
      this.extendPendingWhileStreaming(plugin);
      plugin.responseStreams.set(streamId, {
        streamId,
        messageType: message.messageType as string | undefined,
        totalChunks: (message.totalChunks as number) || 0,
        parts: new Map(),
        bytes: 0,
        startedAt: Date.now(),
      });
      return true;
    }

    if (message.type === RESPONSE_CHUNK) {
      if (!streamId) return true;
      const stream = plugin.responseStreams.get(streamId);
      if (!stream) {
        console.warn(`[WebSocket] Orphan response chunk from ${plugin.id} (stream: ${streamId})`);
        return true;
      }
      this.extendPendingWhileStreaming(plugin);
      const part = (message.data as string) || '';
      stream.parts.set((message.index as number) || 0, part);
      stream.bytes += Buffer.byteLength(part, 'utf-8');
      if (stream.bytes > RESPONSE_ASSEMBLY_LIMIT) {
        plugin.responseStreams.delete(streamId);
        const mb = (stream.bytes / 1024 / 1024).toFixed(1);
        console.error(`[WebSocket] Response stream too large from ${plugin.id}: ${stream.messageType} ${mb}MB — dropped`);
        this.failPending(streamId, `플러그인 응답이 조립 상한(${RESPONSE_ASSEMBLY_LIMIT / 1024 / 1024}MB)을 넘었습니다 (${stream.messageType}, ${mb}MB). 범위를 좁혀 다시 호출하세요.`);
      }
      return true;
    }

    if (message.type === RESPONSE_CHUNK_END) {
      if (!streamId) return true;
      const stream = plugin.responseStreams.get(streamId);
      if (!stream) return true;
      plugin.responseStreams.delete(streamId);

      if (stream.parts.size !== stream.totalChunks) {
        console.error(`[WebSocket] Response stream incomplete from ${plugin.id}: ${stream.parts.size}/${stream.totalChunks}`);
        this.failPending(streamId, `플러그인 응답 청크가 누락됐습니다 (${stream.parts.size}/${stream.totalChunks})`);
        return true;
      }

      let assembled = '';
      for (let i = 0; i < stream.totalChunks; i++) assembled += stream.parts.get(i) ?? '';

      const mb = (stream.bytes / 1024 / 1024).toFixed(2);
      const ms = Date.now() - stream.startedAt;
      console.log(`[WebSocket] Reassembled response from ${plugin.id}: ${stream.messageType} ${mb}MB in ${stream.totalChunks} chunks (${ms}ms)`);

      try {
        this.handleMessage(plugin.ws, JSON.parse(assembled));
      } catch (error) {
        console.error(`[WebSocket] Response stream parse error from ${plugin.id}:`, error);
        this.failPending(streamId, `플러그인 응답을 조립했으나 파싱에 실패했습니다: ${error}`);
      }
      return true;
    }

    return false;
  }

  /**
   * 응답이 오는 중이라는 증거(청크)를 받았으니 타임아웃을 다시 건다 — 023.
   *
   * ⚠️ 이것을 «타임아웃을 늘리는 우회» 로 읽지 말 것. 늘리는 게 아니라 **재는 대상을 바꾼다** —
   * 총 경과가 아니라 침묵 시간이다. 청크가 멈추면 원래 타임아웃 그대로 발화한다.
   *
   * ⚠️ **그 스트림 하나가 아니라 그 플러그인의 대기 명령 전부를 연장한다.** 처음엔 해당
   * `streamId` 만 연장했는데, 실측에서 4개 중 **1개만 살았다**:
   * ```
   * 10:01:34.60  GET_TREE ×4 전송           → 각자 60초 타임아웃 = 10:02:34.6
   * 10:02:32.61  1번 CHUNK_START → 연장 → 생존
   * 10:02:34.6   2·3·4번 타임아웃 발화       ← 아직 자기 청크 차례가 아니었다
   * 10:02:40.6~41.0  2·3·4번 응답 도착 — 이미 거절된 뒤
   * ```
   * 플러그인은 `sendToServer` 에서 한 스트림의 청크를 통째로 밀어내므로 스트림이 **순차**다.
   * 즉 «그 명령이 조용하다» 는 그 명령이 막혔다는 증거가 아니라 **형제 뒤에 줄 서 있다**는 뜻이고,
   * 타임아웃이 실제로 재려는 것은 «플러그인이 살아 있나» 다. 청크가 흐르는 동안 그 플러그인의
   * 대기 명령은 전부 살아 있다. (명령별 절대 상한 `hardDeadline` 은 각자 그대로 적용된다.)
   */
  private extendPendingWhileStreaming(plugin: Plugin): void {
    const now = Date.now();
    for (const pending of this.pendingCommands.values()) {
      if (pending.pluginId !== plugin.id) continue;
      if (!pending.fireTimeout || pending.timeoutMs === undefined) continue;
      if (pending.hardDeadline !== undefined && now >= pending.hardDeadline) continue;
      this.refreshOne(pending, plugin, now);
    }
  }

  private refreshOne(pending: PendingCommand, plugin: Plugin, now: number): void {
    if (!pending.fireTimeout || pending.timeoutMs === undefined) return;
    clearTimeout(pending.timeout);
    pending.timeout = setTimeout(pending.fireTimeout, pending.timeoutMs);
    pending.extensions = (pending.extensions ?? 0) + 1;

    // ⚠️ **연장이 실제로 살려낸 경우에만** 남긴다 — 「경과 > 원래 타임아웃」.
    // 연장 자체는 1MB 넘는 모든 응답에서 일상적으로 일어나므로(청크가 흐르면 무조건 걸린다),
    // 첫 연장마다 찍으면 «이 줄이 떴다» 가 아무것도 뜻하지 않게 된다. 실측에서 정상 호출인
    // N=1(21초 경과 / 타임아웃 60초)도 이 줄을 찍었다. 022 가 «축이 하나라 안 찍힘» 을
    // 고친 것의 반대 실패다 — 너무 찍혀서 진짜 신호가 묻히는 쪽.
    const waited = pending.sentAt !== undefined ? now - pending.sentAt : 0;
    if (waited > pending.timeoutMs && !pending.loggedRescue) {
      pending.loggedRescue = true;
      console.log(
        `[WebSocket] Response still streaming from ${plugin.id}: ${pending.commandType} — ` +
        `원래 타임아웃(${pending.timeoutMs}ms)을 넘겼으나 응답이 오는 중이라 기다립니다 ` +
        `(${waited}ms 경과, 연장 ${pending.extensions}회, 상한 ${pending.hardDeadline !== undefined ? pending.hardDeadline - (pending.sentAt ?? 0) : '?'}ms)`
      );
    }
  }

  /** streamId 는 commandId 와 같으므로(응답 청킹) 그대로 pending 을 깨울 수 있다 — 021 */
  private failPending(commandId: string, reason: string): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingCommands.delete(commandId);
    pending.reject(new Error(reason));
  }

  /**
   * 종료를 로그와 기록 양쪽에 남긴다.
   * 배경: docs/history/020-plugin-vm-aborted-after-a-long-lived-session.md
   *
   * ⚠️ 여기서 남기는 항목을 줄이지 말 것. 020 의 사망은 «마지막 명령이 무거워서» 가 아니라
   * «이 인스턴스가 오래 살아서» 쪽이었는데, 그 판단에 필요한 것(수명·누적 명령 수·누적 수신량·
   * 마지막 명령과의 간격)이 전부 로그 밖에 있어서 컨테이너 로그를 5.5만 줄 세어야 했다.
   */
  private recordDisconnect(plugin: Plugin, code: number, reason?: string): void {
    const now = Date.now();
    const s = plugin.stats;
    const record: PluginDisconnectRecord = {
      pluginId: plugin.id,
      at: now,
      code,
      reason,
      livedSec: Math.round((now - plugin.connectedAt.getTime()) / 1000),
      commands: s.commands,
      bytesIn: s.bytesIn,
      lastCommandType: s.lastCommandType,
      msSinceLastCommand: s.lastCommandAt !== undefined ? now - s.lastCommandAt : undefined,
      fileName: plugin.fileInfo?.fileName,
      peakPending: s.peakPending,
      peakPendingAt: s.peakPendingAt,
      avgRttMs: this.avgRtt(s),
    };
    this.disconnects.unshift(record);
    if (this.disconnects.length > DISCONNECT_HISTORY) this.disconnects.length = DISCONNECT_HISTORY;

    const why = reason ? `, reason: ${reason}` : '';
    const last = record.lastCommandType
      ? `, last: ${record.lastCommandType} ${record.msSinceLastCommand}ms ago`
      : '';
    const pending = this.countPendingFor(plugin.id);
    // 최고치는 «언제» 가 함께 있어야 쓸모가 있다 — 죽기 직전에 찍힌 피크와 30분 전 피크는
    // 전혀 다른 이야기다 (022).
    const peakAgo = record.peakPendingAt !== undefined ? `, peak: ${s.peakPending} (${Math.round((now - record.peakPendingAt) / 1000)}s ago)` : '';
    console.log(
      `[WebSocket] Plugin disconnected (id: ${plugin.id}, code: ${code}${why}, lived: ${record.livedSec}s, ` +
      `commands: ${s.commands}, in: ${(s.bytesIn / 1024 / 1024).toFixed(1)}MB, avg rtt: ${this.avgRtt(s)}ms${last}, pending: ${pending}${peakAgo})`
    );
    if (s.byType.size > 0) {
      const top = [...s.byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([type, n]) => `${type}×${n}`).join(' ');
      console.log(`[WebSocket]   ↳ lifetime commands (id: ${plugin.id}): ${top}`);
    }
  }

  private avgRtt(s: PluginStats): number {
    return s.rttCount > 0 ? Math.round(s.rttTotalMs / s.rttCount) : 0;
  }

  private countPendingFor(pluginId: string): number {
    let n = 0;
    for (const pending of this.pendingCommands.values()) {
      if (pending.pluginId === pluginId) n++;
    }
    return n;
  }

  /**
   * 최근에 죽은 플러그인의 정황을 사람이 읽는 문장으로 만든다.
   *
   * 「연결되어 있지 않습니다」만으로는 **아직 안 켠 것**과 **죽은 것**이 구분되지 않는다.
   * 020 에서 플러그인은 하루 넘게 재연결되지 않았고, 그 사이 호출자가 볼 수 있는 단서는
   * 서버 컨테이너 로그뿐이었다. 그건 에이전트가 볼 수 없는 자리다.
   */
  describePluginLoss(pluginId?: string): string {
    const record = pluginId
      ? this.disconnects.find((d) => d.pluginId === pluginId)
      : this.disconnects[0];
    return formatPluginLossHint(record, Date.now());
  }

  /** 최근 종료 기록 (진단·상태 조회용) */
  getRecentDisconnects(): PluginDisconnectRecord[] {
    return [...this.disconnects];
  }

  private handleMessage(ws: WebSocket, message: { type: string; [key: string]: unknown }) {
    const plugin = this.plugins.get(ws);
    if (!plugin) return;

    switch (message.type) {
      case 'REGISTER':
        if (message.client === 'figma-plugin') {
          plugin.type = 'figma-plugin';
          // pluginsById 맵에 추가
          this.pluginsById.set(plugin.id, plugin);
          // 파일 정보가 함께 왔으면 저장
          if (message.fileKey !== undefined) {
            plugin.fileInfo = {
              fileKey: message.fileKey as string | null,
              fileId: message.fileId as string | undefined,
              fileName: message.fileName as string,
              pages: (message.pages as PageInfo[]) || [],
              currentPageId: message.pageId as string || message.currentPageId as string,
              currentPageName: message.pageName as string || message.currentPageName as string,
            };
            console.log(`[WebSocket] Figma Plugin registered (id: ${plugin.id}, file: ${plugin.fileInfo.fileName}, page: ${plugin.fileInfo.currentPageName})`);
          } else {
            console.log(`[WebSocket] Figma Plugin registered (id: ${plugin.id})`);
          }
          // 플러그인에게 할당된 ID 알림
          ws.send(JSON.stringify({
            type: 'REGISTERED',
            pluginId: plugin.id,
          }));
        }
        break;

      case 'FILE_INFO':
        // 파일 정보 업데이트 (페이지 목록 포함)
        plugin.fileInfo = {
          fileKey: message.fileKey as string | null,
          fileId: message.fileId as string | undefined,
          fileName: message.fileName as string,
          pages: (message.pages as PageInfo[]) || [],
          currentPageId: message.pageId as string || message.currentPageId as string,
          currentPageName: message.pageName as string || message.currentPageName as string,
        };
        console.log(`[WebSocket] File info updated (id: ${plugin.id}, file: ${plugin.fileInfo.fileName}, pages: ${plugin.fileInfo.pages.length})`);
        break;

      case 'PONG':
        // Plugin is alive
        break;

      case 'RESULT':
        // ⚠️ 'RESULT' 는 '_RESULT' 로 끝나지 않아 아래 default 가 잡지 못한다 — 그래서 이것만 명시한다.
        // 청크 전송 완료 응답(ui/chunk-handler.ts)이 이 타입으로 온다.
        this.resolveCommandResult(message as { type: string; commandId?: string; success?: boolean; error?: string; result?: unknown; frames?: unknown });
        break;

      default:
        // 자동 결과 패스스루: _RESULT로 끝나고 commandId가 있는 메시지는 자동으로 resolve.
        // ⚠️ 새 명령을 추가할 때 여기 case 라벨을 늘릴 필요가 없다 — 예전엔 64개가 나열돼
        // 있었지만 전부 이 분기가 똑같이 처리하던 것이라 지웠다.
        if (message.type?.endsWith('_RESULT') && message.commandId) {
          this.resolveCommandResult(message as { type: string; commandId?: string; success?: boolean; error?: string; result?: unknown; frames?: unknown });
        }
        break;
    }
  }

  private pingPlugins() {
    for (const [ws] of this.plugins) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' }));
      }
    }
  }

  // Check if Figma plugin is connected
  isFigmaConnected(): boolean {
    for (const plugin of this.plugins.values()) {
      if (plugin.type === 'figma-plugin' && plugin.ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  // Get plugin by ID
  getPluginById(pluginId: string): Plugin | undefined {
    return this.pluginsById.get(pluginId);
  }

  /**
   * 그 플러그인이 열고 있는 파일의 안정 ID.
   * 구버전 플러그인이거나 아직 파일 정보를 못 받았으면 undefined — 호출자는
   * "확인 불가" 로 다뤄야 한다(다른 파일이라고 단정하지 말 것).
   */
  getPluginFileId(pluginId: string): string | undefined {
    return this.pluginsById.get(pluginId)?.fileInfo?.fileId;
  }

  // Get connected Figma plugins info (외부 노출용)
  getPluginsInfo(): FigmaPluginInfo[] {
    const plugins: FigmaPluginInfo[] = [];
    for (const plugin of this.pluginsById.values()) {
      if (plugin.type === 'figma-plugin' && plugin.ws.readyState === WebSocket.OPEN) {
        plugins.push({
          pluginId: plugin.id,
          fileKey: plugin.fileInfo?.fileKey ?? null,
          fileName: plugin.fileInfo?.fileName ?? 'Unknown',
          pages: plugin.fileInfo?.pages ?? [],
          currentPageId: plugin.fileInfo?.currentPageId ?? '',
          currentPageName: plugin.fileInfo?.currentPageName ?? 'Unknown',
          connectedAt: plugin.connectedAt,
        });
      }
    }
    return plugins;
  }

  // Resolve target plugin - ID가 주어지면 해당 플러그인, 아니면 첫 번째 플러그인
  private resolveTargetPlugin(pluginId?: string): Plugin | null {
    if (pluginId) {
      const plugin = this.pluginsById.get(pluginId);
      if (plugin && plugin.ws.readyState === WebSocket.OPEN) {
        return plugin;
      }
      return null;  // 지정된 ID가 없거나 연결 끊김
    }
    // pluginId 미지정 시 첫 번째 연결된 플러그인
    for (const plugin of this.pluginsById.values()) {
      if (plugin.type === 'figma-plugin' && plugin.ws.readyState === WebSocket.OPEN) {
        return plugin;
      }
    }
    return null;
  }

  /**
   * 공통 커맨드 전송 헬퍼
   * resolveTarget → commandId 생성 → Promise + timeout → ws.send 패턴을 통합
   */
  private sendCommand<T>(
    commandType: string,
    payload: Record<string, unknown>,
    options?: {
      pluginId?: string;
      timeoutMs?: number;
      logSuffix?: string;
    }
  ): Promise<T> {
    const targetPlugin = this.resolveTargetPlugin(options?.pluginId);
    if (!targetPlugin) {
      if (options?.pluginId) {
        throw new Error(`지정된 플러그인(${options.pluginId})이 연결되어 있지 않습니다. ${this.describePluginLoss(options.pluginId)}`);
      }
      throw new Error(`Figma Plugin이 연결되어 있지 않습니다. ${this.describePluginLoss()}`);
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = options?.timeoutMs ?? 30000;
    const sentAt = Date.now();
    this.countCommand(targetPlugin, commandType, sentAt);

    return new Promise<T>((resolve, reject) => {
      const fireTimeout = () => {
        const pending = this.pendingCommands.get(commandId);
        this.pendingCommands.delete(commandId);
        // 타임아웃 시점의 플러그인 생사는 진단에 결정적이다 — 012 는 «느리다» 로 보고된 것이
        // 사실 «이미 죽었다» 였고, 그 착각이 처방을 통째로 틀리게 했다.
        const alive = this.getPluginById(targetPlugin.id) !== null;
        const waited = Date.now() - sentAt;
        const streamed = pending && pending.extensions ? ` — 응답이 ${pending.extensions}회 연장되도록 오는 중이었으나 상한(${STREAM_TIMEOUT_MAX_FACTOR}배)을 넘겼습니다. 범위를 좁혀(nodeId 스코프·limit·fields) 다시 호출하세요.` : '';
        reject(new Error(
          alive
            ? `Figma Plugin 응답 시간 초과 (${commandType}, ${waited}ms 대기)${streamed}`
            : `Figma Plugin 응답 시간 초과 (${commandType}, ${waited}ms 대기) — 기다리는 동안 플러그인 연결이 끊겼습니다. ${this.describePluginLoss(targetPlugin.id)}`
        ));
      };

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout: setTimeout(fireTimeout, timeoutMs),
        pluginId: targetPlugin.id,
        sentAt,
        commandType,
        timeoutMs,
        fireTimeout,
        hardDeadline: sentAt + timeoutMs * STREAM_TIMEOUT_MAX_FACTOR,
        extensions: 0,
      });

      // payload에서 예약 필드(type, commandId) 제거 — 덮어쓰기 방지
      const { type: _t, commandId: _c, ...safePayload } = payload as Record<string, unknown>;
      const message = JSON.stringify({
        type: commandType,
        commandId,
        ...safePayload,
      });

      const suffix = options?.logSuffix ?? '';
      console.log(`[WebSocket] Sending ${commandType} to ${targetPlugin.id}${suffix}`);
      targetPlugin.ws.send(message);
    });
  }

  /**
   * 플러그인에 명령을 보낸다 (핸들러가 쓰는 공개 진입점).
   *
   * ⚠️ commandType 은 code.ts 의 `case '<kebab>'` 와 1:1로 맞아야 한다.
   * UI 브리지의 제네릭 패스스루(`ui/bridge-server.ts` default)가
   * UPPER_SNAKE → kebab-case 로 바꿔 그대로 전달하기 때문이다.
   *
   * payload 의 필드는 그대로 WebSocket 메시지가 된다. 예약 필드(type/commandId)는
   * sendCommand 가 제거하므로 덮어쓸 걱정은 없다.
   *
   * 이 메서드가 있기 전에는 명령마다 `return this.sendCommand('X', args, {pluginId})`
   * 한 줄짜리 공개 래퍼를 하나씩 늘려야 했다(76개까지 늘었다). sendCommand 가
   * private 이라 핸들러가 직접 부를 수 없었던 것이 유일한 이유였다.
   */
  command<T = unknown>(
    commandType: string,
    payload: Record<string, unknown>,
    options?: { pluginId?: string; timeoutMs?: number; logSuffix?: string }
  ): Promise<T> {
    return this.sendCommand<T>(commandType, payload, options);
  }

  /**
   * 명령 1건을 그 인스턴스의 수명 통계에 반영하고, 주기마다 궤적을 남긴다.
   * 배경: docs/history/020-plugin-vm-aborted-after-a-long-lived-session.md
   */
  private countCommand(plugin: Plugin, commandType: string, sentAt: number): void {
    const s = plugin.stats;
    s.commands++;
    s.byType.set(commandType, (s.byType.get(commandType) ?? 0) + 1);
    s.lastCommandType = commandType;
    s.lastCommandAt = sentAt;

    // 이 명령은 아직 pendingCommands 에 들어가기 전이므로 +1 한다 (호출 순서에 의존한다).
    const inFlight = this.countPendingFor(plugin.id) + 1;
    if (inFlight > s.peakPending) {
      s.peakPending = inFlight;
      s.peakPendingAt = sentAt;
    }

    if (!shouldLogLifetime(s, sentAt)) return;
    const livedSec = Math.round((sentAt - plugin.connectedAt.getTime()) / 1000);
    const windowRtt = s.windowRttCount > 0 ? Math.round(s.windowRttMs / s.windowRttCount) : 0;
    console.log(
      `[WebSocket] Plugin lifetime (id: ${plugin.id}, commands: ${s.commands}, lived: ${livedSec}s, ` +
      `in: ${(s.bytesIn / 1024 / 1024).toFixed(1)}MB, avg rtt: ${this.avgRtt(s)}ms, recent rtt: ${windowRtt}ms, ` +
      `in-flight: ${inFlight}, peak: ${s.peakPending})`
    );
    s.windowRttMs = 0;
    s.windowRttCount = 0;
    s.lastLifetimeLogAt = sentAt;
    s.lastLifetimeLogCommands = s.commands;
    s.lastLifetimeLogBytes = s.bytesIn;
  }

  /**
   * 커맨드 결과 메시지 공통 처리
   * commandId로 pendingCommand를 찾아 resolve/reject 수행
   */
  private resolveCommandResult(
    message: { type: string; commandId?: string; success?: boolean; error?: string; result?: unknown; frames?: unknown; [key: string]: unknown },
  ): void {
    const commandId = message.commandId as string;
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingCommands.delete(commandId);

    // 왕복시간 집계 (020) — 죽기 전에 응답이 느려지고 있었는지가 「서서히 나빠졌나」의 유일한 관측점이다.
    if (pending.pluginId !== undefined && pending.sentAt !== undefined) {
      const plugin = this.pluginsById.get(pending.pluginId);
      if (plugin) {
        const rtt = Date.now() - pending.sentAt;
        plugin.stats.rttTotalMs += rtt;
        plugin.stats.rttCount++;
        plugin.stats.windowRttMs += rtt;
        plugin.stats.windowRttCount++;
      }
    }

    // DELETE_RESULT는 성공 시 변환된 형태로 반환
    if (message.type === 'DELETE_RESULT') {
      if (message.success) {
        // 플러그인이 remove() 뒤 되읽어 확인한다 — 못 지웠으면 success:false 로 온다.
        const result = message.result as { nodeId: string; name: string; removed?: boolean; note?: string } | undefined;
        pending.resolve({ deleted: result?.removed !== false, name: result?.name, ...(result?.note ? { note: result.note } : {}) });
      } else {
        pending.reject(new Error(message.error as string || 'Delete failed'));
      }
      return;
    }

    // 일반 결과 처리 (RESULT, UPDATE_RESULT, MODIFY_RESULT, 기타 *_RESULT)
    if (message.success !== false) {
      pending.resolve(message.result);
    } else {
      // 타입에 맞는 기본 에러 메시지 생성
      const errorPrefix = message.type
        .replace('_RESULT', '')
        .replace(/_/g, ' ')
        .toLowerCase();
      pending.reject(new Error(message.error as string || `${errorPrefix} failed`));
    }
  }

  /**
   * 특정 플러그인의 전체 페이지 목록 (파일 전체 lint 순회용)
   */
  getPluginPages(pluginId: string): Array<{ pageId: string; pageName: string }> | null {
    const plugin = this.pluginsById.get(pluginId);
    if (!plugin || !plugin.fileInfo) return null;
    return plugin.fileInfo.pages.map(p => ({ pageId: p.pageId, pageName: p.pageName }));
  }

  /**
   * 특정 플러그인의 페이지 정보 조회
   */
  getPluginPageInfo(pluginId: string, pageId: string): { fileName: string; pageName: string } | null {
    const plugin = this.pluginsById.get(pluginId);
    if (!plugin || !plugin.fileInfo) return null;

    const page = plugin.fileInfo.pages.find(p => p.pageId === pageId);
    if (!page) return null;

    return {
      fileName: plugin.fileInfo.fileName,
      pageName: page.pageName,
    };
  }

  // Send command to create frame in Figma
  // format: 'json' (default) | 'html'
  // pluginId: 특정 플러그인 지정 (미지정 시 첫 번째 플러그인)
  // pageId: 특정 페이지 지정 (미지정 시 현재 페이지)
  async createFrame(
    data: unknown,
    name?: string,
    position?: { x: number; y: number },
    format: 'json' | 'html' = 'json',
    pluginId?: string,
    pageId?: string,
    layoutMode?: 'auto' | 'absolute'
  ): Promise<CreateFrameResult> {
    // 청킹 검사를 위해 먼저 타겟 플러그인과 페이로드 확인
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다. ${this.describePluginLoss(pluginId)}`);
      }
      throw new Error(`Figma Plugin이 연결되어 있지 않습니다. ${this.describePluginLoss()}`);
    }

    // 전송할 페이로드 결정
    const payload = format === 'html' ? (data as string) : JSON.stringify(data);
    if (!payload) {
      throw new Error('데이터가 필요합니다');
    }

    const dataSize = Buffer.byteLength(payload, 'utf-8');

    // 1MB 초과 시 청킹 사용
    if (dataSize > CHUNK_THRESHOLD) {
      console.log(`[WebSocket] Large data detected (${(dataSize / 1024 / 1024).toFixed(2)}MB), using chunked transfer to ${targetPlugin.id}`);
      return this.createFrameChunked(targetPlugin.ws, payload, name, position, format, pageId, layoutMode);
    }

    // 1MB 이하: sendCommand 사용
    return this.sendCommand<CreateFrameResult>('CREATE_FRAME', {
      format,
      data,
      name,
      position,
      pageId,
      layoutMode,
    }, {
      pluginId,
      logSuffix: pageId ? ` (page: ${pageId})` : '',
    });
  }

  // Chunked transfer for large data (>1MB)
  private async createFrameChunked(
    ws: WebSocket,
    payload: string,
    name?: string,
    position?: { x: number; y: number },
    format: 'json' | 'html' = 'json',
    pageId?: string,
    layoutMode?: 'auto' | 'absolute'
  ): Promise<CreateFrameResult> {
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const totalChunks = Math.ceil(payload.length / CHUNK_SIZE);

    console.log(`[WebSocket] Sending ${totalChunks} chunks for command ${commandId} (format: ${format})`);

    // 청킹 경로도 같은 수명 통계에 실린다 — 여기만 빠지면 disconnect 로그의 pending·명령 수가 거짓이 된다 (020).
    const chunkPlugin = this.plugins.get(ws);
    const sentAt = Date.now();
    if (chunkPlugin) this.countCommand(chunkPlugin, 'CREATE_FRAME(chunked)', sentAt);

    return new Promise<CreateFrameResult>((resolve, reject) => {
      // 대용량 데이터는 타임아웃을 길게 설정 (60초)
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과 (chunked transfer)'));
      }, 60000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: (result: unknown) => resolve(result as CreateFrameResult),
        reject,
        timeout,
        pluginId: chunkPlugin?.id,
        sentAt,
      });

      // 1. CHUNK_START 전송
      ws.send(JSON.stringify({
        type: 'CHUNK_START',
        commandId,
        totalChunks,
        format,
        name,
        position,
        pageId,
        layoutMode,
      }));

      // 2. CHUNK 전송
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, payload.length);
        const chunkData = payload.slice(start, end);

        ws.send(JSON.stringify({
          type: 'CHUNK',
          commandId,
          index: i,
          data: chunkData,
        }));
      }

      // 3. CHUNK_END 전송
      ws.send(JSON.stringify({
        type: 'CHUNK_END',
        commandId,
      }));

      console.log(`[WebSocket] All ${totalChunks} chunks sent for command ${commandId}`);
    });
  }

  // Delete a frame in Figma
  // pluginId: 특정 플러그인 지정 (미지정 시 첫 번째 플러그인)
  // pageId: 특정 페이지 지정 (미지정 시 현재 페이지)
  async deleteFrame(nodeId: string, pluginId?: string, pageId?: string): Promise<{ deleted: boolean; name?: string; note?: string }> {
    return this.sendCommand('DELETE_FRAME', { nodeId, pageId }, {
      pluginId,
      logSuffix: pageId ? ` (page: ${pageId})` : '',
    });
  }

  /**
   * Update an existing frame's content
   */
  async updateFrame(
    nodeId: string,
    format: 'json' | 'html' = 'json',
    data?: unknown,
    name?: string,
    pluginId?: string,
    pageId?: string
  ): Promise<{ nodeId: string; name: string; childCount: number }> {
    // 청킹 검사를 위해 먼저 타겟 플러그인과 페이로드 확인
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다. ${this.describePluginLoss(pluginId)}`);
      }
      throw new Error(`Figma Plugin이 연결되어 있지 않습니다. ${this.describePluginLoss()}`);
    }

    // 페이로드 결정
    const payload = format === 'html' ? (data as string) : JSON.stringify(data);
    if (!payload) {
      throw new Error('데이터가 필요합니다');
    }

    const dataSize = Buffer.byteLength(payload, 'utf-8');

    // 1MB 초과 시 청킹 사용
    if (dataSize > CHUNK_THRESHOLD) {
      console.log(`[WebSocket] Large update data detected (${(dataSize / 1024 / 1024).toFixed(2)}MB), using chunked transfer to ${targetPlugin.id}`);
      return this.updateFrameChunked(targetPlugin.ws, nodeId, payload, name, format, pageId);
    }

    // 1MB 이하: sendCommand 사용
    return this.sendCommand('UPDATE_FRAME', {
      nodeId,
      format,
      data,
      name,
      pageId,
    }, {
      pluginId,
      logSuffix: ` (node: ${nodeId})`,
    });
  }

  /**
   * Chunked transfer for update (>1MB)
   */
  private async updateFrameChunked(
    ws: WebSocket,
    nodeId: string,
    payload: string,
    name?: string,
    format: 'json' | 'html' = 'json',
    pageId?: string
  ): Promise<{ nodeId: string; name: string; childCount: number }> {
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const totalChunks = Math.ceil(payload.length / CHUNK_SIZE);

    console.log(`[WebSocket] Sending ${totalChunks} update chunks for command ${commandId}`);

    // 청킹 경로도 같은 수명 통계에 실린다 (020) — createFrameChunked 와 같은 이유.
    const chunkPlugin = this.plugins.get(ws);
    const sentAt = Date.now();
    if (chunkPlugin) this.countCommand(chunkPlugin, 'UPDATE_FRAME(chunked)', sentAt);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과 (chunked update)'));
      }, 60000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
        pluginId: chunkPlugin?.id,
        sentAt,
      });

      // 1. CHUNK_START with operation='update'
      ws.send(JSON.stringify({
        type: 'CHUNK_START',
        commandId,
        totalChunks,
        format,
        name,
        pageId,
        operation: 'update',
        nodeId,
      }));

      // 2. Send CHUNKs
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, payload.length);
        ws.send(JSON.stringify({
          type: 'CHUNK',
          commandId,
          index: i,
          data: payload.slice(start, end),
        }));
      }

      // 3. CHUNK_END
      ws.send(JSON.stringify({
        type: 'CHUNK_END',
        commandId,
      }));

      console.log(`[WebSocket] All ${totalChunks} update chunks sent for command ${commandId}`);
    });
  }

  /**
   * Execute a modify operation on a Figma node
   */
  async modifyNode(
    nodeId: string,
    method: string,
    args: Record<string, unknown>,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('MODIFY_NODE', { nodeId, method, args }, {
      pluginId,
      logSuffix: ` (node: ${nodeId}, method: ${method})`,
    });
  }

  /**
   * 경로로 노드 찾기
   */
  async findNode(
    path: string | string[],
    typeFilter?: string,
    pluginId?: string,
    pageId?: string
  ): Promise<{ node?: unknown; matches?: unknown[]; warning?: string }> {
    return this.sendCommand('FIND_NODE', { path, typeFilter, pageId }, {
      pluginId,
    });
  }

  /** 여러 경로를 한 왕복에 nodeId 로 해석 (부분 실패 허용) */
  async resolvePaths(
    paths: Array<string | string[]>,
    typeFilter?: string,
    pluginId?: string,
    pageId?: string
  ): Promise<{ results: Array<{ path: string; nodeId?: string; name?: string; type?: string; matches?: number; error?: string }> }> {
    return this.sendCommand('RESOLVE_PATHS', { paths, typeFilter, pageId }, { pluginId });
  }

  /**
   * 트리 구조 조회
   */
  async getTree(
    options: {
      nodeId?: string;
      path?: string | string[];
      depth?: number | 'full';
      filter?: { types?: string[]; namePattern?: string };
      /** 매칭 노드를 서브트리째 제외(블랙리스트 prune) */
      omit?: { types?: string[]; namePattern?: string };
      /** 매칭 노드를 남기고 조상은 뼈대만 유지 */
      keep?: { types?: string[]; namePattern?: string };
      limit?: number;
      pageId?: string;
      timeoutMs?: number;
      /** 'geometry' 면 좌표 전용 축약 응답(fullPath·meta 생략, absolute 추가). 기본 'all' */
      fields?: 'all' | 'geometry';
      /** 'all' 모드에서도 absolute(절대좌표)를 함께 싣는다 — 컨테이너를 넘나드는 거리 계산용.
       *  payload 가 커지므로 필요한 호출만 켠다. */
      includeAbsolute?: boolean;
    },
    pluginId?: string
  ): Promise<{
    pageId: string;
    pageName: string;
    rootNodeId: string | null;
    rootNodePath?: string;
    rootNode?: Omit<TreeNode, 'children' | 'fullPath'>;
    /** 시작 노드가 INSTANCE 안쪽인가 — 인스턴스 내부 면제를 시작 노드에도 걸기 위한 판정.
     *  배경: docs/history/019-scope-root-skipped-by-name-rules.md */
    rootNodeInsideInstance?: boolean;
    children: unknown[];
    truncated?: boolean;
    totalCount?: number;
    skeletonCount?: number;
    /** 플러그인이 순회 예산을 넘겨 부분 결과를 돌려줬다. 배경: docs/history/015-….md */
    timedOut?: boolean;
  }> {
    // 플러그인 예산은 서버 타임아웃보다 **짧아야** 한다. 그래야 플러그인이 스스로 멈추고
    // 부분 결과를 보내며, 서버가 먼저 포기해 플러그인만 계속 도는 상태가 안 생긴다.
    // 그 상태가 정확히 Figma 가 플러그인을 죽이던 조건이었다.
    const wsTimeout = options.timeoutMs !== undefined ? options.timeoutMs : 60000;
    return this.sendCommand('GET_TREE', {
      budgetMs: Math.max(1000, wsTimeout - 5000),
      nodeId: options.nodeId,
      path: options.path,
      depth: options.depth,
      filter: options.filter,
      omit: options.omit,
      keep: options.keep,
      limit: options.limit,
      pageId: options.pageId,
      fields: options.fields,
      includeAbsolute: options.includeAbsolute,
    }, {
      pluginId,
      timeoutMs: wsTimeout,  // 60초 기본 (트리가 클 수 있음). 호출자가 override 가능.
      logSuffix: ` (depth: ${options.depth || 1})`,
    });
  }

  /**
   * 페이지/문서 노드에 sigma 전용 sharedPluginData 저장
   * pageId 미지정 시 바인딩(현재) 페이지, "document" 지정 시 문서 루트
   */
  async setPageData(
    key: string,
    value: string,
    options?: { pageId?: string },
    pluginId?: string
  ): Promise<{ targetId: string; targetType: string; targetName: string; key: string }> {
    return this.sendCommand('SET_PAGE_DATA', { key, value, pageId: options?.pageId }, {
      pluginId,
      logSuffix: ` (key: ${key}${options?.pageId ? `, page: ${options.pageId}` : ''})`,
    });
  }

  /**
   * 페이지/문서 노드의 sigma 전용 sharedPluginData 조회
   * key 지정 시 단일 값, 미지정 시 전체 key/value 맵
   */
  async getPageData(
    options?: { key?: string; pageId?: string },
    pluginId?: string
  ): Promise<{
    targetId: string;
    targetName: string;
    key?: string;
    value?: string | null;
    keys?: string[];
    data?: Record<string, string>;
  }> {
    return this.sendCommand('GET_PAGE_DATA', { key: options?.key, pageId: options?.pageId }, {
      pluginId,
      logSuffix: ` (key: ${options?.key ?? '(all)'}${options?.pageId ? `, page: ${options.pageId}` : ''})`,
    });
  }

  /**
   * 임의 노드에 sigma sharedPluginData 저장 (예약 키 "lint-ignore" = 룰 억제)
   */
  async setNodeData(
    nodeId: string,
    key: string,
    value: string,
    pluginId?: string
  ): Promise<{ nodeId: string; nodeType: string; nodeName: string; key: string }> {
    return this.sendCommand('SET_NODE_DATA', { nodeId, key, value }, {
      pluginId,
      logSuffix: ` (node: ${nodeId}, key: ${key})`,
    });
  }

  /**
   * 노드의 sigma sharedPluginData 조회 (key 지정 시 단일, 미지정 시 전체 맵)
   */
  async getNodeData(
    nodeId: string,
    options?: { key?: string },
    pluginId?: string
  ): Promise<{ nodeId: string; nodeName: string; key?: string; value?: string | null; keys?: string[]; data?: Record<string, string> }> {
    return this.sendCommand('GET_NODE_DATA', { nodeId, key: options?.key }, {
      pluginId,
      logSuffix: ` (node: ${nodeId}, key: ${options?.key ?? '(all)'})`,
    });
  }

  /**
   * 여러 노드의 특정 sigma sharedPluginData 키를 배치 조회 (lint suppress 필터용).
   * 값이 없는 노드는 결과 맵에서 생략된다.
   */
  /**
   * @param plain true 면 네임스페이스 없는 pluginData 를 읽는다(기본은 sharedPluginData "sigma").
   *   컴포넌트 스펙 스탬프(`sigma-spec`)가 plain 쪽에 있어서 lint 의 스펙 마스터 판정에 쓰인다.
   */
  async getNodesData(
    nodeIds: string[],
    key: string,
    pluginId?: string,
    plain?: boolean
  ): Promise<{ key: string; data: Record<string, string> }> {
    return this.sendCommand('GET_NODES_DATA', { nodeIds, key, plain }, {
      pluginId,
      timeoutMs: 60000,
      logSuffix: ` (${nodeIds.length} nodes, key: ${key})`,
    });
  }

  /**
   * Export a Figma node as image
   */
  async exportImage(
    nodeId: string,
    options?: { format?: 'PNG' | 'SVG' | 'JPG' | 'PDF'; scale?: number },
    pluginId?: string
  ): Promise<{ base64: string; format: string; nodeId: string; nodeName: string; width: number; height: number }> {
    const format = options?.format || 'PNG';
    const scale = options?.scale || 2;

    return this.sendCommand('EXPORT_IMAGE', { nodeId, format, scale }, {
      pluginId,
      timeoutMs: 60000,  // 60초 (이미지 export는 대용량 가능)
      logSuffix: ` (node: ${nodeId}, format: ${format}, scale: ${scale})`,
    });
  }

  /**
   * Extract a Figma node to ExtractedNode JSON
   */
  async extractNode(
    nodeId: string,
    pluginId?: string,
    format: 'json' | 'html' = 'json'
  ): Promise<{ nodeId: string; nodeName: string; nodeType: string; data: unknown }> {
    return this.sendCommand('EXTRACT_NODE_JSON', { nodeId, format }, {
      pluginId,
      logSuffix: ` (node: ${nodeId}, format: ${format})`,
    });
  }

  /**
   * Create a Section in Figma
   */
  async createSection(
    name: string,
    options?: {
      position?: { x: number; y: number };
      size?: { width: number; height: number };
      children?: string[];
      fills?: unknown[];
      pageId?: string;
    },
    pluginId?: string
  ): Promise<{ nodeId: string; name: string; x: number; y: number; width: number; height: number; childCount: number }> {
    return this.sendCommand('CREATE_SECTION', {
      name,
      position: options?.position,
      size: options?.size,
      children: options?.children,
      fills: options?.fills,
      pageId: options?.pageId,
    }, {
      pluginId,
      logSuffix: ` (name: ${name})`,
    });
  }

  /**
   * Move a node to a new parent
   */
  async moveNode(
    nodeId: string,
    parentId: string,
    index?: number,
    pluginId?: string
  ): Promise<{ nodeId: string; nodeName: string; nodeType: string; oldParentId: string | null; oldParentName: string | null; newParentId: string; newParentName: string; newParentType: string; coordinateShift?: { shifted: true; reason: string; beforeAbsolute: { x: number; y: number }; afterAbsolute: { x: number; y: number }; currentLocal: { x: number; y: number }; restoreLocal: { x: number; y: number }; hint: string } }> {
    return this.sendCommand('MOVE_NODE', { nodeId, parentId, index }, {
      pluginId,
      logSuffix: ` (node: ${nodeId} → parent: ${parentId})`,
    });
  }

  /**
   * Clone a node with optional reparent and position
   */
  async cloneNode(
    nodeId: string,
    options?: {
      parentId?: string;
      position?: { x: number; y: number };
      name?: string;
      includeChildIdMap?: boolean;
      includeNames?: boolean;
      childIdMapLimit?: number;
      rewireInternalLinks?: boolean;
    },
    pluginId?: string
  ): Promise<Record<string, unknown>> {
    return this.sendCommand('CLONE_NODE', {
      nodeId,
      parentId: options?.parentId,
      position: options?.position,
      name: options?.name,
      includeChildIdMap: options?.includeChildIdMap,
      includeNames: options?.includeNames,
      childIdMapLimit: options?.childIdMapLimit,
      rewireInternalLinks: options?.rewireInternalLinks,
    }, {
      pluginId,
      logSuffix: ` (source: ${nodeId})`,
    });
  }

  // === Group / Ungroup / Flatten ===

  // === Viewport ===

  // === Boolean Operations ===

  // === Page Management ===

  // === Create Nodes ===

  // === Styles ===

  // === Variables ===

  // === Selection ===

  // === Components ===

  // === Query ===

  // === Batch ===

  async batchModifyNodes(
    operations: Array<{ nodeId: string; method: string; args?: Record<string, unknown> }>,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('BATCH_MODIFY', { operations }, {
      pluginId,
      timeoutMs: 60000,
    });
  }

  // === Batch Text ===

  async setMultipleTextContents(
    items: Array<{ nodeId: string; text: string }>,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('SET_MULTIPLE_TEXT_CONTENTS', { items }, {
      pluginId,
      timeoutMs: 60000,
    });
  }

  // === Query (batch) ===

  // === Annotations ===

  // === Prototyping ===

  // === Component System (New) ===

  // === Component Spec System (스펙 기반 컴포넌트) ===

  // === Creation (New) ===

  // === Query (New) ===

  // === Variables Advanced (New) ===

  // === Team Library (New) ===

  // === Utilities (New) ===

  // === FigJam (New) ===

  // Close server
  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const ws of this.plugins.keys()) {
      ws.close();
    }

    this.wss.close();
  }

  // Get status
  getStatus() {
    const plugins = this.getPluginsInfo();
    return {
      totalPlugins: this.plugins.size,
      figmaConnected: this.isFigmaConnected(),
      figmaPluginsCount: plugins.length,
      figmaPlugins: plugins,  // 전체 플러그인 목록 (ID, fileKey, fileName, pages 등)
    };
  }
}
