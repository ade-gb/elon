import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/api-error';
import { UserRole } from '../lib/jwt';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new ApiError(401, 'Authentication required', 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.auth.role)) {
      return next(new ApiError(403, 'Insufficient permissions', 'FORBIDDEN'));
    }

    return next();
  };
}
