import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithCorrelation = Request & { correlationId?: string };

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithCorrelation, _res: Response, next: NextFunction) {
    const header = req.headers['x-correlation-id'];
    req.correlationId =
      typeof header === 'string' && header.trim().length > 0
        ? header.trim()
        : randomUUID();
    next();
  }
}
