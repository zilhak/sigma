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
      case 'DELETE_RESULT':
      case 'UPDATE_RESULT':
      case 'MODIFY_RESULT':
      case 'FIND_NODE_RESULT':
      case 'TREE_RESULT':
      case 'EXPORT_IMAGE_RESULT':
      case 'EXTRACT_NODE_JSON_RESULT':
      case 'CREATE_SECTION_RESULT':
      case 'MOVE_NODE_RESULT':
      case 'CLONE_NODE_RESULT':
      case 'CREATE_RECTANGLE_RESULT':
      case 'CREATE_TEXT_RESULT':
      case 'CREATE_EMPTY_FRAME_RESULT':
      case 'GET_SELECTION_RESULT':
      case 'SET_SELECTION_RESULT':
      case 'GET_LOCAL_COMPONENTS_RESULT':
      case 'CREATE_COMPONENT_INSTANCE_RESULT':
      case 'GET_INSTANCE_OVERRIDES_RESULT':
      case 'SET_INSTANCE_OVERRIDES_RESULT':
      case 'GET_NODE_INFO_RESULT':
      case 'GET_DOCUMENT_INFO_RESULT':
      case 'GET_STYLES_RESULT':
      case 'SCAN_TEXT_NODES_RESULT':
      case 'SCAN_NODES_BY_TYPES_RESULT':
      case 'BATCH_MODIFY_RESULT':
      case 'BATCH_DELETE_RESULT':
      case 'GET_ANNOTATIONS_RESULT':
      case 'SET_ANNOTATION_RESULT':
      case 'SET_MULTIPLE_TEXT_CONTENTS_RESULT':
      case 'GET_NODES_INFO_RESULT':
      case 'READ_MY_DESIGN_RESULT':
      case 'SET_MULTIPLE_ANNOTATIONS_RESULT':
      case 'GET_REACTIONS_RESULT':
      case 'ADD_REACTION_RESULT':
      case 'REMOVE_REACTIONS_RESULT':
      case 'CREATE_ELLIPSE_RESULT':
      case 'CREATE_POLYGON_RESULT':
      case 'CREATE_STAR_RESULT':
      case 'CREATE_LINE_RESULT':
      case 'CREATE_VECTOR_RESULT':
      case 'CREATE_IMAGE_NODE_RESULT':
      case 'CREATE_PAINT_STYLE_RESULT':
      case 'CREATE_TEXT_STYLE_RESULT':
      case 'CREATE_EFFECT_STYLE_RESULT':
      case 'CREATE_GRID_STYLE_RESULT':
      case 'APPLY_STYLE_RESULT':
      case 'DELETE_STYLE_RESULT':
      case 'CREATE_VARIABLE_COLLECTION_RESULT':
      case 'CREATE_VARIABLE_RESULT':
      case 'GET_VARIABLES_RESULT':
      case 'SET_VARIABLE_VALUE_RESULT':
      case 'BIND_VARIABLE_RESULT':
      case 'ADD_VARIABLE_MODE_RESULT':
      case 'GROUP_NODES_RESULT':
      case 'UNGROUP_NODES_RESULT':
      case 'FLATTEN_NODES_RESULT':
      case 'BOOLEAN_OPERATION_RESULT':
      case 'CREATE_PAGE_RESULT':
      case 'RENAME_PAGE_RESULT':
      case 'SWITCH_PAGE_RESULT':
      case 'DELETE_PAGE_RESULT':
      case 'REORDER_PAGE_RESULT':
      case 'GET_VIEWPORT_RESULT':
      case 'SET_VIEWPORT_RESULT':
        this.resolveCommandResult(message as { type: string; commandId?: string; success?: boolean; error?: string; result?: unknown; frames?: unknown });
        break;

      default:
        // 자동 결과 패스스루: _RESULT로 끝나고 commandId가 있는 메시지는 자동으로 resolve
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

  // Get connected Figma plugins (WebSocket array - 내부용)
  getFigmaPluginSockets(): WebSocket[] {
    const sockets: WebSocket[] = [];
    for (const [ws, plugin] of this.plugins) {
      if (plugin.type === 'figma-plugin' && ws.readyState === WebSocket.OPEN) {
        sockets.push(ws);
      }
    }
    return sockets;
  }

  // Get plugin by ID
  getPluginById(pluginId: string): Plugin | undefined {
    return this.pluginsById.get(pluginId);
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

  // Get first connected Figma plugin ID (기본 타겟용)
  getDefaultPluginId(): string | null {
    for (const plugin of this.pluginsById.values()) {
      if (plugin.type === 'figma-plugin' && plugin.ws.readyState === WebSocket.OPEN) {
        return plugin.id;
      }
    }
    return null;
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

  /**
   * 트리 구조 조회
   */
  async getTree(
    options: {
      nodeId?: string;
      path?: string | string[];
      depth?: number | 'full';
      filter?: { types?: string[]; namePattern?: string };
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
  }> {
    return this.sendCommand('GET_TREE', {
      nodeId: options.nodeId,
      path: options.path,
      depth: options.depth,
      filter: options.filter,
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
  async getNodesData(
    nodeIds: string[],
    key: string,
    pluginId?: string
  ): Promise<{ key: string; data: Record<string, string> }> {
    return this.sendCommand('GET_NODES_DATA', { nodeIds, key }, {
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
    },
    pluginId?: string
  ): Promise<{ nodeId: string; name: string; type: string; x: number; y: number; width: number; height: number; parentId: string | null; parentName: string | null; sourceNodeId: string }> {
    return this.sendCommand('CLONE_NODE', {
      nodeId,
      parentId: options?.parentId,
      position: options?.position,
      name: options?.name,
    }, {
      pluginId,
      logSuffix: ` (source: ${nodeId})`,
    });
  }

  // === Group / Ungroup / Flatten ===

  async groupNodes(nodeIds: string[], name?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GROUP_NODES', { nodeIds, name }, { pluginId });
  }

  async ungroupNodes(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('UNGROUP_NODES', { nodeId }, { pluginId });
  }

  async flattenNodes(nodeIds: string[], name?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('FLATTEN_NODES', { nodeIds, name }, { pluginId });
  }

  // === Viewport ===

  async getViewport(pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_VIEWPORT', {}, { pluginId });
  }

  async setViewport(options: { center?: { x: number; y: number }; zoom?: number; nodeIds?: string[] }, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SET_VIEWPORT', options, { pluginId });
  }

  // === Boolean Operations ===

  async booleanOperation(nodeIds: string[], operation: string, name?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('BOOLEAN_OPERATION', { nodeIds, operation, name }, { pluginId });
  }

  // === Page Management ===

  async createPage(name?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_PAGE', { name }, { pluginId });
  }

  async renamePage(pageId: string, name: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('RENAME_PAGE', { pageId, name }, { pluginId });
  }

  async switchPage(pageId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SWITCH_PAGE', { pageId }, { pluginId });
  }

  async deletePage(pageId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('DELETE_PAGE', { pageId }, { pluginId });
  }

  async reorderPage(pageId: string, index: number, pluginId?: string): Promise<unknown> {
    return this.sendCommand('REORDER_PAGE', { pageId, index }, { pluginId });
  }

  // === Create Nodes ===

  async createRectangle(
    args: { x: number; y: number; width: number; height: number; name?: string; parentId?: string; fillColor?: { r: number; g: number; b: number; a?: number }; strokeColor?: { r: number; g: number; b: number; a?: number }; strokeWeight?: number; cornerRadius?: number; pageId?: string },
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('CREATE_RECTANGLE', args, { pluginId });
  }

  async createTextNode(
    args: { x: number; y: number; text: string; name?: string; parentId?: string; fontSize?: number; fontFamily?: string; fontWeight?: number; fontColor?: { r: number; g: number; b: number; a?: number }; textAlignHorizontal?: string; pageId?: string },
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('CREATE_TEXT', args, { pluginId });
  }

  async createEmptyFrame(
    args: { x: number; y: number; width: number; height: number; name?: string; parentId?: string; fillColor?: unknown; strokeColor?: unknown; strokeWeight?: number; layoutMode?: string; layoutWrap?: string; paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number; primaryAxisAlignItems?: string; counterAxisAlignItems?: string; layoutSizingHorizontal?: string; layoutSizingVertical?: string; itemSpacing?: number; counterAxisSpacing?: number; cornerRadius?: number; pageId?: string },
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('CREATE_EMPTY_FRAME', args, { pluginId });
  }

  async createEllipse(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_ELLIPSE', args, { pluginId });
  }

  async createPolygon(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_POLYGON', args, { pluginId });
  }

  async createStar(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_STAR', args, { pluginId });
  }

  async createLine(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_LINE', args, { pluginId });
  }

  async createVector(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_VECTOR', args, { pluginId });
  }

  async createImageNode(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_IMAGE_NODE', args, { pluginId });
  }

  // === Styles ===

  async createPaintStyle(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_PAINT_STYLE', args, { pluginId });
  }

  async createTextStyle(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_TEXT_STYLE', args, { pluginId });
  }

  async createEffectStyle(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_EFFECT_STYLE', args, { pluginId });
  }

  async createGridStyle(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_GRID_STYLE', args, { pluginId });
  }

  async applyStyle(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('APPLY_STYLE', args, { pluginId });
  }

  async deleteStyle(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('DELETE_STYLE', args, { pluginId });
  }

  // === Variables ===

  async createVariableCollection(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_VARIABLE_COLLECTION', args, { pluginId });
  }

  async createVariable(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_VARIABLE', args, { pluginId });
  }

  async getVariables(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_VARIABLES', args, { pluginId });
  }

  async setVariableValue(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SET_VARIABLE_VALUE', args, { pluginId });
  }

  async bindVariable(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('BIND_VARIABLE', args, { pluginId });
  }

  async addVariableMode(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('ADD_VARIABLE_MODE', args, { pluginId });
  }

  // === Selection ===

  async getSelection(pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_SELECTION', {}, { pluginId });
  }

  async setSelectionNodes(
    nodeIds: string[],
    zoomToFit?: boolean,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('SET_SELECTION', { nodeIds, zoomToFit }, { pluginId });
  }

  // === Components ===

  async getLocalComponents(pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_LOCAL_COMPONENTS', {}, { pluginId });
  }

  async createComponentInstance(
    componentKey: string,
    x: number,
    y: number,
    parentId?: string,
    pluginId?: string,
    pageId?: string
  ): Promise<unknown> {
    return this.sendCommand('CREATE_COMPONENT_INSTANCE', { componentKey, x, y, parentId, pageId }, { pluginId });
  }

  async getInstanceOverrides(nodeId?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_INSTANCE_OVERRIDES', { nodeId }, { pluginId });
  }

  async setInstanceOverrides(
    nodeId: string,
    overrides: Record<string, unknown>,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('SET_INSTANCE_OVERRIDES', { nodeId, overrides }, { pluginId });
  }

  // === Query ===

  async getNodeInfo(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_NODE_INFO', { nodeId }, { pluginId });
  }

  async getDocumentInfo(pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_DOCUMENT_INFO', {}, { pluginId });
  }

  async getStylesInfo(pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_STYLES', {}, { pluginId });
  }

  // === Batch ===

  async scanTextNodes(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SCAN_TEXT_NODES', { nodeId }, { pluginId });
  }

  async scanNodesByTypes(nodeId: string, types: string[], pluginId?: string): Promise<unknown> {
    return this.sendCommand('SCAN_NODES_BY_TYPES', { nodeId, types }, { pluginId });
  }

  async batchModifyNodes(
    operations: Array<{ nodeId: string; method: string; args?: Record<string, unknown> }>,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('BATCH_MODIFY', { operations }, {
      pluginId,
      timeoutMs: 60000,
    });
  }

  async batchDeleteNodes(nodeIds: string[], pluginId?: string): Promise<unknown> {
    return this.sendCommand('BATCH_DELETE', { nodeIds }, { pluginId });
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

  async getNodesInfo(nodeIds: string[], pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_NODES_INFO', { nodeIds }, { pluginId });
  }

  async readMyDesign(pluginId?: string): Promise<unknown> {
    return this.sendCommand('READ_MY_DESIGN', {}, { pluginId });
  }

  // === Annotations ===

  async setMultipleAnnotations(
    items: Array<{ nodeId: string; label: string; labelType?: string }>,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('SET_MULTIPLE_ANNOTATIONS', { items }, { pluginId });
  }

  async getAnnotations(nodeId?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_ANNOTATIONS', { nodeId }, { pluginId });
  }

  async setAnnotation(
    nodeId: string,
    label: string,
    labelType?: string,
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('SET_ANNOTATION', { nodeId, label, labelType }, { pluginId });
  }

  // === Prototyping ===

  async getReactions(nodeId?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_REACTIONS', { nodeId }, { pluginId });
  }

  async addReaction(
    args: { nodeId: string; trigger: string; action: string; destinationId?: string; url?: string; transition?: { type: string; duration?: number; direction?: string }; preserveScrollPosition?: boolean },
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('ADD_REACTION', args, { pluginId });
  }

  async removeReactions(nodeId: string, triggerType?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('REMOVE_REACTIONS', { nodeId, triggerType }, { pluginId });
  }

  async setHyperlink(
    args: { links: Array<{ a: string; b: string }>; direction?: string; slot?: string; remove?: boolean },
    pluginId?: string
  ): Promise<unknown> {
    return this.sendCommand('SET_HYPERLINK', args, { pluginId });
  }

  // === Component System (New) ===

  async createComponent(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_COMPONENT', args, { pluginId });
  }

  // === Component Spec System (스펙 기반 컴포넌트) ===

  async buildComponentFromSpec(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('BUILD_COMPONENT_FROM_SPEC', args, { pluginId });
  }

  async useComponentSpec(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('USE_COMPONENT_SPEC', args, { pluginId });
  }

  async setComponentSpecInstanceProps(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SET_COMPONENT_SPEC_INSTANCE_PROPS', args, { pluginId });
  }

  async convertToComponent(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CONVERT_TO_COMPONENT', { nodeId }, { pluginId });
  }

  async createComponentSet(componentIds: string[], name?: string, pluginId?: string, pageId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_COMPONENT_SET', { componentIds, name, pageId }, { pluginId });
  }

  async addComponentProperty(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('ADD_COMPONENT_PROPERTY', args, { pluginId });
  }

  async editComponentProperty(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('EDIT_COMPONENT_PROPERTY', args, { pluginId });
  }

  async deleteComponentProperty(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('DELETE_COMPONENT_PROPERTY', args, { pluginId });
  }

  async getComponentProperties(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_COMPONENT_PROPERTIES', { nodeId }, { pluginId });
  }

  async detachInstance(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('DETACH_INSTANCE', { nodeId }, { pluginId });
  }

  async swapComponent(nodeId: string, newComponentKey: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SWAP_COMPONENT', { nodeId, newComponentKey }, { pluginId });
  }

  // === Creation (New) ===

  async createNodeFromSvg(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_NODE_FROM_SVG', args, { pluginId });
  }

  // === Query (New) ===

  async listAvailableFonts(pluginId?: string): Promise<unknown> {
    return this.sendCommand('LIST_FONTS', {}, { pluginId });
  }

  async getNodeCSS(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_CSS', { nodeId }, { pluginId });
  }

  // === Variables Advanced (New) ===

  async setVariableScopes(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SET_VARIABLE_SCOPES', args, { pluginId });
  }

  async setVariableAlias(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SET_VARIABLE_ALIAS', args, { pluginId });
  }

  async setVariableCodeSyntax(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SET_VARIABLE_CODE_SYNTAX', args, { pluginId });
  }

  async renameVariable(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('RENAME_VARIABLE', args, { pluginId });
  }

  async deleteVariable(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('DELETE_VARIABLE', args, { pluginId });
  }

  // === Team Library (New) ===

  async getAvailableLibraries(pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_LIBRARIES', {}, { pluginId, timeoutMs: 30000 });
  }

  async getLibraryComponents(libraryKey: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_LIBRARY_COMPONENTS', { libraryKey }, { pluginId, timeoutMs: 30000 });
  }

  async getLibraryVariables(collectionKey: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_LIBRARY_VARIABLES', { collectionKey }, { pluginId, timeoutMs: 30000 });
  }

  async importLibraryComponent(key: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('IMPORT_LIBRARY_COMPONENT', { key }, { pluginId });
  }

  async importLibraryStyle(key: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('IMPORT_LIBRARY_STYLE', { key }, { pluginId });
  }

  // === Utilities (New) ===

  async notifyUser(message: string, options?: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('NOTIFY', { message, options }, { pluginId });
  }

  async commitUndo(pluginId?: string): Promise<unknown> {
    return this.sendCommand('COMMIT_UNDO', {}, { pluginId });
  }

  async triggerUndo(pluginId?: string): Promise<unknown> {
    return this.sendCommand('TRIGGER_UNDO', {}, { pluginId });
  }

  async saveVersion(title: string, description?: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('SAVE_VERSION', { title, description }, { pluginId, timeoutMs: 30000 });
  }

  async setExportSettings(nodeId: string, settings: unknown[], pluginId?: string): Promise<unknown> {
    return this.sendCommand('SET_EXPORT_SETTINGS', { nodeId, settings }, { pluginId });
  }

  async getExportSettings(nodeId: string, pluginId?: string): Promise<unknown> {
    return this.sendCommand('GET_EXPORT_SETTINGS', { nodeId }, { pluginId });
  }

  // === FigJam (New) ===

  async createSticky(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_STICKY', args, { pluginId });
  }

  async createConnector(args: Record<string, unknown>, pluginId?: string): Promise<unknown> {
    return this.sendCommand('CREATE_CONNECTOR', args, { pluginId });
  }

  // Broadcast to all Figma plugins
  broadcastToFigma(message: object) {
    const jsonMessage = JSON.stringify(message);
    for (const ws of this.getFigmaPluginSockets()) {
      ws.send(jsonMessage);
    }
  }

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

  // Get connected Figma file info (첫 번째 플러그인)
  getFigmaFileInfo(): FigmaFileInfo | null {
    for (const plugin of this.plugins.values()) {
      if (plugin.type === 'figma-plugin' && plugin.ws.readyState === WebSocket.OPEN && plugin.fileInfo) {
        return plugin.fileInfo;
      }
    }
    return null;
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
