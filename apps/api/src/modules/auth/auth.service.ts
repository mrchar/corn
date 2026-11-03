import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError, ErrorCodes } from '../../common/errors';
import { newId } from '../../common/ids';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './auth.dto';

/** 登录成功后下发的双令牌与用户信息 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string };
}

/** refresh token 有效天数（env 覆盖，默认 30 天） */
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS ?? 30);

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * 注册登录与双令牌签发。
 * access token：短效 JWT，无状态校验；refresh token：长效随机串，sha256 落库、
 * 每次刷新轮换（旧令牌即刻作废），支持登出吊销。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existed = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existed) {
      throw new AppError(ErrorCodes.CONFLICT, '用户名已被占用', { username: dto.username }, 409);
    }
    const user = await this.prisma.user.create({
      data: {
        id: newId('us'),
        username: dto.username,
        passwordHash: hashPassword(dto.password),
      },
    });
    return this.issueTokens(user.id, user.username);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !verifyPassword(dto.password, user.passwordHash)) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, '用户名或密码错误', {}, 401);
    }
    return this.issueTokens(user.id, user.username);
  }

  async refresh(dto: RefreshDto): Promise<AuthTokens> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(dto.refreshToken) },
      include: { user: true },
    });
    const invalid = !record
      || record.revokedAt !== null
      || record.expiresAt.getTime() <= Date.now();
    if (invalid) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, '登录已过期，请重新登录', {}, 401);
    }
    // 轮换：旧 refresh token 用后即作废
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user.id, record.user.username);
  }

  async logout(dto: LogoutDto): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(dto.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, username: string): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId, username });
    const refreshToken = `rt_${randomBytes(24).toString('hex')}`;
    await this.prisma.refreshToken.create({
      data: {
        id: newId('tk'),
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken, user: { id: userId, username } };
  }
}
