import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { ApiError } from '../lib/api-error';
import { assertPositiveMoney, toMoney } from '../lib/finance';

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

type PositionRow = {
  id: string;
  user_id: string;
  product_id: string;
  principal: string;
  accrued_yield: string;
  target_weight: string;
  status: 'active' | 'closed';
  name: string;
  code: string;
  apy: string;
  risk_level: number;
  category: string;
  lockup_days: number;
  is_active: boolean;
};

type WalletRow = {
  id: string;
  available_balance: string;
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

function mapPosition(row: PositionRow, totalInvested: number) {
  const principal = Number(row.principal);
  const accruedYield = Number(row.accrued_yield);
  const totalValue = principal + accruedYield;

  return {
    id: row.id,
    productId: row.product_id,
    productCode: row.code,
    productName: row.name,
    category: row.category,
    principal,
    accruedYield,
    totalValue,
    currentAllocation: totalInvested > 0 ? Number(((principal / totalInvested) * 100).toFixed(2)) : 0,
    targetWeight: Number(row.target_weight),
    apy: Number(row.apy),
    riskLevel: row.risk_level,
    lockupDays: row.lockup_days,
    status: row.status,
    isActive: row.is_active
  };
}

async function getWallet(userId: string, client?: PoolClient, lock = false) {
  const result = await query<WalletRow>(
    `
      select id, available_balance
      from public.wallets
      where user_id = $1
      ${lock ? 'for update' : ''}
    `,
    [userId],
    client
  );

  const wallet = result.rows[0];

  if (!wallet) {
    throw new ApiError(404, 'Wallet not found', 'WALLET_NOT_FOUND');
  }

  return wallet;
}

async function getProductById(productId: string, client?: PoolClient) {
  const result = await query<ProductRow>(
    `
      select id, code, name, description, category, apy, risk_level, min_deposit, lockup_days, is_active, created_at, updated_at
      from public.investment_products
      where id = $1
      limit 1
    `,
    [productId],
    client
  );

  const product = result.rows[0];

  if (!product) {
    throw new ApiError(404, 'Investment product not found', 'PRODUCT_NOT_FOUND');
  }

  return product;
}

async function getPositionForUser(userId: string, productId: string, client?: PoolClient, lock = false) {
  const result = await query<PositionRow>(
    `
      select
        ipos.id,
        ipos.user_id,
        ipos.product_id,
        ipos.principal,
        ipos.accrued_yield,
        ipos.target_weight,
        ipos.status,
        prod.name,
        prod.code,
        prod.apy,
        prod.risk_level,
        prod.category,
        prod.lockup_days,
        prod.is_active
      from public.investment_positions ipos
      inner join public.investment_products prod on prod.id = ipos.product_id
      where ipos.user_id = $1 and ipos.product_id = $2
      ${lock ? 'for update' : ''}
      limit 1
    `,
    [userId, productId],
    client
  );

  return result.rows[0] ?? null;
}

async function createLedgerEntry(input: {
  client: PoolClient;
  userId: string;
  walletId: string;
  productId?: string;
  positionId?: string;
  type: 'investment_buy' | 'investment_sell' | 'yield_credit' | 'rebalance';
  amount: number;
  balanceAfter: number;
  description: string;
  metadata?: Record<string, unknown>;
}) {
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
      values ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9::jsonb)
    `,
    [
      input.userId,
      input.walletId,
      input.productId ?? null,
      input.positionId ?? null,
      input.type,
      input.amount,
      input.balanceAfter,
      input.description,
      JSON.stringify(input.metadata ?? {})
    ],
    input.client
  );
}

async function fetchPortfolioPositions(userId: string, client?: PoolClient) {
  const result = await query<PositionRow>(
    `
      select
        ipos.id,
        ipos.user_id,
        ipos.product_id,
        ipos.principal,
        ipos.accrued_yield,
        ipos.target_weight,
        ipos.status,
        prod.name,
        prod.code,
        prod.apy,
        prod.risk_level,
        prod.category,
        prod.lockup_days,
        prod.is_active
      from public.investment_positions ipos
      inner join public.investment_products prod on prod.id = ipos.product_id
      where ipos.user_id = $1
      order by prod.name asc
    `,
    [userId],
    client
  );

  return result.rows;
}

export async function listInvestmentProducts(includeInactive = false) {
  const result = await query<ProductRow>(
    `
      select id, code, name, description, category, apy, risk_level, min_deposit, lockup_days, is_active, created_at, updated_at
      from public.investment_products
      where $1::boolean = true or is_active = true
      order by risk_level asc, name asc
    `,
    [includeInactive]
  );

  return result.rows.map(mapProduct);
}

export async function getUserPortfolio(userId: string) {
  const wallet = await getWallet(userId);
  const positions = await fetchPortfolioPositions(userId);
  const totalInvested = positions.reduce((sum, row) => sum + Number(row.principal), 0);
  const totalAccruedYield = positions.reduce((sum, row) => sum + Number(row.accrued_yield), 0);
  const weightedApy =
    totalInvested > 0
      ? positions.reduce((sum, row) => sum + Number(row.principal) * Number(row.apy), 0) / totalInvested
      : 0;

  return {
    wallet: {
      id: wallet.id,
      availableBalance: Number(wallet.available_balance)
    },
    metrics: {
      totalInvested,
      totalAccruedYield,
      netAssetValue: Number(wallet.available_balance) + totalInvested + totalAccruedYield,
      weightedApy: Number(weightedApy.toFixed(2))
    },
    positions: positions.map((position) => mapPosition(position, totalInvested))
  };
}

export async function deployInvestmentCapital(userId: string, input: { productId: string; amount: number }) {
  if (!assertPositiveMoney(input.amount)) {
    throw new ApiError(400, 'Amount must be greater than zero', 'INVALID_AMOUNT');
  }

  return withTransaction(async (client) => {
    const wallet = await getWallet(userId, client, true);
    const product = await getProductById(input.productId, client);
    const currentBalance = Number(wallet.available_balance);

    if (!product.is_active) {
      throw new ApiError(400, 'This investment product is not active', 'PRODUCT_INACTIVE');
    }

    if (input.amount < Number(product.min_deposit)) {
      throw new ApiError(
        400,
        `Minimum deposit for ${product.name} is ${Number(product.min_deposit)}`,
        'MINIMUM_NOT_MET'
      );
    }

    if (currentBalance < input.amount) {
      throw new ApiError(400, 'Insufficient wallet balance', 'INSUFFICIENT_FUNDS');
    }

    const nextWalletBalance = toMoney(currentBalance - input.amount);

    await query(
      `
        update public.wallets
        set available_balance = $1
        where id = $2
      `,
      [nextWalletBalance, wallet.id],
      client
    );

    const positionResult = await query<PositionRow>(
      `
        insert into public.investment_positions (
          user_id,
          product_id,
          principal,
          accrued_yield,
          target_weight,
          status
        )
        values ($1, $2, $3, 0, 0, 'active')
        on conflict (user_id, product_id)
        do update set
          principal = public.investment_positions.principal + excluded.principal,
          status = 'active'
        returning
          id,
          user_id,
          product_id,
          principal,
          accrued_yield,
          target_weight,
          status,
          '' as name,
          '' as code,
          0 as apy,
          0 as risk_level,
          '' as category,
          0 as lockup_days,
          true as is_active
      `,
      [userId, product.id, input.amount],
      client
    );

    const position = positionResult.rows[0];

    await createLedgerEntry({
      client,
      userId,
      walletId: wallet.id,
      productId: product.id,
      positionId: position.id,
      type: 'investment_buy',
      amount: input.amount,
      balanceAfter: nextWalletBalance,
      description: `Capital deployed into ${product.name}`,
      metadata: { productCode: product.code }
    });

    return getUserPortfolio(userId);
  });
}

export async function withdrawInvestmentCapital(userId: string, input: { productId: string; amount: number }) {
  if (!assertPositiveMoney(input.amount)) {
    throw new ApiError(400, 'Amount must be greater than zero', 'INVALID_AMOUNT');
  }

  return withTransaction(async (client) => {
    const wallet = await getWallet(userId, client, true);
    const position = await getPositionForUser(userId, input.productId, client, true);

    if (!position) {
      throw new ApiError(404, 'Investment position not found', 'POSITION_NOT_FOUND');
    }

    const totalWithdrawable = Number(position.principal) + Number(position.accrued_yield);

    if (totalWithdrawable < input.amount) {
      throw new ApiError(400, 'Withdrawal exceeds available position value', 'INSUFFICIENT_POSITION_VALUE');
    }

    const product = await getProductById(input.productId, client);

    let nextYield = Number(position.accrued_yield);
    let nextPrincipal = Number(position.principal);
    let remaining = input.amount;

    if (nextYield >= remaining) {
      nextYield = toMoney(nextYield - remaining);
      remaining = 0;
    } else {
      remaining = toMoney(remaining - nextYield);
      nextYield = 0;
    }

    if (remaining > 0) {
      nextPrincipal = toMoney(nextPrincipal - remaining);
    }

    await query(
      `
        update public.investment_positions
        set principal = $1,
            accrued_yield = $2,
            status = case when ($1 + $2) > 0 then 'active' else 'closed' end
        where id = $3
      `,
      [nextPrincipal, nextYield, position.id],
      client
    );

    const nextWalletBalance = toMoney(Number(wallet.available_balance) + input.amount);

    await query(
      `
        update public.wallets
        set available_balance = $1
        where id = $2
      `,
      [nextWalletBalance, wallet.id],
      client
    );

    await createLedgerEntry({
      client,
      userId,
      walletId: wallet.id,
      productId: input.productId,
      positionId: position.id,
      type: 'investment_sell',
      amount: input.amount,
      balanceAfter: nextWalletBalance,
      description: `Capital withdrawn from ${product.name}`,
      metadata: { productCode: product.code }
    });

    return getUserPortfolio(userId);
  });
}

export async function rebalancePortfolio(
  userId: string,
  input: { targets: Array<{ productId: string; targetWeight: number }> }
) {
  if (input.targets.length === 0) {
    throw new ApiError(400, 'At least one target allocation is required', 'INVALID_TARGETS');
  }

  const totalWeight = input.targets.reduce((sum, item) => sum + item.targetWeight, 0);

  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new ApiError(400, 'Target weights must total 100%', 'INVALID_TARGETS');
  }

  return withTransaction(async (client) => {
    const wallet = await getWallet(userId, client, true);
    const currentPositions = await fetchPortfolioPositions(userId, client);
    const totalPrincipal = currentPositions.reduce((sum, row) => sum + Number(row.principal), 0);

    if (totalPrincipal <= 0) {
      throw new ApiError(400, 'No invested capital is available to rebalance', 'NOTHING_TO_REBALANCE');
    }

    const requestedProducts = await query<ProductRow>(
      `
        select id, code, name, description, category, apy, risk_level, min_deposit, lockup_days, is_active, created_at, updated_at
        from public.investment_products
        where id = any($1::uuid[])
      `,
      [input.targets.map((item) => item.productId)],
      client
    );

    if (requestedProducts.rowCount !== input.targets.length) {
      throw new ApiError(404, 'One or more products could not be found', 'PRODUCT_NOT_FOUND');
    }

    const targetMap = new Map(input.targets.map((item) => [item.productId, item.targetWeight]));
    const desiredPrincipal = new Map<string, number>();
    let runningAssigned = 0;

    input.targets.forEach((target, index) => {
      if (index === input.targets.length - 1) {
        desiredPrincipal.set(target.productId, toMoney(totalPrincipal - runningAssigned));
        return;
      }

      const amount = toMoney(totalPrincipal * (target.targetWeight / 100));
      desiredPrincipal.set(target.productId, amount);
      runningAssigned = toMoney(runningAssigned + amount);
    });

    for (const product of requestedProducts.rows) {
      const current = await getPositionForUser(userId, product.id, client, true);
      const nextPrincipal = desiredPrincipal.get(product.id) ?? 0;
      const targetWeight = targetMap.get(product.id) ?? 0;

      if (current) {
        await query(
          `
            update public.investment_positions
            set principal = $1,
                target_weight = $2,
                status = case when ($1 + accrued_yield) > 0 then 'active' else 'closed' end
            where id = $3
          `,
          [nextPrincipal, targetWeight, current.id],
          client
        );
      } else if (nextPrincipal > 0) {
        await query(
          `
            insert into public.investment_positions (
              user_id,
              product_id,
              principal,
              accrued_yield,
              target_weight,
              status
            )
            values ($1, $2, $3, 0, $4, 'active')
          `,
          [userId, product.id, nextPrincipal, targetWeight],
          client
        );
      }
    }

    const targetProductIds = input.targets.map((item) => item.productId);

    await query(
      `
        update public.investment_positions
        set principal = 0,
            target_weight = 0,
            status = case when accrued_yield > 0 then 'active' else 'closed' end
        where user_id = $1
          and product_id <> all($2::uuid[])
      `,
      [userId, targetProductIds],
      client
    );

    await createLedgerEntry({
      client,
      userId,
      walletId: wallet.id,
      type: 'rebalance',
      amount: totalPrincipal,
      balanceAfter: Number(wallet.available_balance),
      description: 'Portfolio rebalanced to new target mandate',
      metadata: {
        targets: input.targets
      }
    });

    return getUserPortfolio(userId);
  });
}
