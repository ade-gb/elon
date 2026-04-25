import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { listTransactions } from '../services/transaction.service';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z
    .enum(['deposit', 'withdrawal', 'investment_buy', 'investment_sell', 'yield_credit', 'rebalance'])
    .optional()
});

export const transactionRouter = Router();

transactionRouter.get(
  '/',
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof querySchema>;
    const transactions = await listTransactions({
      userId: req.auth!.sub,
      limit: filters.limit,
      offset: filters.offset,
      type: filters.type
    });

    res.json({
      transactions,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: transactions.length
      }
    });
  })
);
