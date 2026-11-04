import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors';

interface HttpError {
  status?: number;
  type?: string;
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  // Errors raised by express.json().
  const { status, type } = (error ?? {}) as HttpError;
  if (type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = toAppError(error);
  if (appError.status >= 500) {
    console.error(appError.code, error);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
    },
  });
};
