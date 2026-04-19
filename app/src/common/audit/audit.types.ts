export type AuditOutcome = 'success' | 'failure';

export interface AuditEvent {
  action: string;
  actorId?: string;
  actorRoles?: string[];
  targetType: string;
  targetId?: string;
  outcome: AuditOutcome;
  correlationId: string;
  timestamp: string;
  reason?: string;
  ip?: string;
  userAgent?: string;
}
