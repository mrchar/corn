import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  domainId: string;

  @IsString()
  @Length(1, 80)
  name: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  domainId?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}

export class ListResourceQuery {
  @IsOptional()
  page?: string;

  @IsOptional()
  pageSize?: string;

  @IsOptional()
  keyword?: string;

  @IsOptional()
  sorter?: string;

  @IsOptional()
  domainId?: string;

  @IsOptional()
  status?: string;

  [key: string]: unknown;
}
