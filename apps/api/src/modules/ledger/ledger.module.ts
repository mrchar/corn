import { Module } from '@nestjs/common';
import { ResourceModule } from '../resource/resource.module';
import { ResourceTypeModule } from '../resource-type/resource-type.module';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Module({
  imports: [ResourceModule, ResourceTypeModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
