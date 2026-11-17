
import { query, callProc } from '@/lib/db';
import { apiUser, json, body, dbError, int } from '@/lib/api';
import { logActivity } from '@/lib/mongo';

export async function POST(req, { params }) {
  const [user, err] = await apiUser();
  if (err) return err;

  const battleId = Number(params.id);

  if (!Number.isSafeInteger(battleId) || battleId < 1) {
    return json({ error: 'Invalid battle ID' }, 400);
  }

  const b = (await body(req)) ?? {};
  
  const e1 = int(b.e1);
  const e2 = int(b.e2);

  if (
    !Number.isSafeInteger(e1) ||
    !Number.isSafeInteger(e2) ||
    e1 < 1 ||
    e2 < 1
  ) {
    return json({ error: 'Pick two valid elements' }, 400);
  }

  try {
    // MySQL is responsible for validating:
    // 1. Battle membership
    // 2. The player's independent timer
    // 3. Availability of both elements
    // 4. Duplicate recipes
    // 5. Authoritative scoring
    const [res] = await callProc(
      'CALL battle_combine(?, ?, ?, ?)',
      [battleId, user.user_id, e1, e2]
    );

    if (!res) {
      return json(
        { error: 'No response from the combination engine' },
        500
      );
    }

    // No attempt should be recorded if the timer has expired.
    if (res.outcome === 'TIME_UP') {
      return json({
        outcome: 'TIME_UP',
        points: 0,
        result: null
      });
    }

    if (
      !['SUCCESS', 'FAIL', 'DUPLICATE'].includes(res.outcome)
    ) {
      return json(
        { error: 'Unexpected combination outcome' },
        500
      );
    }

    const names = await query(
      `SELECT element_id, name, icon_url
       FROM element
       WHERE element_id IN (?, ?, ?)`,
      [e1, e2, res.result_element_id ?? 0]
    );

    const nm = (id) =>
      names.find((n) => n.element_id === id);

    // MongoDB records activity for analytics.
    // MySQL remains the authoritative source for scores.
    // Do not let MongoDB activity change battle outcomes.
    void logActivity({
      user_id: user.user_id,
      event_type: 'battle_action',
      battle_id: battleId,
      element1: nm(e1)?.name,
      element2: nm(e2)?.name,
      outcome: res.outcome,
      success: res.outcome === 'SUCCESS',
      points_earned: res.points_earned
    });

    return json({
      outcome: res.outcome,
      points: Number(res.points_earned) || 0,
      result: nm(res.result_element_id) ?? null
    });

  } catch (e) {
    return dbError(e);
  }
}
