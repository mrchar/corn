import 'reflect-metadata';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setBaseDocument } from './modules/metadata/base-document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: false,
      forbidNonWhitelisted: false,
    }),
  );
  // 文档由控制器与数据模型的注解生成，禁止手写 JSON（动态资源类型除外）
  const config = new DocumentBuilder()
    .setTitle('资源管理云服务')
    .setDescription('URL 即资源：集合/单项/属性更新，动作通过创建记录资源或更新状态属性表达。')
    .setVersion('0.1.0')
    .build();
  setBaseDocument(SwaggerModule.createDocument(app, config) as unknown as Record<string, unknown>);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`corn api listening on http://localhost:${port}`);
}

void bootstrap();
