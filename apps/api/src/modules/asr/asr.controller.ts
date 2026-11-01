import { Controller, Get } from '@nestjs/common';
import { DoubaoAsrService } from './doubao-asr.service';

/** 语音识别能力探测：前端据此选择真实识别或仿真识别 */
@Controller('asr')
export class AsrController {
  constructor(private readonly doubao: DoubaoAsrService) {}

  @Get('status')
  status(): { configured: boolean } {
    return { configured: this.doubao.isConfigured() };
  }
}
