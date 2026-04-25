import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsInt, IsUUID, Min } from "class-validator";

export class CreateOrderItemDto {
  @ApiProperty({ example: '43c345d6-56ca-4e36-8f23-2d5491e04fcb' })
  @IsNotEmpty()
  @IsUUID()
  productId: string;
  @ApiProperty({ example: 2, minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity: number;
}