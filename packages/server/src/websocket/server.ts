import { WebSocketServer, WebSocket } from 'ws';
import type { ExtractedNode } from '@sigma/shared';

interface Client {
  ws: WebSocket;
  type: 'figma-plugin' | 'unknown';
  connectedAt: Date;
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
          console.log('[WebSocket] Figma Plugin registered');
        }
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
  async createFrame(data: ExtractedNode, name?: string): Promise<void> {
    const figmaClients = this.getFigmaClients();
    if (figmaClients.length === 0) {
      throw new Error('Figma Plugin이 연결되어 있지 않습니다');
    }

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
        data,
        name,
      });

      // Send to first connected Figma plugin
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

  // Get status
  getStatus() {
    return {
      totalClients: this.clients.size,
      figmaConnected: this.isFigmaConnected(),
      figmaClients: this.getFigmaClients().length,
    };
  }
}
