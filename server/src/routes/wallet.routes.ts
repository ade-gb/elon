import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { depositToWallet, getWalletSummary, withdrawFromWallet } from '../services/wallet.service';

const amountSchema = z.object({
  amount: z.coerce.number().positive()
});

export const walletRouter = Router();

walletRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const wallet = await getWalletSummary(req.auth!.sub);
    res.json({ wallet });
  })
);

walletRouter.post(
  '/deposit',
  validate(amountSchema),
  asyncHandler(async (req, res) => {
    const { amount } = req.body as z.infer<typeof amountSchema>;
    const wallet = await depositToWallet(req.auth!.sub, amount);
    res.status(201).json({ wallet });
  })
);

walletRouter.post(
  '/withdraw',
  validate(amountSchema),
  asyncHandler(async (req, res) => {
    const { amount } = req.body as z.infer<typeof amountSchema>;
    const wallet = await withdrawFromWallet(req.auth!.sub, amount);
    res.json({ wallet });
  })
);
