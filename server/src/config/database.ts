import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client?: Queryable
): Promise<QueryResult<T>> {
  const executor = client ?? pool;
  return executor.query<T>(sql, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection() {
  await pool.query('select 1');
}
