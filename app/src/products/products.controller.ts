import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ProductsService } from './products.service';

@SkipThrottle({ strict: true })
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async list() {
    return this.productsService.findAll();
  }
}
