import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/** 将 env 中的 TTL（如 2h / 30m / 900）解析为秒数，非法时回落 2 小时 */
function accessTtlSeconds(): number {
  const raw = process.env.JWT_ACCESS_TTL ?? '2h';
  const match = /^(\d+)([smh]?)$/.exec(raw.trim());
  if (!match) return 2 * 60 * 60;
  const factor = match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1;
  return Number(match[1]) * factor;
}

/**
 * 认证模块：注册登录、双令牌签发与校验。
 * JWT_SECRET 缺失时在模块初始化阶段即抛错，避免带病启动。
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? (() => {
        throw new Error('缺少 JWT_SECRET 环境变量（apps/api/.env）');
      })(),
      signOptions: { expiresIn: accessTtlSeconds() },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
