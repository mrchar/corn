import { Module } from '@nestjs/common';
import { ResourceTypeModule } from '../resource-type/resource-type.module';
import { GlobalMetadataController, MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';

@Module({
  imports: [ResourceTypeModule],
  controllers: [GlobalMetadataController, MetadataController],
  providers: [MetadataService],
})
export class MetadataModule {}
