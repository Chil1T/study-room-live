import crypto from 'crypto';

export class BiliCrypto {
  /**
   * Calculate MD5 of content
   */
  static getMd5Content(str: string): string {
    return crypto
      .createHash("md5")
      .update(str)
      .digest("hex");
  }

  /**
   * Generate headers with signature for Bilibili Open Platform API
   */
  static signHeaders(
    appKey: string,
    appSecret: string,
    body: any = {}
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = (Math.floor(Math.random() * 100000) + parseInt(timestamp)).toString();
    const contentMD5 = this.getMd5Content(JSON.stringify(body));

    const headers: Record<string, string> = {
      "x-bili-accesskeyid": appKey,
      "x-bili-content-md5": contentMD5,
      "x-bili-signature-method": "HMAC-SHA256",
      "x-bili-signature-nonce": nonce,
      "x-bili-signature-version": "1.0",
      "x-bili-timestamp": timestamp
    };

    // Sort keys and build string to sign
    const stringToSign = Object.keys(headers)
      .sort()
      .map(key => `${key}:${headers[key]}`)
      .join("\n");

    // Calculate signature
    const signature = crypto
      .createHmac("sha256", appSecret)
      .update(stringToSign)
      .digest("hex");

    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...headers,
      "Authorization": signature
    };
  }
}
