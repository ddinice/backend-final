export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  protected constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(userId: string) {
    super('User not found', { userId });
  }
}

export class UserEmailExistsError extends DomainError {
  readonly code = 'USER_EMAIL_EXISTS';
  readonly httpStatus = 409;

  constructor(email: string) {
    super('User with this email already exists', { email });
  }
}
