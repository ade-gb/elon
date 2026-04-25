import { query, withTransaction } from '../config/database';
import { ApiError } from '../lib/api-error';
import { assertPositiveMoney } from '../lib/finance';
import { UserRole } from '../lib/jwt';

type AdminUserRow = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  available_balance: string | null;
  reserved_balance: string | null;
};

type ProductRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  apy: string;
  risk_level: number;
  min_deposit: string;
  lockup_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type WalletRow = {
  id: string;
  available_balance: string;
};

type PositionRow = {
  id: string;
  accrued_yield: string;
};

function mapProduct(row: ProductRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    apy: Number(row.apy),
    riskLevel: row.risk_level,
    minDeposit: Number(row.min_deposit),
    lockupDays: row.lockup_days,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listUsers(input: { limit: number; offset: number; role?: UserRole }) {
  const result = await query<AdminUserRow>(
    `
      select
        u.id,
        u.email,
        u.role,
        u.created_at,
        w.available_balance,
        w.reserved_balance
      from public.app_users u
      left join public.wallets w on w.user_id = u.id
      where ($1::text is null or u.role = $1)
      order by u.created_at desc
      limit $2 offset $3
    `,
    [input.role ?? null, input.limit, input.offset]
  );

  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    wallet: {
      availableBalance: Number(row.available_balance ?? 0),
      reservedBalance: Number(row.reserved_balance ?? 0)
    }
  }));
}

export async function updateUserRole(userId: string, role: UserRole) {
  const result = await query<Pick<AdminUserRow, 'id' | 'email' | 'role' | 'created_at'>>(
    `
      update public.app_users
      set role = $1
      where id = $2
      returning id, email, role, created_at
    `,
    [role, userId]
  );

  const user = result.rows[0];

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.created_at
  };
}

export async function createInvestmentProduct(
  adminUserId: string,
  input: {
    code: string;
    name: string;
    description: string;
    category: string;
    apy: number;
    riskLevel: number;
    minDeposit: number;
    lockupDays: number;
    isActive: boolean;
  }
) {
  try {
    const result = await query<ProductRow>(
      `
        insert into public.investment_products (
          code,
          name,
          description,
          category,
          apy,
          risk_level,
          min_deposit,
          lockup_days,
          is_active,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning id, code, name, description, category, apy, risk_level, min_deposit, lockup_days, is_active, created_at, updated_at
      `,
      [
        input.code,
        input.name,
        input.description,
        input.category,
        input.apy,
        input.riskLevel,
        input.minDeposit,
        input.lockupDays,
        input.isActive,
        adminUserId
      ]
    );

    return mapProduct(result.rows[0]);
  } catch (error) {
    const candidate = error as Error & { code?: string };

    if (candidate.code === '23505') {
      throw new ApiError(409, 'Product code already exists', 'PRODUCT_CODE_TAKEN');
    }

    throw error;
  }
}

export async function updateInvestmentProduct(
  productId: string,
  input: Partial<{
    name: string;
    description: string;
    category: string;
    apy: number;
    riskLevel: number;
    minDeposit: number;
    lockupDays: number;
    isActive: boolean;
  }>
) {
  const result = await query<ProductRow>(
    `
      update public.investment_products
      set
        name = coalesce($2, name),
        description = coalesce($3, description),
        category = coalesce($4, category),
        apy = coalesce($5, apy),
        risk_level = coalesce($6, risk_level),
        min_deposit = coalesce($7, min_deposit),
        lockup_days = coalesce($8, lockup_days),
        is_active = coalesce($9, is_active)
      where id = $1
      returning id, code, name, description, category, apy, risk_level, min_deposit, lockup_days, is_active, created_at, updated_at
    `,
    [
      productId,
      input.name ?? null,
      input.description ?? null,
      input.category ?? null,
      input.apy ?? null,
      input.riskLevel ?? null,
      input.minDeposit ?? null,
      input.lockupDays ?? null,
      input.isActive ?? null
    ]
  );

  const product = result.rows[0];

  if (!product) {
    throw new ApiError(404, 'Investment product not found', 'PRODUCT_NOT_FOUND');
  }

  return mapProduct(product);
}

export async function creditYieldToPosition(input: {
  userId: string;
  productId: string;
  amount: number;
  description?: string;
}) {
  if (!assertPositiveMoney(input.amount)) {
    throw new ApiError(400, 'Yield amount must be greater than zero', 'INVALID_AMOUNT');
  }

  return withTransaction(async (client) => {
    const walletResult = await query<WalletRow>(
      `
        select id, available_balance
        from public.wallets
        where user_id = $1
        for update
      `,
      [input.userId],
      client
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      throw new ApiError(404, 'Wallet not found', 'WALLET_NOT_FOUND');
    }

    const positionResult = await query<PositionRow>(
      `
        select id, accrued_yield
        from public.investment_positions
        where user_id = $1 and product_id = $2
        for update
      `,
      [input.userId, input.productId],
      client
    );

    const position = positionResult.rows[0];

    if (!position) {
      throw new ApiError(404, 'Investment position not found', 'POSITION_NOT_FOUND');
    }

    const nextYield = Number(position.accrued_yield) + input.amount;

    await query(
      `
        update public.investment_positions
        set accrued_yield = $1,
            status = 'active'
        where id = $2
      `,
      [nextYield, position.id],
      client
    );

    await query(
      `
        insert into public.ledger_transactions (
          user_id,
          wallet_id,
          product_id,
          position_id,
          type,
          status,
          amount,
          balance_after,
          description,
          metadata
        )
        values ($1, $2, $3, $4, 'yield_credit', 'completed', $5, $6, $7, $8::jsonb)
      `,
      [
        input.userId,
        wallet.id,
        input.productId,
        position.id,
        input.amount,
        Number(wallet.available_balance),
        input.description ?? 'Yield credit posted by administrator',
        JSON.stringify({ creditedBy: 'admin' })
      ],
      client
    );

    return {
      positionId: position.id,
      accruedYield: nextYield
    };
  });
}

export async function getAdminMetrics() {
  const [usersResult, walletsResult, positionsResult, productsResult] = await Promise.all([
    query<{ total: string }>(`select count(*)::text as total from public.app_users`),
    query<{ available_balance: string }>(
      `
        select coalesce(sum(available_balance), 0)::text as available_balance
        from public.wallets
      `
    ),
    query<{ principal: string; accrued_yield: string }>(
      `
        select
          coalesce(sum(principal), 0)::text as principal,
          coalesce(sum(accrued_yield), 0)::text as accrued_yield
        from public.investment_positions
      `
    ),
    query<{ total: string }>(
      `
        select count(*)::text as total
        from public.investment_products
        where is_active = true
      `
    )
  ]);

  return {
    users: Number(usersResult.rows[0]?.total ?? 0),
    walletLiquidity: Number(walletsResult.rows[0]?.available_balance ?? 0),
    investedPrincipal: Number(positionsResult.rows[0]?.principal ?? 0),
    accruedYield: Number(positionsResult.rows[0]?.accrued_yield ?? 0),
    activeProducts: Number(productsResult.rows[0]?.total ?? 0)
  };
}
