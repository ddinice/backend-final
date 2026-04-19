import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiPropertyOptional({
    example: { fields: [{ field: 'email', errors: ['email must be an email'] }] },
  })
  details?: Record<string, unknown>;

  @ApiProperty({ example: 'req-123' })
  correlationId!: string;
}


