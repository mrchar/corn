import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class CreateDomainDto {
  @ApiProperty({ description: '编码（小写字母开头，仅含小写字母/数字/连字符）' })
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '领域编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code: string;

  @ApiProperty({ description: '名称' })
  @IsString()
  @Length(1, 60)
  name: string;
}

/** 编码创建后不可变，仅允许改名 */
export class UpdateDomainDto {
  @ApiProperty({ description: '名称' })
  @IsString()
  @Length(1, 60)
  name: string;
}

/** 领域资源（响应） */
export class DomainResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '空间 ID' })
  spaceId: string;

  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

/** 领域列表项：仅声明列表展示字段，列定义由文档投影到前端（运行时仍返回完整对象） */
export class DomainListItem {
  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '名称' })
  name: string;
}

export class DomainListResponse {
  @ApiProperty({ description: '领域列表', type: [DomainListItem] })
  list: DomainListItem[];

  @ApiProperty({ description: '总数', type: 'integer' })
  total: number;
}
