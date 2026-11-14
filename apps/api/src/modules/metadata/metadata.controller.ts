import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { MetadataService } from './metadata.service';

function sendDoc(res: Response, doc: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 文档驱动前端资源池视图，类型增删改/停用后必须实时反映，禁止任何缓存
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(doc));
}

/** 空间级文档：动态资源类型 + 空间内静态资源（domains/groups/...） */
@Controller('spaces/:spaceId')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get('openapi.json')
  @ApiExcludeEndpoint()
  async openapi(@Param('spaceId') spaceId: string, @Res() res: Response) {
    sendDoc(res, await this.metadata.generate(spaceId));
  }
}

/** 全局文档：顶层资源（spaces/users/sessions） */
@ApiExcludeController()
@Controller()
export class GlobalMetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get('openapi.json')
  async openapi(@Res() res: Response) {
    sendDoc(res, this.metadata.generateGlobal());
  }
}
