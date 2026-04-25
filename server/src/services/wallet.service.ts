import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { ApiError } from '../lib/api-error';
import { assertPositiveMoney, toMoney } from '../lib/finance';

type WalletRow = {
  id: string;
  available_balance: string;
  reserved_balance: string;
  updated_at: string;
};

type WalletSummary = {
  id: string;
  availableBalance: number;
  reservedBalance: number;
  updatedAt: string;
};

function mapWallet(wallet: WalletRow): WalletSummary {
  return {
    id: wallet.id,
    availableBalance: Number(wallet.available_balance),
    reservedBalance: Number(wallet.reserved_balance),
    updatedAt: wallet.updated_at
  };
}

async function getWalletForUser(userId: string, client?: PoolClient, lock = false) {
  const result = await query<WalletRow>(
    `
      select id, available_balance, reserved_balance, updated_at
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

async function createLedgerEntry(input: {
  client: PoolClient;
  userId: string;
  walletId: string;
  type: 'deposit' | 'withdrawal';
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
        type,
        status,
        amount,
        balance_after,
        description,
        metadata
      )
      values ($1, $2, $3, 'completed', $4, $5, $6, $7::jsonb)
    `,
    [
      input.userId,
      input.walletId,
      input.type,
      input.amount,
      input.balanceAfter,
      input.description,
      JSON.stringify(input.metadata ?? {})
    ],
    input.client
  );
}

export async function getWalletSummary(userId: string) {
  const wallet = await getWalletForUser(userId);
  return mapWallet(wallet);
}

export async function depositToWallet(userId: string, amount: number) {
  if (!assertPositiveMoney(amount)) {
    throw new ApiError(400, 'Deposit amount must be greater than zero', 'INVALID_AMOUNT');
  }

  return withTransaction(async (client) => {
    const wallet = await getWalletForUser(userId, client, true);
    const nextBalance = toMoney(Number(wallet.available_balance) + amount);

    const updatedResult = await query<WalletRow>(
      `
        update public.wallets
        set available_balance = $1
        where id = $2
        returning id, available_balance, reserved_balance, updated_at
      `,
      [nextBalance, wallet.id],
      client
    );

    await createLedgerEntry({
      client,
      userId,
      walletId: wallet.id,
      type: 'deposit',
      amount,
      balanceAfter: nextBalance,
      description: 'Wallet funded by user deposit',
      metadata: { source: 'manual-funding' }
    });

    return mapWallet(updatedResult.rows[0]);
  });
}

export async function withdrawFromWallet(userId: string, amount: number) {
  if (!assertPositiveMoney(amount)) {
    throw new ApiError(400, 'Withdrawal amount must be greater than zero', 'INVALID_AMOUNT');
  }

  return withTransaction(async (client) => {
    const wallet = await getWalletForUser(userId, client, true);
    const currentBalance = Number(wallet.available_balance);

    if (currentBalance < amount) {
      throw new ApiError(400, 'Insufficient wallet balance', 'INSUFFICIENT_FUNDS');
    }

    const nextBalance = toMoney(currentBalance - amount);

    const updatedResult = await query<WalletRow>(
      `
        update public.wallets
        set available_balance = $1
        where id = $2
        returning id, available_balance, reserved_balance, updated_at
      `,
      [nextBalance, wallet.id],
      client
    );

    await createLedgerEntry({
      client,
      userId,
      walletId: wallet.id,
      type: 'withdrawal',
      amount,
      balanceAfter: nextBalance,
      description: 'Wallet withdrawal requested by user',
      metadata: { destination: 'external-cash-account' }
    });

    return mapWallet(updatedResult.rows[0]);
  });
}
