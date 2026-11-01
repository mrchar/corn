import { Module } from '@nestjs/common';
import { LlmProxyController } from './llm.controller';

/** LLM 代理：纯 OpenAI 兼容转发，无服务、无业务语义 */
@Module({
  controllers: [LlmProxyController],
})
export class LlmModule {}
