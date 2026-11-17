
import { query } from '@/lib/db';
import { apiUser, json, dbError } from '@/lib/api';
import { logActivity } from '@/lib/mongo';

export async function POST(_req, { params }) {
  const [user, err] = await apiUser();
  if (err) return err;

  const id = Number(params.id);

  if (!Number.isInteger(id) || id < 1) {
    return json({ error: 'Invalid battle ID' }, 400);
  }

  try {
    await query(
      'CALL forfeit_battle(?, ?)',
      [id, user.user_id]
    );

    await logActivity({
      user_id: user.user_id,
      event_type: 'battle_forfeited',
      battle_id: id
    });

    return json({
      ok: true,
      status: 'Completed',
      end_reason: 'Forfeit'
    });
  } catch (e) {
    return dbError(e);
  }
}
