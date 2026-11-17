import mysql from 'mysql2/promise';

// one pool per server process (survives Next.js dev hot-reloads)
const g = globalThis;
export const pool =
  g.__edgPool ??
  (g.__edgPool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'element_game',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    dateStrings: true, // keep DATETIMEs as plain strings (safe to pass to client components)
  }));

/** SELECT / DML -> rows */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** CALL proc(...) -> rows of the first result set ([] if the procedure returns none) */
export async function callProc(sql, params = []) {
  const [res] = await pool.query(sql, params);
  return Array.isArray(res) && Array.isArray(res[0]) ? res[0] : [];
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}
