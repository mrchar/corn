import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth.guard';
import { success } from '../../common/response';
import { UpdateMeDto } from './users.dto';
import { UsersService } from './users.service';

/** 当前用户信息与用户级组织开关 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    return success('查询成功', await this.users.me(req.user!.id));
  }

  @Patch('me')
  async updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateMeDto) {
    return success('已更新', await this.users.updateMe(req.user!.id, dto));
  }
}
