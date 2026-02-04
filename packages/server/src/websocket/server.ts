import { WebSocketServer, WebSocket } from 'ws';
import type { ExtractedNode } from '@sigma/shared';

// 1MB 청크 크기
const CHUNK_SIZE = 1024 * 1024;
const CHUNK_THRESHOLD = 1024 * 1024; // 1MB 이상이면 청킹

interface FigmaFileInfo {
  fileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
}

interface Client {
  ws: WebSocket;
  type: 'figma-plugin' | 'unknown';
  connectedAt: Date;
  fileInfo?: FigmaFileInfo;
}

interface PendingCommand {
  id: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class FigmaWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, Client> = new Map();
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
      this.pingClients();
    }, 30000);

    console.log(`[WebSocket] Server listening on port ${port}`);
  }

  private handleConnection(ws: WebSocket) {
    const client: Client = {
      ws,
      type: 'unknown',
      connectedAt: new Date(),
    };

    this.clients.set(ws, client);
    console.log('[WebSocket] Client connected');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('[WebSocket] Message parse error:', error);
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
      this.clients.delete(ws);
    });
  }

  private handleMessage(ws: WebSocket, message: { type: string; [key: string]: unknown }) {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'REGISTER':
        if (message.client === 'figma-plugin') {
          client.type = 'figma-plugin';
          // 파일 정보가 함께 왔으면 저장
          if (message.fileKey !== undefined) {
            client.fileInfo = {
              fileKey: message.fileKey as string | null,
              fileName: message.fileName as string,
              pageId: message.pageId as string,
              pageName: message.pageName as string,
            };
            console.log(`[WebSocket] Figma Plugin registered (file: ${client.fileInfo.fileName}, page: ${client.fileInfo.pageName})`);
          } else {
            console.log('[WebSocket] Figma Plugin registered');
          }
        }
        break;

      case 'FILE_INFO':
        // 파일 정보 업데이트
        client.fileInfo = {
          fileKey: message.fileKey as string | null,
          fileName: message.fileName as string,
          pageId: message.pageId as string,
          pageName: message.pageName as string,
        };
        console.log(`[WebSocket] File info updated (file: ${client.fileInfo.fileName}, page: ${client.fileInfo.pageName})`);
        break;

      case 'PONG':
        // Client is alive
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
    }
  }

  private pingClients() {
    for (const [ws, client] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' }));
      }
    }
  }

  // Check if Figma plugin is connected
  isFigmaConnected(): boolean {
    for (const client of this.clients.values()) {
      if (client.type === 'figma-plugin' && client.ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  // Get connected Figma plugins
  getFigmaClients(): WebSocket[] {
    const figmaClients: WebSocket[] = [];
    for (const [ws, client] of this.clients) {
      if (client.type === 'figma-plugin' && ws.readyState === WebSocket.OPEN) {
        figmaClients.push(ws);
      }
    }
    return figmaClients;
  }

  // Send command to create frame in Figma
  // format: 'json' (default) | 'html'
  async createFrame(
    data: ExtractedNode | null,
    name?: string,
    position?: { x: number; y: number },
    format: 'json' | 'html' = 'json',
    html?: string
  ): Promise<void> {
    const figmaClients = this.getFigmaClients();
    if (figmaClients.length === 0) {
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
      console.log(`[WebSocket] Large data detected (${(dataSize / 1024 / 1024).toFixed(2)}MB), using chunked transfer`);
      return this.createFrameChunked(figmaClients[0], payload, name, position, format);
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
      });

      // Send to first connected Figma plugin
      figmaClients[0].send(message);
    });
  }

  // Chunked transfer for large data (>1MB)
  private async createFrameChunked(
    client: WebSocket,
    payload: string,
    name?: string,
    position?: { x: number; y: number },
    format: 'json' | 'html' = 'json'
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
      client.send(JSON.stringify({
        type: 'CHUNK_START',
        commandId,
        totalChunks,
        format,
        name,
        position,
      }));

      // 2. CHUNK 전송
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, payload.length);
        const chunkData = payload.slice(start, end);

        client.send(JSON.stringify({
          type: 'CHUNK',
          commandId,
          index: i,
          data: chunkData,
        }));
      }

      // 3. CHUNK_END 전송
      client.send(JSON.stringify({
        type: 'CHUNK_END',
        commandId,
      }));

      console.log(`[WebSocket] All ${totalChunks} chunks sent for command ${commandId}`);
    });
  }

  // Get all frames from Figma
  async getFrames(): Promise<Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>> {
    const figmaClients = this.getFigmaClients();
    if (figmaClients.length === 0) {
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
      });

      figmaClients[0].send(message);
    });
  }

  // Delete a frame in Figma
  async deleteFrame(nodeId: string): Promise<{ deleted: boolean; name?: string }> {
    const figmaClients = this.getFigmaClients();
    if (figmaClients.length === 0) {
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
      });

      figmaClients[0].send(message);
    });
  }

  // Broadcast to all Figma clients
  broadcastToFigma(message: object) {
    const jsonMessage = JSON.stringify(message);
    for (const ws of this.getFigmaClients()) {
      ws.send(jsonMessage);
    }
  }

  // Close server
  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const ws of this.clients.keys()) {
      ws.close();
    }

    this.wss.close();
  }

  // Get connected Figma file info
  getFigmaFileInfo(): FigmaFileInfo | null {
    for (const client of this.clients.values()) {
      if (client.type === 'figma-plugin' && client.ws.readyState === WebSocket.OPEN && client.fileInfo) {
        return client.fileInfo;
      }
    }
    return null;
  }

  // Get status
  getStatus() {
    const fileInfo = this.getFigmaFileInfo();
    return {
      totalClients: this.clients.size,
      figmaConnected: this.isFigmaConnected(),
      figmaClients: this.getFigmaClients().length,
      figmaFileInfo: fileInfo,
    };
  }
}
