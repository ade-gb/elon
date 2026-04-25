create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('user', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum (
      'deposit',
      'withdrawal',
      'investment_buy',
      'investment_sell',
      'yield_credit',
      'rebalance'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type public.transaction_status as enum ('pending', 'completed', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'position_status') then
    create type public.position_status as enum ('active', 'closed');
  end if;
end$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_users(id) on delete cascade,
  available_balance numeric(18, 2) not null default 0 check (available_balance >= 0),
  reserved_balance numeric(18, 2) not null default 0 check (reserved_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  category text not null,
  apy numeric(5, 2) not null check (apy >= 0 and apy <= 100),
  risk_level smallint not null check (risk_level between 1 and 5),
  min_deposit numeric(18, 2) not null default 0 check (min_deposit >= 0),
  lockup_days integer not null default 0 check (lockup_days >= 0),
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  product_id uuid not null references public.investment_products(id) on delete cascade,
  principal numeric(18, 2) not null default 0 check (principal >= 0),
  accrued_yield numeric(18, 2) not null default 0 check (accrued_yield >= 0),
  target_weight numeric(5, 2) not null default 0 check (target_weight >= 0 and target_weight <= 100),
  status public.position_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  product_id uuid references public.investment_products(id) on delete set null,
  position_id uuid references public.investment_positions(id) on delete set null,
  type public.transaction_type not null,
  status public.transaction_status not null default 'completed',
  amount numeric(18, 2) not null check (amount > 0),
  balance_after numeric(18, 2) not null check (balance_after >= 0),
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallets_user_id on public.wallets(user_id);
create index if not exists idx_positions_user_id on public.investment_positions(user_id);
create index if not exists idx_positions_product_id on public.investment_positions(product_id);
create index if not exists idx_transactions_user_created_at on public.ledger_transactions(user_id, created_at desc);
create index if not exists idx_products_is_active on public.investment_products(is_active);

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.investment_products;
create trigger trg_products_updated_at
before update on public.investment_products
for each row execute function public.set_updated_at();

drop trigger if exists trg_positions_updated_at on public.investment_positions;
create trigger trg_positions_updated_at
before update on public.investment_positions
for each row execute function public.set_updated_at();

insert into public.investment_products (
  code,
  name,
  description,
  category,
  apy,
  risk_level,
  min_deposit,
  lockup_days,
  is_active
)
values
  (
    'core-reserve',
    'Core Reserve',
    'Low-volatility treasury-backed cash management sleeve.',
    'cash-management',
    4.80,
    1,
    100,
    0,
    true
  ),
  (
    'credit-yield',
    'Credit Yield',
    'Diversified credit routing for enhanced fixed-income style returns.',
    'credit',
    8.60,
    2,
    250,
    2,
    true
  ),
  (
    'liquidity-relay',
    'Liquidity Relay',
    'Automated stable DeFi routing into curated liquidity venues.',
    'defi-liquidity',
    11.20,
    3,
    500,
    1,
    true
  ),
  (
    'growth-alpha',
    'Growth Alpha',
    'Higher-return market-neutral carry and basis sleeve.',
    'market-neutral',
    14.10,
    4,
    1000,
    3,
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  apy = excluded.apy,
  risk_level = excluded.risk_level,
  min_deposit = excluded.min_deposit,
  lockup_days = excluded.lockup_days,
  is_active = excluded.is_active,
  updated_at = now();
