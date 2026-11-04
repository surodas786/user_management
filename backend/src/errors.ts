export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CSRF_ORIGIN_REJECTED'
  | 'NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'
  | 'STORAGE_UNAVAILABLE';

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function storageUnavailable(cause: unknown): AppError {
  const error = new AppError(503, 'STORAGE_UNAVAILABLE', 'User storage is unavailable');
  error.cause = cause;
  return error;
}
