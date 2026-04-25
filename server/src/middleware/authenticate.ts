import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/api-error';
import { verifyAccessToken } from '../lib/jwt';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Missing Bearer token', 'UNAUTHORIZED'));
  }

  const token = authorization.slice('Bearer '.length).trim();

  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch {
    return next(new ApiError(401, 'Invalid or expired token', 'UNAUTHORIZED'));
  }
}
