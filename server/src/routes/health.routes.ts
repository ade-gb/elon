import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'moyodev-usd-dev-server',
    timestamp: new Date().toISOString()
  });
});
