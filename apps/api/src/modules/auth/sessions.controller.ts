import { Body, Controller, Delete, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator';
import { AuthTokensResponse, LoginDto, LogoutDto, RefreshDto } from './auth.dto';
import { AuthService } from './auth.service';

/**
 * 会话资源（名词化认证）：登录 = 创建会话（POST /sessions），
 * 续期 = 更新会话（PATCH /sessions/current），登出 = 删除会话（DELETE /sessions/current）。
 * 'current' 为当前会话的别名（与 /users/me 同构），全部公开（凭据自证）。
 */
@ApiTags('sessions')
@Public()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @ApiOperation({ summary: '创建会话（登录）' })
  @ApiOkResponse({ type: AuthTokensResponse })
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新会话（续期）' })
  @ApiOkResponse({ type: AuthTokensResponse })
  async refresh(@Param('id') id: string, @Body() dto: RefreshDto) {
    this.requireCurrent(id);
    return this.auth.refresh(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除会话（登出）' })
  @ApiOkResponse({ description: '登出成功' })
  async logout(@Param('id') id: string, @Body() dto: LogoutDto) {
    this.requireCurrent(id);
    await this.auth.logout(dto);
  }

  /** 仅当前会话可续期/登出（'current' 为当前会话别名） */
  private requireCurrent(id: string): void {
    if (id !== 'current') throw new NotFoundException('会话不存在');
  }
}
