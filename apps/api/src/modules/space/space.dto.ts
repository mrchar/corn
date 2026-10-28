import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateSpaceDto {
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '空间编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;
}

export class UpdateSpaceDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;
}
