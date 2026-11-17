
import { query, one } from '@/lib/db';
import { apiUser, json, dbError } from '@/lib/api';
import {
  touchBattleSession,
  clearBattleSessions
} from '@/lib/mongo';
export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const [user, err] = await apiUser();
  if (err) return err;

  const id = Number(params.id);

  if (!Number.isInteger(id) || id < 1) {
    return json({ error: 'Invalid battle ID' }, 400);
  }

  try {
    // Database checks expiry, independently of the browser timer.
    await query('CALL advance_battle(?)', [id]);

    const battle = await one(
      `SELECT
          b.battle_id,
          b.name,
          b.status,
          b.time_limit,
          b.start_time,
          b.end_time,
          b.winner_id,
          b.end_reason,
          w.username AS winner_name
       FROM battle b
       LEFT JOIN app_user w ON w.user_id = b.winner_id
       WHERE b.battle_id = ?`,
      [id]
    );

    if (!battle) {
      return json({ error: 'Battle not found' }, 404);
    }

    const players = await query(
      `SELECT
          bp.user_id,
          u.username,
          bp.joined_at,
          bp.score,
          bp.combinations_completed,
          bp.completion_time
       FROM battle_player bp
       JOIN app_user u ON u.user_id = bp.user_id
       WHERE bp.battle_id = ?
       ORDER BY bp.joined_at, bp.user_id`,
      [id]
    );

    const myPlayer = players.find(
      (p) => p.user_id === user.user_id
    );

    if (!myPlayer) {
      return json(
        { error: 'You are not in this battle' },
        403
      );
    }

    const host = players[0] ?? null;
    const challenger = players[1] ?? null;

    let phase = 'WAITING';
    let activePlayer = null;

    if (battle.status === 'Completed') {
      phase = 'COMPLETED';
    } else if (battle.status === 'Cancelled') {
      phase = 'CANCELLED';
    } else if (battle.status === 'Pending') {
      phase = 'AWAITING_OPPONENT';
    } else if (battle.status === 'Active') {
      if (challenger) {
        phase = 'CHALLENGER_TURN';
        activePlayer = challenger;
      } else {
        phase = 'HOST_TURN';
        activePlayer = host;
      }
    }

    // Only calculate the current player's clock.
    // The database, not JavaScript, supplies the time remaining.
    let remaining = null;

    if (activePlayer?.user_id === user.user_id) {
      const clock = await one(
        `SELECT GREATEST(
            0,
            TIMESTAMPDIFF(
              SECOND,
              NOW(),
              DATE_ADD(bp.joined_at, INTERVAL b.time_limit SECOND)
            )
          ) AS remaining
         FROM battle_player bp
         JOIN battle b ON b.battle_id = bp.battle_id
         WHERE bp.battle_id = ?
           AND bp.user_id = ?`,
        [id, user.user_id]
      );

      remaining = clock?.remaining ?? 0;
    }

    // Before completion, hide the challenger's live score
    // from Player 1. Player 2 may see the completed host target.
    
    const visiblePlayers = players.map((p) => {
      const completed = battle.status === 'Completed';
      const isSelf = p.user_id === user.user_id;

      // Player 2 can see the host's target score,
      // but not the host's private gameplay statistics.
      const isHostTarget =
        challenger !== null &&
        host !== null &&
        p.user_id === host.user_id;

      const showScore =
        completed || isSelf || isHostTarget;

      const showPrivateStats =
        completed || isSelf;

      return {
        user_id: p.user_id,
        username: p.username,

        score: showScore
          ? p.score
          : null,

        combinations_completed: showPrivateStats
          ? p.combinations_completed
          : null,

        completion_time: showPrivateStats
          ? p.completion_time
          : null
      };
    });


    // Retrieve only this player's battle-specific collection.
    // The normal single-player user_element table is not used.
    const unlockedElements = await query(
      `SELECT
          e.element_id,
          e.name,
          e.icon_url,
          e.rarity
       FROM element e
       JOIN battle b ON b.battle_id = ?
       WHERE
         JSON_CONTAINS(
           b.starting_elements,
           JSON_ARRAY(e.element_id)
         )
         OR EXISTS (
           SELECT 1
           FROM battle_action ba
           WHERE ba.battle_id = b.battle_id
             AND ba.user_id = ?
             AND ba.success = TRUE
             AND ba.result_element_id = e.element_id
         )
       ORDER BY e.name`,
      [id, user.user_id]
    );

    // No complete action log is returned during gameplay.
    // Match details use a separate completion-protected API.
    const safeBattle = {
      ...battle,
      phase,
      remaining,
      active_player_id: activePlayer?.user_id ?? null,
      turn_started_at: (
        activePlayer?.user_id === user.user_id
          ? activePlayer.joined_at
          : null
      ),
      target_score: challenger ? host.score : null,
      details_available: battle.status === 'Completed'
    };

    // Temporary presence exists only while a battle is open.
    // Finished and cancelled battles do not need sessions.
    if (
      battle.status === 'Completed' ||
      battle.status === 'Cancelled'
    ) {
      await clearBattleSessions(id);
    } else {
      void touchBattleSession({
        battleId: id,
        userId: user.user_id
      });
    }

    return json({
      battle: safeBattle,
      players: visiblePlayers,
      actions: [],
      unlocked_elements: unlockedElements,
      me: user.user_id
    });

  } catch (e) {
    return dbError(e);
  }
}
