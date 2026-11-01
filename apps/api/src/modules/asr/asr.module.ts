import { Module } from '@nestjs/common';
import { AsrController } from './asr.controller';
import { AsrGateway } from './asr.gateway';
import { DoubaoAsrService } from './doubao-asr.service';

@Module({
  controllers: [AsrController],
  providers: [DoubaoAsrService, AsrGateway],
})
export class AsrModule {}
