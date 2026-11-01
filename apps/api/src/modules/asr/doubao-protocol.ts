import { gzipSync, gunzipSync } from 'node:zlib';

/**
 * 豆包流式语音识别 WebSocket 二进制协议帧编解码。
 * 帧结构：header(4B) [+ sequence(4B，仅当 flag 指示携带时)] + payloadSize(4B) + payload。
 * 协议中所有整数均为大端。
 */

export const MESSAGE_TYPE = {
  /** 端上发送：包含请求参数的 full client request */
  FullClientRequest: 0b0001,
  /** 端上发送：包含音频数据的 audio only request */
  AudioOnlyRequest: 0b0010,
  /** 服务端下发：包含识别结果的 full server response */
  FullServerResponse: 0b1001,
  /** 服务端下发：处理错误（如鉴权失败、参数非法） */
  ServerError: 0b1111,
} as const;

export const MESSAGE_FLAG = {
  /** header 后不携带 sequence */
  NoSeq: 0b0000,
  /** header 后 4B 为正 sequence */
  PositiveSeq: 0b0001,
  /** 不携带 sequence 的最后一包 */
  LastNoSeq: 0b0010,
  /** header 后 4B 为负 sequence（最后一包/负包） */
  NegativeSeq: 0b0011,
} as const;

const SERIALIZATION = { None: 0b0000, Json: 0b0001 } as const;
const COMPRESSION = { None: 0b0000, Gzip: 0b0001 } as const;

const PROTOCOL_VERSION = 0b0001;
const HEADER_SIZE_UNITS = 0b0001; // 实际 header 大小 = 1 * 4B

function buildHeader(
  messageType: number,
  flags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE_UNITS,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0, // reserved
  ]);
}

/**
 * full client request：JSON 序列化 + Gzip 压缩。
 * 服务端按请求顺序自动编号（full request 占 seq=1），须显式携带 sequence 保持一致。
 */
export function encodeFullClientRequest(seq: number, payload: Record<string, unknown>): Buffer {
  const body = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const header = buildHeader(
    MESSAGE_TYPE.FullClientRequest,
    MESSAGE_FLAG.PositiveSeq,
    SERIALIZATION.Json,
    COMPRESSION.Gzip,
  );
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(seq, 0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, seqBuf, size, body]);
}

/**
 * audio only request：payload 为原始 PCM 字节（无序列化、无压缩）。
 * isLast 时发送负包：sequence 取负，payload 允许为空。
 */
export function encodeAudioOnlyRequest(seq: number, audio: Buffer, isLast: boolean): Buffer {
  if (!Number.isInteger(seq) || seq <= 0) {
    throw new Error('音频包 sequence 必须为正整数');
  }
  const header = buildHeader(
    MESSAGE_TYPE.AudioOnlyRequest,
    isLast ? MESSAGE_FLAG.NegativeSeq : MESSAGE_FLAG.PositiveSeq,
    SERIALIZATION.None,
    COMPRESSION.None,
  );
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(isLast ? -seq : seq, 0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(audio.length, 0);
  return Buffer.concat([header, seqBuf, size, audio]);
}

export interface AsrFrame {
  type: number;
  flags: number;
  /** 无 seq 帧为 null；负 seq 表示服务端最后一包（整段定稿） */
  seq: number | null;
  /** 仅错误帧携带（0b1111 帧在 payloadSize 前多 4 字节错误码） */
  errorCode: number | null;
  /** 已解压的 payload 原始字节 */
  payload: Buffer;
}

/** 解析服务端帧（full server response / server error），按帧头指示自动解压。 */
export function decodeFrame(data: Buffer): AsrFrame {
  if (data.length < 8) throw new Error('ASR 帧过短');
  const headerSize = (data[0] & 0x0f) * 4;
  const type = (data[1] >> 4) & 0x0f;
  const flags = data[1] & 0x0f;
  const compression = data[2] & 0x0f;
  let offset = headerSize;
  let seq: number | null = null;
  // 0b0001 与 0b0011 的 bit0 均为 1，表示携带 sequence
  if ((flags & MESSAGE_FLAG.PositiveSeq) !== 0) {
    seq = data.readInt32BE(offset);
    offset += 4;
  }
  let errorCode: number | null = null;
  if (type === MESSAGE_TYPE.ServerError) {
    if (data.length < offset + 4) throw new Error('ASR 错误帧缺少 errorCode');
    errorCode = data.readUInt32BE(offset);
    offset += 4;
  }
  if (data.length < offset + 4) throw new Error('ASR 帧缺少 payloadSize');
  const payloadSize = data.readUInt32BE(offset);
  offset += 4;
  if (data.length < offset + payloadSize) throw new Error('ASR 帧 payload 不完整');
  let payload = data.subarray(offset, offset + payloadSize);
  if (compression === COMPRESSION.Gzip) payload = gunzipSync(payload);
  return { type, flags, seq, errorCode, payload };
}
