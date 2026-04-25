import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'user' | 'admin';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
};

export function signAccessToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  } as SignOptions);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
