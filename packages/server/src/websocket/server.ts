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
        // Handle command result
        const commandId = message.commandId as string;
        const pending = this.pendingCommands.get(commandId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingCommands.delete(commandId);
          if (message.success) {
            pending.resolve(message.result);
          } else {
            pending.reject(new Error(message.error as string || 'Unknown error'));
          }
        }
        break;

      case 'FRAMES_LIST':
        // Handle frames list response
        const framesCommandId = message.commandId as string;
        const framesPending = this.pendingCommands.get(framesCommandId);
        if (framesPending) {
          clearTimeout(framesPending.timeout);
          this.pendingCommands.delete(framesCommandId);
          framesPending.resolve(message.frames);
        }
        break;

      case 'DELETE_RESULT':
        // Handle delete result
        const deleteCommandId = message.commandId as string;
        const deletePending = this.pendingCommands.get(deleteCommandId);
        if (deletePending) {
          clearTimeout(deletePending.timeout);
          this.pendingCommands.delete(deleteCommandId);
          if (message.success) {
            const result = message.result as { nodeId: string; name: string } | undefined;
            deletePending.resolve({ deleted: true, name: result?.name });
          } else {
            deletePending.reject(new Error(message.error as string || 'Delete failed'));
          }
        }
        break;

      case 'UPDATE_RESULT': {
        const updateCommandId = message.commandId as string;
        const updatePending = this.pendingCommands.get(updateCommandId);
        if (updatePending) {
          clearTimeout(updatePending.timeout);
          this.pendingCommands.delete(updateCommandId);
          if (message.success) {
            updatePending.resolve(message.result);
          } else {
            updatePending.reject(new Error(message.error as string || 'Update failed'));
          }
        }
        break;
      }

      case 'MODIFY_RESULT': {
        const modifyCommandId = message.commandId as string;
        const modifyPending = this.pendingCommands.get(modifyCommandId);
        if (modifyPending) {
          clearTimeout(modifyPending.timeout);
          this.pendingCommands.delete(modifyCommandId);
          if (message.success) {
            modifyPending.resolve(message.result);
          } else {
            modifyPending.reject(new Error(message.error as string || 'Modify failed'));
          }
        }
        break;
      }

      case 'FIND_NODE_RESULT': {
        const findCommandId = message.commandId as string;
        const findPending = this.pendingCommands.get(findCommandId);
        if (findPending) {
          clearTimeout(findPending.timeout);
          this.pendingCommands.delete(findCommandId);
          if (message.success) {
            findPending.resolve(message.result);
          } else {
            findPending.reject(new Error(message.error as string || 'Find node failed'));
          }
        }
        break;
      }

      case 'TREE_RESULT': {
        const treeCommandId = message.commandId as string;
        const treePending = this.pendingCommands.get(treeCommandId);
        if (treePending) {
          clearTimeout(treePending.timeout);
          this.pendingCommands.delete(treeCommandId);
          if (message.success) {
            treePending.resolve(message.result);
          } else {
            treePending.reject(new Error(message.error as string || 'Get tree failed'));
          }
        }
        break;
      }
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
    data: ExtractedNode | null,
    name?: string,
    position?: { x: number; y: number },
    format: 'json' | 'html' = 'json',
    html?: string,
    pluginId?: string,
    pageId?: string
  ): Promise<void> {
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    // 전송할 페이로드 결정
    const payload = format === 'html' ? html : JSON.stringify(data);
    if (!payload) {
      throw new Error(format === 'html' ? 'HTML 데이터가 필요합니다' : 'JSON 데이터가 필요합니다');
    }

    const dataSize = Buffer.byteLength(payload, 'utf-8');

    // 1MB 초과 시 청킹 사용
    if (dataSize > CHUNK_THRESHOLD) {
      console.log(`[WebSocket] Large data detected (${(dataSize / 1024 / 1024).toFixed(2)}MB), using chunked transfer to ${targetPlugin.id}`);
      return this.createFrameChunked(targetPlugin.ws, payload, name, position, format, pageId);
    }

    // 1MB 이하: 기존 방식
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, 30000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: () => resolve(),
        reject,
        timeout,
      });

      const message = JSON.stringify({
        type: 'CREATE_FRAME',
        commandId,
        format,
        data: format === 'json' ? data : undefined,
        html: format === 'html' ? html : undefined,
        name,
        position,
        pageId,  // 대상 페이지 (undefined면 현재 페이지)
      });

      console.log(`[WebSocket] Sending CREATE_FRAME to ${targetPlugin.id}${pageId ? ` (page: ${pageId})` : ''}`);
      targetPlugin.ws.send(message);
    });
  }

  // Chunked transfer for large data (>1MB)
  private async createFrameChunked(
    ws: WebSocket,
    payload: string,
    name?: string,
    position?: { x: number; y: number },
    format: 'json' | 'html' = 'json',
    pageId?: string
  ): Promise<void> {
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const totalChunks = Math.ceil(payload.length / CHUNK_SIZE);

    console.log(`[WebSocket] Sending ${totalChunks} chunks for command ${commandId} (format: ${format})`);

    return new Promise<void>((resolve, reject) => {
      // 대용량 데이터는 타임아웃을 길게 설정 (60초)
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과 (chunked transfer)'));
      }, 60000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: () => resolve(),
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

  // Get all frames from Figma
  // pluginId: 특정 플러그인 지정 (미지정 시 첫 번째 플러그인)
  // pageId: 특정 페이지 지정 (미지정 시 현재 페이지)
  async getFrames(pluginId?: string, pageId?: string): Promise<Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>> {
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, 30000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      const message = JSON.stringify({
        type: 'GET_FRAMES',
        commandId,
        pageId,  // 대상 페이지 (undefined면 현재 페이지)
      });

      console.log(`[WebSocket] Sending GET_FRAMES to ${targetPlugin.id}${pageId ? ` (page: ${pageId})` : ''}`);
      targetPlugin.ws.send(message);
    });
  }

  // Delete a frame in Figma
  // pluginId: 특정 플러그인 지정 (미지정 시 첫 번째 플러그인)
  // pageId: 특정 페이지 지정 (미지정 시 현재 페이지)
  async deleteFrame(nodeId: string, pluginId?: string, pageId?: string): Promise<{ deleted: boolean; name?: string }> {
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, 30000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      const message = JSON.stringify({
        type: 'DELETE_FRAME',
        commandId,
        nodeId,
        pageId,  // 대상 페이지 (undefined면 현재 페이지)
      });

      console.log(`[WebSocket] Sending DELETE_FRAME to ${targetPlugin.id}${pageId ? ` (page: ${pageId})` : ''}`);
      targetPlugin.ws.send(message);
    });
  }

  /**
   * Update an existing frame's content
   */
  async updateFrame(
    nodeId: string,
    format: 'json' | 'html' = 'json',
    data?: any | null,
    html?: string,
    name?: string,
    pluginId?: string,
    pageId?: string
  ): Promise<{ nodeId: string; name: string; childCount: number }> {
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    // Determine payload
    const payload = format === 'html' ? html : JSON.stringify(data);
    if (!payload) {
      throw new Error(format === 'html' ? 'HTML 데이터가 필요합니다' : 'JSON 데이터가 필요합니다');
    }

    const dataSize = Buffer.byteLength(payload, 'utf-8');

    // Use chunked transfer for >1MB
    if (dataSize > CHUNK_THRESHOLD) {
      console.log(`[WebSocket] Large update data detected (${(dataSize / 1024 / 1024).toFixed(2)}MB), using chunked transfer to ${targetPlugin.id}`);
      return this.updateFrameChunked(targetPlugin.ws, nodeId, payload, name, format, pageId);
    }

    // Normal transfer
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, 30000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      const message = JSON.stringify({
        type: 'UPDATE_FRAME',
        commandId,
        nodeId,
        format,
        data: format === 'json' ? data : undefined,
        html: format === 'html' ? html : undefined,
        name,
        pageId,
      });

      console.log(`[WebSocket] Sending UPDATE_FRAME to ${targetPlugin.id} (node: ${nodeId})`);
      targetPlugin.ws.send(message);
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
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, 30000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve,
        reject,
        timeout,
      });

      const message = JSON.stringify({
        type: 'MODIFY_NODE',
        commandId,
        nodeId,
        method,
        args,
      });

      console.log(`[WebSocket] Sending MODIFY_NODE to ${targetPlugin.id} (node: ${nodeId}, method: ${method})`);
      targetPlugin.ws.send(message);
    });
  }

  /**
   * 경로로 노드 찾기
   */
  async findNode(
    path: string | string[],
    typeFilter?: string,
    pluginId?: string
  ): Promise<{ node?: unknown; matches?: unknown[]; warning?: string }> {
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, 30000);

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      const message = JSON.stringify({
        type: 'FIND_NODE',
        commandId,
        path,
        typeFilter,
      });

      console.log(`[WebSocket] Sending FIND_NODE to ${targetPlugin.id}`);
      targetPlugin.ws.send(message);
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
    },
    pluginId?: string
  ): Promise<{
    pageId: string;
    pageName: string;
    rootNodeId: string | null;
    rootNodePath?: string;
    children: unknown[];
    truncated?: boolean;
    totalCount?: number;
  }> {
    const targetPlugin = this.resolveTargetPlugin(pluginId);
    if (!targetPlugin) {
      if (pluginId) {
        throw new Error(`지정된 플러그인(${pluginId})이 연결되어 있지 않습니다`);
      }
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Figma Plugin 응답 시간 초과'));
      }, 60000);  // 60초 (트리가 클 수 있음)

      this.pendingCommands.set(commandId, {
        id: commandId,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      const message = JSON.stringify({
        type: 'GET_TREE',
        commandId,
        nodeId: options.nodeId,
        path: options.path,
        depth: options.depth,
        filter: options.filter,
        limit: options.limit,
        pageId: options.pageId,
      });

      console.log(`[WebSocket] Sending GET_TREE to ${targetPlugin.id} (depth: ${options.depth || 1})`);
      targetPlugin.ws.send(message);
    });
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
