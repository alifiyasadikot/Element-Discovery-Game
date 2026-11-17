import { query, callProc } from '@/lib/db';
import { apiUser, json, body, dbError, int } from '@/lib/api';
import { logActivity } from '@/lib/mongo';

export const dynamic = 'force-dynamic';


export async function GET() {
  const [user, err] = await apiUser();
  if (err) return err;

  try {
    // Also handle expired turns when someone opens the lobby.
    await query('CALL refresh_expired_battles()');

    // Public challenge information only.
    // Never return starting_elements or battle_action data here.
    const open = await query(
      `SELECT
          b.battle_id,
          b.name,
          b.time_limit,
          u.username AS host,
          bp.score AS target_score
       FROM battle b
       JOIN battle_player bp ON bp.battle_id = b.battle_id
       JOIN app_user u ON u.user_id = bp.user_id
       WHERE b.status = 'Pending'
         AND b.start_time IS NOT NULL
         AND b.starting_elements IS NOT NULL
         AND (
           SELECT COUNT(*)
           FROM battle_player p
           WHERE p.battle_id = b.battle_id
         ) = 1
         AND NOT EXISTS (
           SELECT 1
           FROM battle_player mine
           WHERE mine.battle_id = b.battle_id
             AND mine.user_id = ?
         )
       ORDER BY b.battle_id DESC
       LIMIT 20`,
      [user.user_id]
    );

    const mine = await query(
      `SELECT
          b.battle_id,
          b.name,
          b.status,
          b.winner_id,
          (SELECT GROUP_CONCAT(u2.username SEPARATOR ' vs ')
             FROM battle_player p2
             JOIN app_user u2 ON u2.user_id = p2.user_id
            WHERE p2.battle_id = b.battle_id) AS players
       FROM battle b
       JOIN battle_player bp
         ON bp.battle_id = b.battle_id
        AND bp.user_id = ?
       ORDER BY b.battle_id DESC
       LIMIT 20`,
      [user.user_id]
    );

    return json({ open, mine });
  } catch (e) {
    return dbError(e);
  }
}


export async function POST(req) {
  const [user, err] = await apiUser();
  if (err) return err;
  const b = await body(req) ?? {};
  const name = String(b.name || `${user.username}'s duel`).trim().slice(0, 80);
  const limit = int(b.timeLimit) ?? 120;
  if (limit < 30 || limit > 900) return json({ error: 'Time limit must be 30-900 seconds' }, 400);
  try {
    const [row] = await callProc('CALL create_battle(?, ?, ?)', [user.user_id, name, limit]);
    logActivity({ user_id: user.user_id, event_type: 'battle_created', battle_id: row.battle_id });
    return json({ battle_id: row.battle_id });
  } catch (e) {
    return dbError(e);
  }
}
