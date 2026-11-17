import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { setSession } from '@/lib/auth';
import { json, body, dbError } from '@/lib/api';
import { logActivity } from '@/lib/mongo';

export async function POST(req) {
  const { username = '', email = '', password = '' } = await body(req);
  const u = username.trim(), e = email.trim().toLowerCase();
  if (!/^[A-Za-z0-9_]{3,30}$/.test(u)) return json({ error: 'Username: 3-30 letters, numbers or _' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ error: 'Enter a valid email' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await query(
      `INSERT INTO app_user (username, email, password_hash, role_id)
       VALUES (?, ?, ?, (SELECT role_id FROM role WHERE role_name = 'Player'))`,
      [u, e, hash]
    );
    await setSession(r.insertId);
    logActivity({ user_id: r.insertId, event_type: 'register', username: u });
    return json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return json({ error: 'Username or email is already taken' }, 409);
    return dbError(err);
  }
}
