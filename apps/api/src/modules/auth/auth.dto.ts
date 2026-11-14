import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: '用户名' })
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: '用户名只能由字母、数字、下划线与连字符组成' })
  username: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @Length(6, 64, { message: '密码长度须在 6-64 位之间' })
  password: string;
}

export class LoginDto {
  @ApiProperty({ description: '用户名' })
  @IsString()
  @Length(1, 32)
  username: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @Length(1, 64)
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: '刷新令牌' })
  @IsString()
  @Length(1, 200)
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({ description: '刷新令牌' })
  @IsString()
  @Length(1, 200)
  refreshToken: string;
}

/** 会话凭据（响应）：创建/续期会话均返回一组新令牌 */
export class AuthTokensResponse {
  @ApiProperty({ description: '访问令牌' })
  accessToken: string;

  @ApiProperty({ description: '刷新令牌' })
  refreshToken: string;
}
