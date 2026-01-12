import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../config';
import { BiliCrypto } from './crypto';
import { BiliProtocol } from './protocol';
import { StartGameResponse, WsOp, BilibiliMessage } from './types';

export class BilibiliClient extends EventEmitter {
  private api: AxiosInstance;
  private ws: WebSocket | null = null;
  private gameId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null; // HTTP Heartbeat
  private wsHeartbeatTimer: NodeJS.Timeout | null = null; // WS Heartbeat
  private isDestroyed = false;

  constructor() {
    super();
    this.api = axios.create({
      baseURL: 'https://live-open.biliapi.com',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // Add signature interceptor
    this.api.interceptors.request.use(req => {
      const headers = BiliCrypto.signHeaders(
        config.bilibili.appKey,
        config.bilibili.appSecret,
        req.data
      );
      req.headers = Object.assign(req.headers || {}, headers);
      return req;
    });
  }

  /**
   * Start the interactive play (App)
   */
  async startApp(): Promise<boolean> {
    try {
      console.log('[BilibiliClient] Starting App...');

      // Try to end previous session first to be safe
      await this.endApp().catch(() => { });

      const params = {
        code: config.bilibili.accessToken,
        app_id: Number(config.bilibili.appId)
      };

      const res = await this.api.post<StartGameResponse>('/v2/app/start', params);

      if (res.data.code === 0) {
        const { game_info, websocket_info } = res.data.data;
        this.gameId = game_info.game_id;
        console.log(`[BilibiliClient] App started. GameID: ${this.gameId}`);

        // Start HTTP Heartbeat
        this.startHttpHeartbeat();

        // Connect to WebSocket
        const wsUrl = websocket_info.wss_link[0];
        const authBody = websocket_info.auth_body;
        await this.connectWs(wsUrl, authBody);

        return true;
      } else if (res.data.code === 7002) {
        // Room duplicate game error
        console.warn('[BilibiliClient] Error 7002: Room duplicate game. Retrying in 5s...');
        // Simple retry strategy for now
        await new Promise(r => setTimeout(r, 5000));
        await this.endApp(); // Try force ending again
        await new Promise(r => setTimeout(r, 5000));
        return this.startApp(); // Recurse once
      } else {
        console.error('[BilibiliClient] Failed to start app:', res.data.message);
        return false;
      }
    } catch (error: any) {
      console.error('[BilibiliClient] Start App Error:', error.message);
      return false;
    }
  }

  /**
   * End the interactive play
   */
  async endApp(): Promise<void> {
    const gid = this.gameId; // Use current gameId if available

    // Even if we don't have local gameId, we should try to close using AppID to clear ghost sessions
    const params: any = {
      app_id: Number(config.bilibili.appId)
    };
    if (gid) {
      params.game_id = gid;
    }

    try {
      console.log('[BilibiliClient] Ending App...');
      await this.api.post('/v2/app/end', params);
    } catch (e: any) {
      // Ignore error
      // console.warn('[BilibiliClient] End App Warning:', e.message);
    } finally {
      this.cleanup();
    }
  }

  private startHttpHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      if (!this.gameId) return;
      try {
        await this.api.post('/v2/app/heartbeat', { game_id: this.gameId });
        // console.debug('[BilibiliClient] HTTP Heartbeat sent');
      } catch (e) {
        console.error('[BilibiliClient] HTTP Heartbeat failed');
      }
    }, 20000);
  }

  private async connectWs(url: string, authBody: string) {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log('[BilibiliClient] WebSocket connected');
        // Send Auth Packet
        const packet = BiliProtocol.encode(authBody, WsOp.USER_AUTHENTICATION);
        this.ws?.send(packet);

        // Start WS Heartbeat (30s)
        this.wsHeartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(BiliProtocol.encode(Buffer.alloc(0), WsOp.HEARTBEAT));
          }
        }, 30000);

        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        const packets = BiliProtocol.decode(data);
        for (const packet of packets) {
          this.handlePacket(packet);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[BilibiliClient] WebSocket Error:', err.message);
        if (!this.isDestroyed) {
          // Trigger close to handle reconnect
          this.ws?.close();
        }
      });

      this.ws.on('close', () => {
        console.log('[BilibiliClient] WebSocket closed');
        if (!this.isDestroyed) {
          console.warn('[BilibiliClient] Unexpected disconnect. Reconnecting in 5s...');
          setTimeout(() => {
            this.reconnect();
          }, 5000);
        }
      });
    });
  }

  private async reconnect() {
    this.cleanup(); // Clean up partial state (timers, old ws)
    console.log('[BilibiliClient] Reconnecting...');

    try {
      // Must restart App to get fresh WSS link (old one might be invalid after IP change)
      const success = await this.startApp();
      if (!success) {
        console.error('[BilibiliClient] Reconnect failed, retrying again in 10s...');
        setTimeout(() => this.reconnect(), 10000);
      }
    } catch (e) {
      console.error('[BilibiliClient] Reconnect Exception:', e);
      setTimeout(() => this.reconnect(), 10000);
    }
  }

  private handlePacket(packet: { header: any, body: any }) {
    const { header, body } = packet;

    switch (header.op) {
      case WsOp.CONNECT_SUCCESS:
        console.log('[BilibiliClient] Auth Success');
        break;
      case WsOp.HEARTBEAT_REPLY:
        // console.debug('[BilibiliClient] WS Heartbeat Reply, Popularity:', body);
        break;
      case WsOp.MESSAGE:
        // Dispatch 'message' event for the Service layer to handle
        if (body.cmd) {
          this.emit('message', body as BilibiliMessage);
        }
        break;
    }
  }

  private cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.wsHeartbeatTimer) {
      clearInterval(this.wsHeartbeatTimer);
      this.wsHeartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      // Don't call close() here if called from reconnect/close event to avoid loops
      // just terminate
      this.ws.terminate();
      this.ws = null;
    }
    this.gameId = null;
  }
}
