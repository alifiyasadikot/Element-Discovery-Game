
import { query, one } from '@/lib/db';
import { apiUser, json, dbError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const [user, err] = await apiUser();
  if (err) return err;

  const id = Number(params.id);

  if (!Number.isInteger(id) || id < 1) {
    return json({ error: 'Invalid battle ID' }, 400);
  }

  try {
    await query('CALL advance_battle(?)', [id]);

    // Check membership before returning any match details.
    const member = await one(
      `SELECT 1 AS allowed
       FROM battle_player
       WHERE battle_id = ?
         AND user_id = ?`,
      [id, user.user_id]
    );

    if (!member) {
      return json(
        { error: 'You are not a player in this battle' },
        403
      );
    }

    const battle = await one(
      `SELECT
          b.battle_id,
          b.name,
          b.status,
          b.time_limit,
          b.start_time,
          b.end_time,
          b.end_reason,
          b.winner_id,
          u.username AS winner_name
       FROM battle b
       LEFT JOIN app_user u ON u.user_id = b.winner_id
       WHERE b.battle_id = ?`,
      [id]
    );

    if (!battle || battle.status !== 'Completed') {
      return json(
        { error: 'Match details are available only after completion' },
        403
      );
    }

    const players = await query(
      `SELECT
          bp.user_id,
          u.username,
          bp.score,
          bp.combinations_completed,
          bp.completion_time
       FROM battle_player bp
       JOIN app_user u ON u.user_id = bp.user_id
       WHERE bp.battle_id = ?
       ORDER BY bp.joined_at, bp.user_id`,
      [id]
    );

    // Return all attempts, not only the most recent 30.
    const actions = await query(
      `SELECT
          ba.action_seq,
          ba.user_id,
          u.username,
          ba.element1_id,
          e1.name AS e1,
          ba.element2_id,
          e2.name AS e2,
          ba.recipe_id,
          ba.result_element_id,
          er.name AS result,
          er.icon_url AS result_icon,
          ba.success,
          ba.points_earned,
          ba.action_time,
          CASE
            WHEN ba.success = TRUE THEN 'SUCCESS'
            WHEN ba.recipe_id IS NULL THEN 'FAIL'
            ELSE 'DUPLICATE'
          END AS outcome
       FROM battle_action ba
       JOIN app_user u ON u.user_id = ba.user_id
       JOIN element e1 ON e1.element_id = ba.element1_id
       JOIN element e2 ON e2.element_id = ba.element2_id
       LEFT JOIN element er
         ON er.element_id = ba.result_element_id
       WHERE ba.battle_id = ?
       ORDER BY ba.action_seq`,
      [id]
    );

    return json({
      battle,
      players,
      actions
    });

  } catch (e) {
    return dbError(e);
  }
}
