
import { query } from '@/lib/db';
import { apiUser, json, dbError } from '@/lib/api';
import { logActivity } from '@/lib/mongo';

export async function POST(_req, { params }) {
  const [user, err] = await apiUser();
  if (err) return err;

  const battleId = Number(params.id);

  if (!Number.isSafeInteger(battleId) || battleId < 1) {
    return json({ error: 'Invalid battle ID' }, 400);
  }

  try {
    // MySQL checks that:
    // 1. Player 1's turn has expired
    // 2. The challenge is available
    // 3. The requesting user is not the host
    // 4. No opponent has already joined
    //
    // Player 2's independent timer starts in MySQL.
    await query(
      'CALL join_battle(?, ?)',
      [battleId, user.user_id]
    );

    void logActivity({
      user_id: user.user_id,
      event_type: 'battle_joined',
      battle_id: battleId
    });

    return json({
      ok: true
    });

  } catch (e) {
    return dbError(e);
  }
}
