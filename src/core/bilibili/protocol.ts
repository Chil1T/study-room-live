import { WsHeader, WsOp, WsVersion } from './types';
import zlib from 'zlib';

export class BiliProtocol {
  private static HEADER_LENGTH = 16;
  private static SEQUENCE = 1;

  /**
   * Encode body into Bilibili WebSocket packet
   */
  static encode(body: Buffer | string, op: WsOp): Buffer {
    const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const packetLen = this.HEADER_LENGTH + bodyBuf.length;
    const buf = Buffer.alloc(packetLen);

    buf.writeInt32BE(packetLen, 0);       // Packet Length
    buf.writeInt16BE(this.HEADER_LENGTH, 4); // Header Length
    buf.writeInt16BE(WsVersion.ZLIB, 6);  // Version (Setting 2 as default, though auth usually uses 0 or 1, code logic in legacy used 2 hardcoded in createBiliWsPacket)
    // Wait, legacy code hardcoded 2 in createBiliWsPacket. But auth body is usually JSON string.
    // Let's check legacy code again.
    // createBiliWsPacket: buf.writeInt16BE(2, 6); // Version (修正为2)
    // It seems they use version 2 even for uncompressed upstream packets? 
    // Usually upstream is Ver 1 (Heartbeat) or Ver 0/1 (Auth).
    // Let's allow passing version or stick to legacy behavior. 
    // Actually, for Auth packet (Op 7), body is string. For Heartbeat (Op 2), body is empty.
    
    buf.writeInt32BE(op, 8);              // Operation
    buf.writeInt32BE(this.SEQUENCE, 12);  // Sequence
    
    bodyBuf.copy(buf, this.HEADER_LENGTH);
    return buf;
  }

  /**
   * Decode Bilibili WebSocket packet
   * Handles sticky packets and compression
   */
  static decode(buffer: Buffer): { header: WsHeader; body: any }[] {
    const result: { header: WsHeader; body: any }[] = [];
    let offset = 0;

    while (offset + this.HEADER_LENGTH <= buffer.length) {
      const packetLen = buffer.readInt32BE(offset);
      
      // Safety check for invalid packet length
      if (packetLen < this.HEADER_LENGTH || packetLen > 10 * 1024 * 1024) {
          console.warn(`[Protocol] Invalid packet length: ${packetLen}, clearing buffer.`);
          break; 
      }
      
      if (offset + packetLen > buffer.length) {
        break; // Wait for more data
      }

      const headerLen = buffer.readInt16BE(offset + 4);
      const ver = buffer.readInt16BE(offset + 6);
      const op = buffer.readInt32BE(offset + 8);
      const seq = buffer.readInt32BE(offset + 12);

      const header: WsHeader = { packetLen, headerLen, ver, op, seq };
      const bodyBuf = buffer.slice(offset + headerLen, offset + packetLen);
      
      let body: any = bodyBuf;

      if (op === WsOp.MESSAGE) {
        if (ver === WsVersion.NORMAL) {
          try {
            body = JSON.parse(bodyBuf.toString());
            result.push({ header, body });
          } catch (e) {
            console.error('[Protocol] Failed to parse JSON body (Ver 0)', e);
          }
        } else if (ver === WsVersion.ZLIB) {
          try {
             // Decompress
            const decompressed = zlib.inflateSync(bodyBuf);
            // Recursively decode the inner buffer
            const innerPackets = this.decode(decompressed);
            result.push(...innerPackets);
          } catch (e) {
            console.error('[Protocol] Failed to decompress body (Ver 2)', e);
          }
        }
      } else if (op === WsOp.CONNECT_SUCCESS) {
          // Op 8 usually has no body or simple body
          result.push({ header, body });
      } else if (op === WsOp.HEARTBEAT_REPLY) {
          // Op 3 body is usually popularity count (Int32BE)
          const popularity = bodyBuf.readInt32BE(0);
          result.push({ header, body: popularity });
      } else {
          result.push({ header, body });
      }

      offset += packetLen;
    }

    return result;
  }
}
