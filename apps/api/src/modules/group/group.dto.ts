import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '群组编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;

  /** 上级群组 id，缺省为顶级 */
  @IsOptional()
  @IsString()
  parentId?: string;
}

/** 编码创建后不可变；允许改名与调整上级（传空值移回顶级） */
export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;
}
