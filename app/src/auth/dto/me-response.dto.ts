import { ApiProperty } from '@nestjs/swagger';
export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  sub: string;
  @ApiProperty()
  email: string;
  @ApiProperty({ type: [String], example: ['user'] })
  roles: string[];
}