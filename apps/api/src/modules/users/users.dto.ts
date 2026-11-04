import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsBoolean()
  enableSpace?: boolean;
}
