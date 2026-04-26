import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';
import { IsDateRangeValid } from '../validators/date-range.validator';

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ type: Number, example: 1 })
  @IsInt()
  @IsOptional()
  @IsPositive()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ type: Number, example: 10 })
  @IsInt()
  @IsOptional()
  @IsPositive()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], example: 'DESC', default: 'DESC' })
  @IsIn(['ASC', 'DESC'])
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ enum: ['createdAt'], example: 'createdAt', default: 'createdAt' })
  @IsIn(['createdAt'])
  @IsOptional()
  sortBy?: 'createdAt';

  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  @IsDateRangeValid()
  createdTo?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  createdFrom?: string;
}