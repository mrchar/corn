import { IsString, Length, Matches } from 'class-validator';

export class CreateDomainDto {
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '领域编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;
}
