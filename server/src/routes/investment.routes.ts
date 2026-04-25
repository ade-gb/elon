import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import {
  deployInvestmentCapital,
  getUserPortfolio,
  listInvestmentProducts,
  rebalancePortfolio,
  withdrawInvestmentCapital
} from '../services/investment.service';

const deploySchema = z.object({
  productId: z.string().uuid(),
  amount: z.coerce.number().positive()
});

const rebalanceSchema = z.object({
  targets: z
    .array(
      z.object({
        productId: z.string().uuid(),
        targetWeight: z.coerce.number().min(0).max(100)
      })
    )
    .min(1)
});

export const investmentRouter = Router();

investmentRouter.get(
  '/products',
  asyncHandler(async (_req, res) => {
    const products = await listInvestmentProducts(false);
    res.json({ products });
  })
);

investmentRouter.get(
  '/portfolio',
  asyncHandler(async (req, res) => {
    const portfolio = await getUserPortfolio(req.auth!.sub);
    res.json(portfolio);
  })
);

investmentRouter.post(
  '/deploy',
  validate(deploySchema),
  asyncHandler(async (req, res) => {
    const portfolio = await deployInvestmentCapital(req.auth!.sub, req.body as z.infer<typeof deploySchema>);
    res.status(201).json(portfolio);
  })
);

investmentRouter.post(
  '/withdraw',
  validate(deploySchema),
  asyncHandler(async (req, res) => {
    const portfolio = await withdrawInvestmentCapital(req.auth!.sub, req.body as z.infer<typeof deploySchema>);
    res.json(portfolio);
  })
);

investmentRouter.post(
  '/rebalance',
  validate(rebalanceSchema),
  asyncHandler(async (req, res) => {
    const portfolio = await rebalancePortfolio(req.auth!.sub, req.body as z.infer<typeof rebalanceSchema>);
    res.json(portfolio);
  })
);
