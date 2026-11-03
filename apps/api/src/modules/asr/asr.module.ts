import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AsrController } from './asr.controller';
import { AsrGateway } from './asr.gateway';
import { DoubaoAsrService } from './doubao-asr.service';

@Module({
  // AuthModule 导出 JwtModule，供 AsrGateway 在 WS 握手时校验 token
  imports: [AuthModule],
  controllers: [AsrController],
  providers: [DoubaoAsrService, AsrGateway],
})
export class AsrModule {}
