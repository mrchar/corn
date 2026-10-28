import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetadataService } from './metadata.service';

@Controller('spaces/:spaceId')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get('openapi.json')
  async openapi(@Param('spaceId') spaceId: string, @Res() res: Response) {
    const doc = await this.metadata.generate(spaceId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 文档驱动前端资源池视图，类型增删改/停用后必须实时反映，禁止任何缓存
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(doc));
  }
}
