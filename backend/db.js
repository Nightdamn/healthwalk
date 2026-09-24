import pg from 'pg';

// DATE (oid 1082) отдаём строкой 'YYYY-MM-DD'. По умолчанию pg делает из неё
// JS Date в полночь часового пояса сервера (MSK), и toISOString/slice(0,10)
// сдвигает дату на день назад.
pg.types.setTypeParser(1082, v => v);

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'instep',
  user: process.env.DB_USER || 'instep',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

// Helper: run query and return rows
export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

// Helper: run query and return first row or null
export async function queryOne(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

// Helper: run query and return row count
export async function execute(text, params) {
  const res = await pool.query(text, params);
  return res.rowCount;
}

// Выполнить fn(client) в одной транзакции. client.query возвращает pg Result.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
