import { query } from '@/lib/db';
import { apiUser, json, body, int } from '@/lib/api';

export async function PATCH(req) {
  const [admin, err] = await apiUser(['Admin']);
  if (err) return err;
  const b = await body(req);
  const userId = int(b.userId), roleId = int(b.roleId);
  if (!userId || !roleId) return json({ error: 'userId and roleId required' }, 400);
  if (userId === admin.user_id) return json({ error: "You can't change your own role" }, 400);
  await query('UPDATE app_user SET role_id = ? WHERE user_id = ?', [roleId, userId]);
  return json({ ok: true });
}
