import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ description: '编码（小写字母开头，仅含小写字母/数字/连字符）' })
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '群组编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code: string;

  @ApiProperty({ description: '名称' })
  @IsString()
  @Length(1, 60)
  name: string;

  /** 上级群组 id，缺省为顶级 */
  @ApiPropertyOptional({ description: '上级群组 ID（可选）' })
  @IsOptional()
  @IsString()
  parentId?: string;
}

/** 编码创建后不可变；允许改名与调整上级（传空值移回顶级） */
export class UpdateGroupDto {
  @ApiPropertyOptional({ description: '名称' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ description: '上级群组 ID' })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

/** 群组资源（响应） */
export class GroupResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '空间 ID' })
  spaceId: string;

  @ApiPropertyOptional({ description: '上级群组 ID' })
  parentId?: string | null;

  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

export class GroupListResponse {
  @ApiProperty({ description: '群组列表', type: [GroupResponse] })
  list: GroupResponse[];

  @ApiProperty({ description: '总数', type: 'integer' })
  total: number;
}
