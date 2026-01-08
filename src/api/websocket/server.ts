import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../config';

export class LocalWebSocketServer extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Set<WebSocket> = new Set();

  constructor() {
    super();
    this.wss = new WebSocket.Server({ port: config.server.wsPort });

    this.wss.on('connection', (ws) => {
      console.log('[LocalWS] New frontend connection');
      this.clients.add(ws);
      this.emit('connection', ws); // Notify listeners (like StudyService)

      // Send initial hello or state request
      ws.send(JSON.stringify({ type: 'WELCOME', timestamp: Date.now() }));

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[LocalWS] Client error:', err.message);
      });
    });

    console.log(`[LocalWS] Server started on port ${config.server.wsPort}`);
  }

  /**
   * Broadcast message to all connected frontend clients (OBS overlay)
   */
  broadcast(type: string, data: any) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
