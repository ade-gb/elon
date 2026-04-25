import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { ApiError } from '../lib/api-error';

type RequestSource = 'body' | 'params' | 'query';

export function validate(schema: ZodTypeAny, source: RequestSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(
        new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten())
      );
    }

    (req as unknown as Record<string, unknown>)[source] = result.data;
    return next();
  };
}
