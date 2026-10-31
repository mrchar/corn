import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppErrorFilter } from './common/app-error.filter';
import { SpaceGuard } from './common/space.guard';
import { PrismaModule } from './prisma/prisma.module';
import { SpaceModule } from './modules/space/space.module';
import { DomainModule } from './modules/domain/domain.module';
import { GroupModule } from './modules/group/group.module';
import { ResourceTypeModule } from './modules/resource-type/resource-type.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MetadataModule } from './modules/metadata/metadata.module';
// 注意：ResourceModule 提供动态路径 spaces/:spaceId/:typeCode，必须在所有固定路径模块之后注册，
// 否则 creations / reservations / resource-types 等固定端点会被吞掉。
import { ResourceModule } from './modules/resource/resource.module';

@Module({
  imports: [
    PrismaModule,
    SpaceModule,
    DomainModule,
    GroupModule,
    ResourceTypeModule,
    // MetadataModule 必须在 ResourceModule 之前注册，否则 /openapi.json 会被动态 :typeCode 路由吞掉。
    MetadataModule,
    // ResourceModule 提供动态路径 spaces/:spaceId/:typeCode，必须在所有固定路径模块之后注册。
    ResourceModule,
    // LedgerModule 依赖 ResourceModule，放在最后以确保固定端点优先于动态路由。
    LedgerModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: APP_GUARD, useClass: SpaceGuard },
  ],
})
export class AppModule {}
