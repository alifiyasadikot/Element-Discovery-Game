
import { query } from '@/lib/db';
import { apiUser, json, dbError } from '@/lib/api';

export async function POST(_req, { params }) {
  const [user, err] = await apiUser();
  if (err) return err;

  const id = Number(params.id);

  if (!Number.isInteger(id) || id < 1) {
    return json({ error: 'Invalid battle ID' }, 400);
  }

  try {
    await query(
      'CALL cancel_battle(?, ?)',
      [id, user.user_id]
    );

    return json({ ok: true, status: 'Cancelled' });
  } catch (e) {
    return dbError(e);
  }
}
