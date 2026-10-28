import { Module } from '@nestjs/common';
import { DomainModule } from '../domain/domain.module';
import { ResourceTypeController } from './resource-type.controller';
import { ResourceTypeService } from './resource-type.service';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

@Module({
  imports: [DomainModule],
  controllers: [ResourceTypeController, TemplateController],
  providers: [ResourceTypeService, TemplateService],
  exports: [ResourceTypeService, TemplateService],
})
export class ResourceTypeModule {}
