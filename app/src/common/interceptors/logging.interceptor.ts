import {CallHandler, ExecutionContext, Injectable, LoggerService, NestInterceptor} from '@nestjs/common';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {

  constructor(
    private readonly logger: LoggerService
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const now = Date.now();
    const request = ctx.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    return next.handle().pipe(
      tap(() => this.logger.log(`${method} ${url}: Handled in ${Date.now() - now}ms`)),
    );
  }
}