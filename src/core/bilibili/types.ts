export interface BilibiliCredentials {
  appId: number;
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export interface StartGameResponse {
  code: number;
  message: string;
  data: {
    game_info: {
      game_id: string;
    };
    websocket_info: {
      auth_body: string;
      wss_link: string[];
    };
    anchor_info: {
      room_id: number;
      uname: string;
      uid: number;
      uface: string;
    };
  };
}

export interface WsHeader {
  packetLen: number;
  headerLen: number;
  ver: number;
  op: number;
  seq: number;
}

export interface DanmuMessageData {
  uid: number;
  uname: string;
  msg: string;
  fans_medal_level?: number;
  fans_medal_name?: string;
  timestamp?: number;
  uface?: string;
}

export interface BilibiliMessage {
  cmd: string;
  data: any;
}

// Operation constants
export enum WsOp {
  HEARTBEAT = 2,
  HEARTBEAT_REPLY = 3,
  MESSAGE = 5,
  USER_AUTHENTICATION = 7,
  CONNECT_SUCCESS = 8,
}

export enum WsVersion {
  NORMAL = 0,
  ZLIB = 2,
  BROTLI = 3, // Not used in this project but exists in Bilibili protocol
}
