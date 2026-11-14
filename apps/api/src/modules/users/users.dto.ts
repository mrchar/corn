import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional({ description: '是否使用空间' })
  @IsOptional()
  @IsBoolean()
  enableSpace?: boolean;
}

/** 当前用户（响应） */
export class UserResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '是否使用空间' })
  enableSpace: boolean;
}
