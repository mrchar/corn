import { IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: '用户名只能由字母、数字、下划线与连字符组成' })
  username: string;

  @IsString()
  @Length(6, 64, { message: '密码长度须在 6-64 位之间' })
  password: string;
}

export class LoginDto {
  @IsString()
  @Length(1, 32)
  username: string;

  @IsString()
  @Length(1, 64)
  password: string;
}

export class RefreshDto {
  @IsString()
  @Length(1, 200)
  refreshToken: string;
}

export class LogoutDto {
  @IsString()
  @Length(1, 200)
  refreshToken: string;
}
