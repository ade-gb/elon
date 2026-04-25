import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/api-error';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}
