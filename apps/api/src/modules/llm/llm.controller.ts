import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * LLM 代理 = 标准 OpenAI 兼容反向代理，零业务语义、零智能体逻辑。
 * 请求原样转发、响应原样回传（含 SSE 流）；大模型配置（模型 ID、凭据）全部在后端注入：
 * Authorization 头承载的是本系统自有认证凭据（未来实现），必须剥离、绝不透传给上游。
 * 智能体的系统提示、工具 schema、执行循环全部在前端。
 */

/** 上游 OpenAI 兼容端点默认地址（火山方舟北京站） */
const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

/** 可达性探测端点：前端据此确认代理可用（无空间路径，公开） */
@Controller('agent')
export class LlmProxyController {
  @Get('status')
  status() {
    return { configured: true };
  }

  /** OpenAI 兼容转发：POST /agent/v1/chat/completions → {BASE}/chat/completions（模型与凭据由代理注入） */
  @Post('v1/chat/completions')
  async completions(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = process.env.ARK_BASE_URL || DEFAULT_BASE_URL;
    const payload = {
      ...((req.body as Record<string, unknown>) ?? {}),
      model: process.env.ARK_MODEL ?? '',
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ARK_API_KEY ?? ''}`,
    };
    try {
      const upstream = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body as NodeWebReadableStream).pipe(res);
    } catch {
      res.status(502).json({ error: { message: '模型端点不可达', type: 'upstream_error' } });
    }
  }
}
