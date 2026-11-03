import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { success } from '../../common/response';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

/** 注册登录端点：全部公开（凭据自证），响应统一走 success 信封 */
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return success('注册成功', await this.auth.register(dto));
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return success('登录成功', await this.auth.login(dto));
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return success('续期成功', await this.auth.refresh(dto));
  }

  @Post('logout')
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto);
    return success('已退出登录');
  }
}
