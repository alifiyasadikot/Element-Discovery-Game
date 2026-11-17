import bcrypt from 'bcryptjs';
import { one } from '@/lib/db';
import { setSession } from '@/lib/auth';
import { json, body } from '@/lib/api';
import { logActivity } from '@/lib/mongo';

export async function POST(req) {
  const { identifier = '', password = '' } = await body(req);
  const id = identifier.trim().toLowerCase();
  const user = await one('SELECT user_id, password_hash FROM app_user WHERE LOWER(email) = ? OR LOWER(username) = ?', [id, id]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    logActivity({ event_type: 'login_failed', identifier: id });
    return json({ error: 'Wrong email/username or password' }, 401);
  }
  await setSession(user.user_id);
  logActivity({ user_id: user.user_id, event_type: 'login' });
  return json({ ok: true });
}
