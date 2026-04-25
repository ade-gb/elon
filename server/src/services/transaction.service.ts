import { query } from '../config/database';

type TransactionRow = {
  id: string;
  type: string;
  status: string;
  amount: string;
  balance_after: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
  product_name: string | null;
};

export async function listTransactions(input: {
  userId: string;
  limit: number;
  offset: number;
  type?: string;
}) {
  const result = await query<TransactionRow>(
    `
      select
        lt.id,
        lt.type,
        lt.status,
        lt.amount,
        lt.balance_after,
        lt.description,
        lt.metadata,
        lt.created_at,
        ip.name as product_name
      from public.ledger_transactions lt
      left join public.investment_products ip on ip.id = lt.product_id
      where lt.user_id = $1
        and ($2::text is null or lt.type = $2)
      order by lt.created_at desc
      limit $3 offset $4
    `,
    [input.userId, input.type ?? null, input.limit, input.offset]
  );

  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    description: row.description,
    metadata: row.metadata,
    createdAt: row.created_at,
    productName: row.product_name
  }));
}
