import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { getCurrentUserProfile, loginUser, registerUser } from '../services/auth.service';

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one number')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

export const authRouter = Router();

authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const payload = await registerUser(req.body as z.infer<typeof registerSchema>);
    res.status(201).json(payload);
  })
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const payload = await loginUser(req.body as z.infer<typeof loginSchema>);
    res.json(payload);
  })
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const profile = await getCurrentUserProfile(req.auth!.sub);
    res.json({ user: profile });
  })
);
