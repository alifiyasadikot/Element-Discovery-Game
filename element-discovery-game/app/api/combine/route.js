import { query, callProc } from '@/lib/db';
import { apiUser, json, body, dbError, int } from '@/lib/api';
import { logActivity } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const [user, err] = await apiUser();
  if (err) return err;
  const b = await body(req);
  const e1 = int(b.e1), e2 = int(b.e2);
  if (!e1 || !e2) return json({ error: 'Pick two elements' }, 400);

  try {
    const before = await snapshot(user.user_id);
    const [res] = await callProc('CALL combine_elements(?, ?, ?)', [user.user_id, e1, e2]);
    const after = await snapshot(user.user_id);

    const names = await query('SELECT element_id, name FROM element WHERE element_id IN (?, ?)', [e1, e2]);
    const nm = (id) => names.find((n) => n.element_id === id)?.name;
    let element = null;
    if (res.result_element_id) {
      element = (await query(
        `SELECT e.element_id, e.name, e.description, e.icon_url, e.rarity, c.category_name
           FROM element e JOIN category c ON c.category_id = e.category_id WHERE e.element_id = ?`,
        [res.result_element_id]
      ))[0];
    }
    logActivity({
      user_id: user.user_id, event_type: 'combination_attempt',
      element1: nm(e1), element2: nm(e2), success: res.outcome === 'DISCOVERED',
      outcome: res.outcome, result_element: element?.name ?? null,
      xp_earned: res.xp_earned, is_first_discovery: !!res.is_first_discovery,
    });

    return json({
      outcome: res.outcome,
      element,
      xp_earned: res.xp_earned,
      is_first_discovery: !!res.is_first_discovery,
      user: { xp: after.xp, level: after.level },
      leveled_up: after.level > before.level,
      new_achievements: after.achievements.filter((a) => !before.achievements.includes(a)),
      completed_challenges: after.challenges.filter((c) => !before.challenges.includes(c)),
    });
  } catch (e) {
    return dbError(e);
  }
}

async function snapshot(userId) {
  const [u] = await query('SELECT xp, level FROM app_user WHERE user_id = ?', [userId]);
  const ach = await query(
    'SELECT a.name FROM user_achievement ua JOIN achievement a ON a.achievement_id = ua.achievement_id WHERE ua.user_id = ?', [userId]);
  const ch = await query(
    "SELECT c.title FROM user_challenge uc JOIN challenge c ON c.challenge_id = uc.challenge_id WHERE uc.user_id = ? AND uc.status = 'Completed'", [userId]);
  return { ...u, achievements: ach.map((a) => a.name), challenges: ch.map((c) => c.title) };
}
