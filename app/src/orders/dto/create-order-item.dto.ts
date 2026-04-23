import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsInt, IsUUID, Min } from "class-validator";

export class CreateOrderItemDto {
  @ApiProperty({ example: '05e8992f-818c-4e71-b8be-02644581d097' })
  @IsNotEmpty()
  @IsUUID()
  productId: string;
  @ApiProperty({ example: 2, minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity: number;
}