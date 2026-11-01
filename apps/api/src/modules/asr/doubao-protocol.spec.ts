import { gunzipSync, gzipSync } from 'node:zlib';
import {
  decodeFrame,
  encodeAudioOnlyRequest,
  encodeFullClientRequest,
  MESSAGE_FLAG,
  MESSAGE_TYPE,
} from './doubao-protocol';

/** 按服务端帧结构构造测试帧：header(4B) [+ seq(4B)] + payloadSize(4B) + payload */
function buildServerFrame(
  type: number,
  flags: number,
  seq: number | null,
  payload: Buffer,
  compression: number,
): Buffer {
  const header = Buffer.from([0x11, (type << 4) | flags, (0b0001 << 4) | compression, 0]);
  const parts: Buffer[] = [header];
  if (seq !== null) {
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeInt32BE(seq, 0);
    parts.push(seqBuf);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  parts.push(size, payload);
  return Buffer.concat(parts);
}

describe('doubao-protocol 帧编解码', () => {
  describe('encodeFullClientRequest', () => {
    it('生成 JSON + Gzip、携带 sequence 的 full client request 帧', () => {
      const payload = { request: { model_name: 'bigmodel' }, audio: { rate: 16000 } };
      const buf = encodeFullClientRequest(1, payload);

      expect(buf[0]).toBe(0x11); // version 0b0001 | header size 0b0001
      expect(buf[1] >> 4).toBe(MESSAGE_TYPE.FullClientRequest);
      expect(buf[1] & 0x0f).toBe(MESSAGE_FLAG.PositiveSeq);
      expect(buf[2] >> 4).toBe(0b0001); // JSON 序列化
      expect(buf[2] & 0x0f).toBe(0b0001); // Gzip 压缩
      expect(buf[3]).toBe(0); // reserved

      expect(buf.readInt32BE(4)).toBe(1);
      const size = buf.readUInt32BE(8);
      expect(size).toBe(buf.length - 12);
      expect(JSON.parse(gunzipSync(buf.subarray(12)).toString('utf8'))).toEqual(payload);
    });
  });

  describe('encodeAudioOnlyRequest', () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    it('正包携带正 sequence 且音频不压缩', () => {
      const buf = encodeAudioOnlyRequest(3, pcm, false);

      expect(buf[1] >> 4).toBe(MESSAGE_TYPE.AudioOnlyRequest);
      expect(buf[1] & 0x0f).toBe(MESSAGE_FLAG.PositiveSeq);
      expect(buf[2]).toBe(0x00); // 无序列化、无压缩
      expect(buf.readInt32BE(4)).toBe(3);
      expect(buf.readUInt32BE(8)).toBe(pcm.length);
      expect(buf.subarray(12)).toEqual(pcm);
    });

    it('负包（最后一包）sequence 取负', () => {
      const buf = encodeAudioOnlyRequest(3, Buffer.alloc(0), true);

      expect(buf[1] & 0x0f).toBe(MESSAGE_FLAG.NegativeSeq);
      expect(buf.readInt32BE(4)).toBe(-3);
      expect(buf.readUInt32BE(8)).toBe(0);
      expect(buf.length).toBe(12);
    });

    it('拒绝非正整数 sequence', () => {
      expect(() => encodeAudioOnlyRequest(0, pcm, false)).toThrow();
      expect(() => encodeAudioOnlyRequest(-1, pcm, false)).toThrow();
    });
  });

  describe('decodeFrame', () => {
    it('解析带正 sequence 的 gzip JSON 响应', () => {
      const body = Buffer.from(JSON.stringify({ result: { text: '打开资源池' } }), 'utf8');
      const frame = buildServerFrame(MESSAGE_TYPE.FullServerResponse, MESSAGE_FLAG.PositiveSeq, 5, gzipSync(body), 0b0001);

      const decoded = decodeFrame(frame);
      expect(decoded.type).toBe(MESSAGE_TYPE.FullServerResponse);
      expect(decoded.seq).toBe(5);
      expect(JSON.parse(decoded.payload.toString('utf8')).result.text).toBe('打开资源池');
    });

    it('识别负 sequence 的最后一包', () => {
      const body = gzipSync(Buffer.from(JSON.stringify({ result: { text: '定稿' } }), 'utf8'));
      const frame = buildServerFrame(MESSAGE_TYPE.FullServerResponse, MESSAGE_FLAG.NegativeSeq, -6, body, 0b0001);

      const decoded = decodeFrame(frame);
      expect(decoded.seq).toBe(-6);
    });

    it('解析无 sequence 的错误帧（payloadSize 前含 4B 错误码）', () => {
      const body = Buffer.from(JSON.stringify({ error: 'decode failed' }), 'utf8');
      const header = Buffer.from([0x11, 0xf0, 0x10, 0]);
      const parts: Buffer[] = [header];
      const errorCode = Buffer.alloc(4);
      errorCode.writeUInt32BE(45000000, 0);
      parts.push(errorCode);
      const size = Buffer.alloc(4);
      size.writeUInt32BE(body.length, 0);
      parts.push(size, body);
      const frame = Buffer.concat(parts);

      const decoded = decodeFrame(frame);
      expect(decoded.type).toBe(MESSAGE_TYPE.ServerError);
      expect(decoded.seq).toBeNull();
      expect(decoded.errorCode).toBe(45000000);
      expect(JSON.parse(decoded.payload.toString('utf8')).error).toBe('decode failed');
    });

    it('拒绝不完整帧', () => {
      expect(() => decodeFrame(Buffer.from([0x11, 0x91, 0x11, 0x00]))).toThrow();
      const truncated = buildServerFrame(
        MESSAGE_TYPE.FullServerResponse,
        MESSAGE_FLAG.PositiveSeq,
        1,
        Buffer.alloc(16),
        0b0000,
      ).subarray(0, 14);
      expect(() => decodeFrame(truncated)).toThrow();
    });
  });
});
