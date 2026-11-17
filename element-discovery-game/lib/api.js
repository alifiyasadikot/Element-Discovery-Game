import { NextResponse } from 'next/server';
import { getUser } from './auth';

export const json = (data, status = 200) => NextResponse.json(data, { status });

/** returns [user, errorResponse] */
export async function apiUser(roles) {
  const user = await getUser();
  if (!user) return [null, json({ error: 'Please sign in first' }, 401)];
  if (roles && !roles.includes(user.role_name)) return [null, json({ error: 'Not allowed' }, 403)];
  return [user, null];
}

/** turn a MySQL error into a clean API response */
export function dbError(e) {
  if (e?.sqlState === '45000') return json({ error: e.sqlMessage }, 400);   // SIGNAL from our procedures
  if (e?.code === 'ER_DUP_ENTRY') return json({ error: 'That already exists' }, 409);
  if (e?.code === 'ER_NO_REFERENCED_ROW_2') return json({ error: 'Unknown element, category or role' }, 400);
  if (e?.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e?.errno === 4025 || e?.errno === 3819)
    return json({ error: 'A value violates a database constraint' }, 400);
  console.error(e);
  return json({ error: 'Server error' }, 500);
}

export async function body(req) {
  try { return await req.json(); } catch { return {}; }
}
export const int = (v) => (Number.isInteger(Number(v)) && v !== '' && v !== null ? Number(v) : null);
