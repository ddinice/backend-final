import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async create(title: string, price: string): Promise<Product> {
    const product = this.productsRepository.create({ title, price });
    return this.productsRepository.save(product);
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.productsRepository.find({ where: { id: In(ids) } });
  }

  async findAll(): Promise<Product[]> {
    return this.productsRepository.find();
  }
}
