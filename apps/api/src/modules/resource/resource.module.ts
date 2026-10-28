import { Module } from '@nestjs/common';
import { DomainModule } from '../domain/domain.module';
import { ResourceTypeModule } from '../resource-type/resource-type.module';
import { MeasureService } from './measure.service';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';

@Module({
  imports: [DomainModule, ResourceTypeModule],
  controllers: [ResourceController],
  providers: [ResourceService, MeasureService],
  exports: [ResourceService, MeasureService],
})
export class ResourceModule {}
