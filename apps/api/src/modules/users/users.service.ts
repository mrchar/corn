import { Injectable } from '@nestjs/common';
import { AppError, ErrorCodes } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateMeDto } from './users.dto';

/** 当前用户视图：含用户级组织开关 */
export interface MeView {
  id: string;
  username: string;
  enableSpace: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<MeView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(ErrorCodes.NOT_FOUND, '用户不存在', { userId }, 404);
    return { id: user.id, username: user.username, enableSpace: user.enableSpace };
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<MeView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(ErrorCodes.NOT_FOUND, '用户不存在', { userId }, 404);
    if (dto.enableSpace === false) {
      const spaceCount = await this.prisma.space.count({ where: { ownerId: userId } });
      if (spaceCount > 1) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          '已创建多个空间，无法关闭使用空间',
          { spaceCount },
          409,
        );
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { enableSpace: dto.enableSpace },
    });
    return { id: updated.id, username: updated.username, enableSpace: updated.enableSpace };
  }
}
