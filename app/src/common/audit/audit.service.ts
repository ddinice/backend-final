import { Injectable, Logger } from '@nestjs/common';
import type { AuditEvent } from './audit.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AUDIT');

  emit(event: Omit<AuditEvent, 'timestamp'> & { timestamp?: string }) {
    const payload: AuditEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.logger.log(JSON.stringify(payload));
  }
}
