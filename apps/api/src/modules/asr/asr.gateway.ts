import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { DoubaoAsrService, type DoubaoAsrSession } from './doubao-asr.service';

/**
 * 前端音频网关：挂在 HTTP server 的 /ws/asr 路径上。
 * 握手凭 query 参数 ?token=<accessToken> 传递登录凭据（浏览器 WebSocket 无法自定义请求头），
 * 校验失败立即以 4401 关闭连接。
 * 客户端 → 服务端：文本帧为控制信令（start/stop），二进制帧为 16kHz 16bit 单声道 PCM 分片。
 * 服务端 → 客户端：JSON 文本帧（ready/partial/final/error）。
 */
@Injectable()
export class AsrGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AsrGateway.name);
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly doubao: DoubaoAsrService,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit(): void {
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer?.();
    if (!httpServer) {
      this.logger.warn('未取得 HTTP server 实例，ASR WebSocket 网关未挂载');
      return;
    }
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws/asr' });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.logger.log('ASR WebSocket 网关已挂载（/ws/asr）');
  }

  onModuleDestroy(): void {
    this.wss?.close();
    this.wss = null;
  }

  private async handleConnection(ws: WebSocket, req: import('node:http').IncomingMessage): Promise<void> {
    // 握手鉴权：token 缺失或无效立即关闭（4401 自定义码，前端可识别）
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    try {
      await this.jwt.verifyAsync(token);
    } catch {
      ws.close(4401, 'unauthorized');
      return;
    }

    let session: DoubaoAsrSession | null = null;
    const send = (payload: Record<string, unknown>): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };

    ws.on('message', (raw: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (!session) {
          send({ type: 'error', code: 'NOT_STARTED', message: '请先发送 start 信令' });
          return;
        }
        session.sendAudio(toBuffer(raw));
        return;
      }
      let message: { type?: string };
      try {
        message = JSON.parse(toBuffer(raw).toString('utf8')) as { type?: string };
      } catch {
        send({ type: 'error', code: 'BAD_MESSAGE', message: '信令必须是 JSON 文本帧' });
        return;
      }
      if (message.type === 'start') {
        if (session) return;
        if (!this.doubao.isConfigured()) {
          send({
            type: 'error',
            code: 'ASR_NOT_CONFIGURED',
            message: '豆包语音识别未配置（缺少 DOUBAO_ASR_APP_ID / DOUBAO_ASR_ACCESS_TOKEN）',
          });
          return;
        }
        session = this.doubao.createSession({
          onReady: () => send({ type: 'ready' }),
          onText: (text, final) => send({ type: final ? 'final' : 'partial', text }),
          onError: (msg) => send({ type: 'error', message: msg }),
          onClose: () => {
            session = null;
          },
        });
        return;
      }
      if (message.type === 'stop') {
        session?.finish();
      }
    });

    ws.on('close', () => session?.close());
    ws.on('error', () => session?.close());
  }
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data as ArrayBuffer);
}
