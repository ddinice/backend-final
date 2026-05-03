import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import * as client from 'prom-client';

@ApiExcludeController()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  private readonly register: client.Registry;

  constructor() {
    this.register = client.register;
    client.collectDefaultMetrics({ register: this.register });
  }

  @Get()
  async metrics(@Res() res: Response) {
    res.setHeader('Content-Type', this.register.contentType);
    res.send(await this.register.metrics());
  }
}
