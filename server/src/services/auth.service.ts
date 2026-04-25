import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { ApiError } from '../lib/api-error';
import { signAccessToken, UserRole } from '../lib/jwt';
import { comparePassword, hashPassword } from '../lib/password';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
};

type WalletRow = {
  available_balance: string;
  reserved_balance: string;
};

function mapProfile(user: Pick<UserRow, 'id' | 'email' | 'role' | 'created_at'>, wallet: WalletRow) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
    wallet: {
      availableBalance: Number(wallet.available_balance),
      reservedBalance: Number(wallet.reserved_balance)
    }
  };
}

async function getWalletByUserId(userId: string, client?: PoolClient) {
  const result = await query<WalletRow>(
    `
      select available_balance, reserved_balance
      from public.wallets
      where user_id = $1
    `,
    [userId],
    client
  );

  const wallet = result.rows[0];

  if (!wallet) {
    throw new ApiError(404, 'Wallet not found for user', 'WALLET_NOT_FOUND');
  }

  return wallet;
}

export async function registerUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  try {
    return await withTransaction(async (client) => {
      const userResult = await query<UserRow>(
        `
          insert into public.app_users (email, password_hash)
          values ($1, $2)
          returning id, email, password_hash, role, created_at
        `,
        [email, passwordHash],
        client
      );

      const user = userResult.rows[0];

      const walletResult = await query<WalletRow>(
        `
          insert into public.wallets (user_id)
          values ($1)
          returning available_balance, reserved_balance
        `,
        [user.id],
        client
      );

      const wallet = walletResult.rows[0];
      const token = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role
      });

      return {
        token,
        user: mapProfile(user, wallet)
      };
    });
  } catch (error) {
    const candidate = error as Error & { code?: string };

    if (candidate.code === '23505') {
      throw new ApiError(409, 'Email is already registered', 'EMAIL_TAKEN');
    }

    throw error;
  }
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();

  const result = await query<UserRow>(
    `
      select id, email, password_hash, role, created_at
      from public.app_users
      where email = $1
      limit 1
    `,
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const isValid = await comparePassword(input.password, user.password_hash);

  if (!isValid) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const wallet = await getWalletByUserId(user.id);

  return {
    token: signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role
    }),
    user: mapProfile(user, wallet)
  };
}

export async function getCurrentUserProfile(userId: string) {
  const userResult = await query<UserRow>(
    `
      select id, email, password_hash, role, created_at
      from public.app_users
      where id = $1
      limit 1
    `,
    [userId]
  );

  const user = userResult.rows[0];

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const wallet = await getWalletByUserId(userId);
  return mapProfile(user, wallet);
}
