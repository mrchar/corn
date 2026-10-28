import { Module } from '@nestjs/common';
import { ResourceTypeModule } from '../resource-type/resource-type.module';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';

@Module({
  imports: [ResourceTypeModule],
  controllers: [MetadataController],
  providers: [MetadataService],
})
export class MetadataModule {}
