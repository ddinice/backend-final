export type ErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId: string;
};