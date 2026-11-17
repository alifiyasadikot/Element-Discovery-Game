import { query } from '@/lib/db';
import { apiUser, json, body, int } from '@/lib/api';

export async function POST(req) {
  const [user, err] = await apiUser();
  if (err) return err;
  const id = int((await body(req)).elementId);
  if (!id) return json({ error: 'elementId required' }, 400);
  const r = await query('UPDATE user_element SET favorite = NOT favorite WHERE user_id = ? AND element_id = ?', [user.user_id, id]);
  if (!r.affectedRows) return json({ error: 'You have not unlocked that element' }, 404);
  const [row] = await query('SELECT favorite FROM user_element WHERE user_id = ? AND element_id = ?', [user.user_id, id]);
  return json({ favorite: !!row.favorite });
}
