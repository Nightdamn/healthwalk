import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'healthwalk',
  user: process.env.DB_USER || 'healthwalk',
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

export default pool;
