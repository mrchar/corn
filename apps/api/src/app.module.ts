import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppErrorFilter } from './common/app-error.filter';
import { AuthGuard } from './common/auth.guard';
import { SpaceGuard } from './common/space.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SpaceModule } from './modules/space/space.module';
import { DomainModule } from './modules/domain/domain.module';
import { GroupModule } from './modules/group/group.module';
import { ResourceTypeModule } from './modules/resource-type/resource-type.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MetadataModule } from './modules/metadata/metadata.module';
import { AsrModule } from './modules/asr/asr.module';
import { UsersModule } from './modules/users/users.module';
// 注意：ResourceModule 提供动态路径 spaces/:spaceId/:typeCode，必须在所有固定路径模块之后注册，
// 否则 creations / reservations / resource-types 等固定端点会被吞掉。
import { ResourceModule } from './modules/resource/resource.module';
import { LlmModule } from './modules/llm/llm.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SpaceModule,
    DomainModule,
    GroupModule,
    ResourceTypeModule,
    // MetadataModule 必须在 ResourceModule 之前注册，否则 /openapi.json 会被动态 :typeCode 路由吞掉。
    MetadataModule,
    // AsrModule 提供固定路径 /asr/* 与 WS /ws/asr，同样须在动态路由模块之前注册。
    AsrModule,
    // UsersModule 提供固定路径 /users/me（当前用户信息与用户级组织开关）。
    UsersModule,
    // ResourceModule 提供动态路径 spaces/:spaceId/:typeCode，必须在所有固定路径模块之后注册。
    ResourceModule,
    // LedgerModule 依赖 ResourceModule，放在最后以确保固定端点优先于动态路由。
    LedgerModule,
    // LlmModule 的 OpenAI 兼容代理挂在 /agent 下（固定路径），与动态资源路由深度不同，注册顺序无冲突。
    LlmModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppErrorFilter },
    // Guard 按注册顺序执行：先验登录身份，再做空间归属校验
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: SpaceGuard },
  ],
})
export class AppModule {}
