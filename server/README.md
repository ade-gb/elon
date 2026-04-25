# MOYODEV / USD DEV Backend

Production-ready REST API for the investment broker web app.

## Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL via Supabase
- JWT authentication
- bcrypt password hashing

## Features

- Email/password registration and login
- JWT-based protected routes
- User roles: `user`, `admin`
- Wallet ledger with deposits and withdrawals
- Investment products, portfolio deployment, withdrawals, and rebalance logic
- Admin product management, role management, and yield credits
- Validation, rate limiting, CORS, security headers, and centralized error handling

## Setup

1. Copy `.env.example` to `.env`
2. Add your Supabase Postgres connection string to `DATABASE_URL`
3. Run the SQL migration in `supabase/migrations/001_initial_schema.sql`
4. Install dependencies:

```bash
cd server
npm install
```

5. Start the API:

```bash
npm run dev
```

## Important Endpoints

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

### Wallet

- `GET /api/v1/wallet`
- `POST /api/v1/wallet/deposit`
- `POST /api/v1/wallet/withdraw`

### Investments

- `GET /api/v1/investments/products`
- `GET /api/v1/investments/portfolio`
- `POST /api/v1/investments/deploy`
- `POST /api/v1/investments/withdraw`
- `POST /api/v1/investments/rebalance`

### Transactions

- `GET /api/v1/transactions`

### Admin

- `GET /api/v1/admin/metrics`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:userId/role`
- `POST /api/v1/admin/products`
- `PATCH /api/v1/admin/products/:productId`
- `POST /api/v1/admin/yield/credit`

## Admin Bootstrap

Promote the first user manually after signup:

```sql
update public.app_users
set role = 'admin'
where email = 'admin@example.com';
```
