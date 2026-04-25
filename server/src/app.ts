import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { adminRouter } from './routes/admin.routes';
import { authRouter } from './routes/auth.routes';
import { healthRouter } from './routes/health.routes';
import { investmentRouter } from './routes/investment.routes';
import { transactionRouter } from './routes/transaction.routes';
import { walletRouter } from './routes/wallet.routes';
import { authenticate } from './middleware/authenticate';
import { requireRole } from './middleware/require-role';

const app = express();

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: false
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(apiLimiter);

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/wallet', authenticate, walletRouter);
app.use('/api/v1/transactions', authenticate, transactionRouter);
app.use('/api/v1/investments', authenticate, investmentRouter);
app.use('/api/v1/admin', authenticate, requireRole('admin'), adminRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
