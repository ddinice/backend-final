import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain.errors';
import { ErrorBody } from '../types/error.type';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      (request as any).correlationId ||
      (typeof request.headers['x-correlation-id'] === 'string'
        ? request.headers['x-correlation-id']
        : 'unknown');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      correlationId,
    };

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      body = {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        correlationId,
      };
      return response.status(status).json(body);
    }

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;

      if (res && typeof res === 'object' && res.code && res.message) {
        body = {
          code: String(res.code),
          message: String(res.message),
          details: res.details && typeof res.details === 'object' ? res.details : undefined,
          correlationId,
        };
        return response.status(status).json(body);
      }

      body = {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED',
        message:
          typeof res === 'string'
            ? res
            : res?.message
            ? Array.isArray(res.message)
              ? 'Request failed'
              : String(res.message)
            : 'Request failed',
        details: Array.isArray(res?.message) ? { messages: res.message } : undefined,
        correlationId,
      };
      return response.status(status).json(body);
    }

    return response.status(status).json(body);
  }
}
