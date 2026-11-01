import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import {
  decodeFrame,
  encodeAudioOnlyRequest,
  encodeFullClientRequest,
  MESSAGE_TYPE,
  type AsrFrame,
} from './doubao-protocol';

/** 豆包大模型流式语音识别会话回调 */
export interface DoubaoAsrEvents {
  /** 豆包 WS 建连成功且 full client request 已发出 */
  onReady(): void;
  /** 识别文本更新；final 为 true 表示服务端最后一包（整段定稿） */
  onText(text: string, final: boolean): void;
  onError(message: string): void;
  onClose(): void;
}

interface DoubaoAsrConfig {
  endpoint: string;
  appId: string;
  accessToken: string;
  resourceId: string;
}

/** 双向流式优化版：结果有变化才返回，官方推荐 */
const DEFAULT_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';
/** 豆包流式语音识别模型 1.0 小时版 */
const DEFAULT_RESOURCE_ID = 'volc.bigasr.sauc.duration';

/**
 * 豆包 ASR 会话工厂：鉴权信息从环境变量读取，
 * 未配置时由网关侧降级，不创建会话。
 */
@Injectable()
export class DoubaoAsrService {
  private readonly logger = new Logger(DoubaoAsrService.name);

  isConfigured(): boolean {
    return Boolean(process.env.DOUBAO_ASR_APP_ID && process.env.DOUBAO_ASR_ACCESS_TOKEN);
  }

  createSession(events: DoubaoAsrEvents): DoubaoAsrSession {
    const config: DoubaoAsrConfig = {
      endpoint: process.env.DOUBAO_ASR_ENDPOINT || DEFAULT_ENDPOINT,
      appId: process.env.DOUBAO_ASR_APP_ID ?? '',
      accessToken: process.env.DOUBAO_ASR_ACCESS_TOKEN ?? '',
      resourceId: process.env.DOUBAO_ASR_RESOURCE_ID || DEFAULT_RESOURCE_ID,
    };
    return new DoubaoAsrSession(config, events, this.logger);
  }
}

/** 单次语音识别会话：连接豆包、上行 PCM、下发识别文本。 */
export class DoubaoAsrSession {
  private readonly ws: WebSocket;
  /** 服务端按请求顺序自动编号：full request 占 1，音频包从 2 起严格递增，负包取负 */
  private seq = 1;
  private open = false;
  private finished = false;
  private closed = false;
  private readonly pendingAudio: Buffer[] = [];
  private pendingFinish = false;

  constructor(
    private readonly config: DoubaoAsrConfig,
    private readonly events: DoubaoAsrEvents,
    private readonly logger: Logger,
  ) {
    this.ws = new WebSocket(config.endpoint, {
      headers: {
        'X-Api-App-Key': config.appId,
        'X-Api-Access-Key': config.accessToken,
        'X-Api-Resource-Id': config.resourceId,
        'X-Api-Connect-Id': randomUUID(),
      },
      handshakeTimeout: 10_000,
    });
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    this.ws.on('error', (err: Error) => {
      this.logger.warn(`豆包 ASR 连接异常：${err.message}`);
      this.events.onError(`豆包识别服务连接失败：${err.message}`);
      this.close();
    });
    this.ws.on('close', () => {
      if (!this.closed) {
        this.closed = true;
        this.events.onClose();
      }
    });
  }

  /** 上行音频分片；建连完成前到达的分片会先积压，就绪后按序补发 */
  sendAudio(chunk: Buffer): void {
    if (this.closed || this.finished) return;
    if (!this.open) {
      this.pendingAudio.push(chunk);
      return;
    }
    this.seq += 1;
    this.ws.send(encodeAudioOnlyRequest(this.seq, chunk, false));
  }

  /** 发送负包，通知服务端音频结束，等待最终定稿 */
  finish(): void {
    if (this.closed || this.finished) return;
    if (!this.open) {
      this.pendingFinish = true;
      return;
    }
    this.finished = true;
    this.seq += 1;
    this.ws.send(encodeAudioOnlyRequest(this.seq, Buffer.alloc(0), true));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }
  }

  private onOpen(): void {
    // 协议要求建连后首包为 full client request：音频元数据 + 识别参数
    const payload = {
      user: { uid: 'corn-backend' },
      audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: true,
        result_type: 'full',
      },
    };
    this.ws.send(encodeFullClientRequest(this.seq, payload));
    this.open = true;
    this.events.onReady();
    for (const chunk of this.pendingAudio.splice(0)) this.sendAudio(chunk);
    if (this.pendingFinish) this.finish();
  }

  private onMessage(data: RawData, isBinary: boolean): void {
    if (!isBinary) return;
    let frame: AsrFrame;
    try {
      frame = decodeFrame(toBuffer(data));
    } catch (err) {
      this.events.onError(`解析豆包响应帧失败：${(err as Error).message}`);
      this.close();
      return;
    }
    if (frame.type === MESSAGE_TYPE.ServerError) {
      let detail = frame.payload.toString('utf8');
      try {
        const body = JSON.parse(detail) as { error?: string; message?: string };
        detail = body.error ?? body.message ?? detail;
      } catch {
        /* 保留原始文本 */
      }
      this.events.onError(`豆包识别服务错误（${frame.errorCode ?? 'unknown'}）：${detail}`);
      this.close();
      return;
    }
    if (frame.type === MESSAGE_TYPE.FullServerResponse) {
      const isLast = frame.seq !== null && frame.seq < 0;
      try {
        const body = JSON.parse(frame.payload.toString('utf8')) as { result?: { text?: string } };
        const text = body.result?.text ?? '';
        if (text) this.events.onText(text, isLast);
      } catch {
        this.events.onError('解析豆包识别结果失败');
      }
      if (isLast) this.close();
    }
  }
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data as ArrayBuffer);
}
