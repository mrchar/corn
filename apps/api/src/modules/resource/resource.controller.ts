import { Body, Controller, Delete, Get, Next, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { ListQuery } from '../../common/pagination';
import { success } from '../../common/response';
import { ResourceTypeService } from '../resource-type/resource-type.service';
import { ResourceService } from './resource.service';

/**
 * 资源实例的动态路由：路径段 :typeCode 直接对应资源类型编码。
 * 若 :typeCode 不是已存在的资源类型，则调用 next() 让固定路径路由（creations / openapi.json 等）接管。
 */
@Controller('spaces/:spaceId/:typeCode')
export class ResourceController {
  constructor(
    private readonly resources: ResourceService,
    private readonly types: ResourceTypeService,
  ) {}

  private async resolveType(spaceId: string, typeCode: string, next: NextFunction): Promise<boolean> {
    const type = await this.types.findByCode(spaceId, typeCode);
    if (!type) {
      next();
      return false;
    }
    return true;
  }

  @Get()
  async list(
    @Param('spaceId') spaceId: string,
    @Param('typeCode') typeCode: string,
    @Query() query: ListQuery,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!(await this.resolveType(spaceId, typeCode, next))) return;
    res.json(await this.resources.list(spaceId, typeCode, query));
  }

  @Post()
  async create(
    @Param('spaceId') spaceId: string,
    @Param('typeCode') typeCode: string,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!(await this.resolveType(spaceId, typeCode, next))) return;
    res.json(success('资源已创建', await this.resources.create(spaceId, typeCode, body)));
  }

  @Get(':id')
  async detail(
    @Param('spaceId') spaceId: string,
    @Param('typeCode') typeCode: string,
    @Param('id') id: string,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!(await this.resolveType(spaceId, typeCode, next))) return;
    res.json(success('查询成功', await this.resources.detail(spaceId, typeCode, id)));
  }

  @Patch(':id')
  async update(
    @Param('spaceId') spaceId: string,
    @Param('typeCode') typeCode: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!(await this.resolveType(spaceId, typeCode, next))) return;
    res.json(success('资源已更新', await this.resources.update(spaceId, typeCode, id, body)));
  }

  @Delete(':id')
  async remove(
    @Param('spaceId') spaceId: string,
    @Param('typeCode') typeCode: string,
    @Param('id') id: string,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!(await this.resolveType(spaceId, typeCode, next))) return;
    res.json(success('资源已归档', await this.resources.remove(spaceId, typeCode, id)));
  }
}
