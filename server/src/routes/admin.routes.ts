import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '../lib/jwt';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import {
  createInvestmentProduct,
  creditYieldToPosition,
  getAdminMetrics,
  listUsers,
  updateInvestmentProduct,
  updateUserRole
} from '../services/admin.service';

const usersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  role: z.enum(['user', 'admin']).optional()
});

const userRoleSchema = z.object({
  role: z.enum(['user', 'admin'])
});

const productCreateSchema = z.object({
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  description: z.string().min(10).max(500),
  category: z.string().min(2).max(80),
  apy: z.coerce.number().min(0).max(100),
  riskLevel: z.coerce.number().int().min(1).max(5),
  minDeposit: z.coerce.number().min(0),
  lockupDays: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean().default(true)
});

const productUpdateSchema = productCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  'At least one field must be supplied'
);

const yieldCreditSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  description: z.string().max(250).optional()
});

const paramsWithUserId = z.object({
  userId: z.string().uuid()
});

const paramsWithProductId = z.object({
  productId: z.string().uuid()
});

export const adminRouter = Router();

adminRouter.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    const metrics = await getAdminMetrics();
    res.json({ metrics });
  })
);

adminRouter.get(
  '/users',
  validate(usersQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof usersQuerySchema>;
    const users = await listUsers({
      limit: filters.limit,
      offset: filters.offset,
      role: filters.role as UserRole | undefined
    });

    res.json({
      users,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: users.length
      }
    });
  })
);

adminRouter.patch(
  '/users/:userId/role',
  validate(paramsWithUserId, 'params'),
  validate(userRoleSchema),
  asyncHandler(async (req, res) => {
    const params = req.params as z.infer<typeof paramsWithUserId>;
    const user = await updateUserRole(params.userId, (req.body as z.infer<typeof userRoleSchema>).role);
    res.json({ user });
  })
);

adminRouter.post(
  '/products',
  validate(productCreateSchema),
  asyncHandler(async (req, res) => {
    const product = await createInvestmentProduct(
      req.auth!.sub,
      req.body as z.infer<typeof productCreateSchema>
    );
    res.status(201).json({ product });
  })
);

adminRouter.patch(
  '/products/:productId',
  validate(paramsWithProductId, 'params'),
  validate(productUpdateSchema),
  asyncHandler(async (req, res) => {
    const params = req.params as z.infer<typeof paramsWithProductId>;
    const product = await updateInvestmentProduct(
      params.productId,
      req.body as z.infer<typeof productUpdateSchema>
    );
    res.json({ product });
  })
);

adminRouter.post(
  '/yield/credit',
  validate(yieldCreditSchema),
  asyncHandler(async (req, res) => {
    const result = await creditYieldToPosition(req.body as z.infer<typeof yieldCreditSchema>);
    res.status(201).json({ result });
  })
);
