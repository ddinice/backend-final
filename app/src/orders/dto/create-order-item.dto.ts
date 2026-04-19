import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsInt, IsUUID, Min } from "class-validator";

export class CreateOrderItemDto {
  @ApiProperty({ example: '1111-2222-3333-4444' })
  @IsNotEmpty()
  @IsUUID()
  productId: string;
  @ApiProperty({ example: 2, minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity: number;
}