import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth.guard';
import { Public } from '../../common/public.decorator';
import { AuthTokensResponse, RegisterDto } from '../auth/auth.dto';
import { AuthService } from '../auth/auth.service';
import { UpdateMeDto, UserResponse } from './users.dto';
import { UsersService } from './users.service';

/**
 * 用户资源：注册 = 创建用户（POST /users，公开）；
 * 当前用户 = 标准单项资源 /users/:id（id 取 'me' 或本人 id，其余 403）。
 * 响应均为裸对象（无信封）。
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: '创建用户（注册）' })
  @ApiOkResponse({ type: AuthTokensResponse })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '查询用户（me 或本人 id）' })
  @ApiOkResponse({ type: UserResponse })
  async detail(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.users.me(this.requireSelf(id, req));
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新用户（me 或本人 id）' })
  @ApiOkResponse({ type: UserResponse })
  async update(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(this.requireSelf(id, req), dto);
  }

  /** 'me' 或本人 id 生效，其余拒绝 */
  private requireSelf(id: string, req: AuthenticatedRequest): string {
    const userId = req.user!.id;
    if (id !== 'me' && id !== userId) throw new ForbiddenException('仅可操作本人信息');
    return userId;
  }
}
