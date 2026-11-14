import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator';
import { DoubaoAsrService } from './doubao-asr.service';

/** 语音识别能力探测：前端据此选择真实识别或仿真识别（公开端点，无凭据泄露面） */
@ApiExcludeController()
@Public()
@Controller('asr')
export class AsrController {
  constructor(private readonly doubao: DoubaoAsrService) {}

  @Get('status')
  status(): { configured: boolean } {
    return { configured: this.doubao.isConfigured() };
  }
}
