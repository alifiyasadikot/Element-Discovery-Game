import { query } from '@/lib/db';
import { apiUser, json, body, dbError, int } from '@/lib/api';

export async function POST(req) {
  const [, err] = await apiUser(['Admin', 'Moderator']);
  if (err) return err;
  const b = await body(req);
  const a = int(b.e1), c = int(b.e2), r = int(b.result);
  const difficulty = int(b.difficulty) ?? 1, xp = int(b.xp) ?? 10;
  if (!a || !c || !r) return json({ error: 'Pick both ingredients and a result' }, 400);
  try {
    // canonical order -> A+B and B+A are the same recipe (UNIQUE + CHECK enforce it in the DB too)
    await query(
      'INSERT INTO recipe (element1_id, element2_id, result_element_id, difficulty, xp_reward) VALUES (?, ?, ?, ?, ?)',
      [Math.min(a, c), Math.max(a, c), r, difficulty, xp]);
    return json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return json({ error: 'A recipe for that pair already exists' }, 409);
    return dbError(e);
  }
}
