import { WebSocketServer, WebSocket } from 'ws';
import type { ExtractedNode } from '@sigma/shared';

// 1MB 청크 크기
const CHUNK_SIZE = 1024 * 1024;
const CHUNK_THRESHOLD = 1024 * 1024; // 1MB 이상이면 청킹

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
 * 플러그인 (내부용)
 */
interface Plugin {
  id: string;  // 고유 플러그인 ID (pluginId)
  ws: WebSocket;
  type: 'figma-plugin' | 'unknown';
  connectedAt: Date;
  fileInfo?: FigmaFileInfo;
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
}

export class FigmaWebSocketServer {
  private wss: WebSocketServer;
  private plugins: Map<WebSocket, Plugin> = new Map();
  private pluginsById: Map<string, Plugin> = new Map();  // ID로 플러그인 조회
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

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
    };

    this.plugins.set(ws, plugin);
    console.log(`[WebSocket] Plugin connected (id: ${pluginId})`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('[WebSocket] Message parse error:', error);
      }
    });

    ws.on('close', () => {
      const closingPlugin = this.plugins.get(ws);
      if (closingPlugin) {
        this.pluginsById.delete(closingPlugin.id);
        console.log(`[WebSocket] Plugin disconnected (id: ${closingPlugin.id})`);
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
        throw new Error(`지정된 플러그인(${options.pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = options?.timeoutMs ?? 30000;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, timeoutMs);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
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
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
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
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
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
    rootNode?: { id: string; name: string; type: string; boundingBox: { x: number; y: number; width: number; height: number } };
    children: unknown[];
    truncated?: boolean;
    totalCount?: number;
    skeletonCount?: number;
  }> {
    return this.sendCommand('GET_TREE', {
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
      timeoutMs: options.timeoutMs ?? 60000,  // 60초 기본 (트리가 클 수 있음). 호출자가 override 가능.
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
