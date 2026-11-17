import { requireUser } from '@/lib/auth';
import { query, one } from '@/lib/db';
import { getMongoDb } from '@/lib/mongo';
import AdminPanel from './AdminPanel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const me = await requireUser(['Admin', 'Moderator']);

  // ---------- MySQL: counts + managed lists ----------
  const totals = await one(
    `SELECT (SELECT COUNT(*) FROM app_user) users, (SELECT COUNT(*) FROM element WHERE is_active) elements,
            (SELECT COUNT(*) FROM recipe) recipes, (SELECT COUNT(*) FROM discovery) discoveries,
            (SELECT COUNT(*) FROM battle WHERE status = 'Completed') battles`);
  const elements = await query(
    `SELECT e.element_id, e.name, e.icon_url, e.rarity, e.is_active, c.category_name
       FROM element e JOIN category c ON c.category_id = e.category_id ORDER BY e.element_id`);
  const categories = await query('SELECT category_id, category_name FROM category ORDER BY category_name');
  const elementTags = await query(
    `SELECT element_id, tag
     FROM element_tag
     ORDER BY element_id, tag`
  );
  const recipes = await query(
    `SELECT r.recipe_id, a.name AS a_name, b.name AS b_name, o.name AS res_name, r.difficulty, r.xp_reward,
            recipe_battle_points(r.xp_reward, r.difficulty) AS battle_points,
            (SELECT COUNT(*) FROM discovery d WHERE d.recipe_id = r.recipe_id) AS found
       FROM recipe r JOIN element a ON a.element_id = r.element1_id JOIN element b ON b.element_id = r.element2_id
       JOIN element o ON o.element_id = r.result_element_id ORDER BY r.recipe_id DESC LIMIT 60`);
  const users = await query(
    `SELECT u.user_id, u.username, u.email, u.xp, u.level, u.role_id, r.role_name, u.join_date
       FROM app_user u JOIN role r ON r.role_id = u.role_id ORDER BY u.user_id`);
  const roles = await query('SELECT role_id, role_name FROM role ORDER BY role_id');
  const aboveAvg = await query('SELECT username, xp FROM app_user WHERE xp > (SELECT AVG(xp) FROM app_user) ORDER BY xp DESC LIMIT 5');
  const rarest = await query(
    `SELECT e.name, e.rarity, COUNT(ue.user_id) AS owners FROM element e LEFT JOIN user_element ue ON ue.element_id = e.element_id
      WHERE e.is_active GROUP BY e.element_id, e.name, e.rarity ORDER BY owners ASC, e.name LIMIT 5`);

  // Completed-battle analytics using a nonrecursive CTE.
  const battleAnalytics = await query(
    `WITH action_totals AS (
       SELECT
         ba.battle_id,
         ba.user_id,
         COUNT(*) AS attempts,
         SUM(CASE WHEN ba.success = TRUE THEN 1 ELSE 0 END)
           AS successes,
         SUM(ba.points_earned) AS earned_points
       FROM battle_action ba
       JOIN battle b ON b.battle_id = ba.battle_id
       WHERE b.status = 'Completed'
       GROUP BY ba.battle_id, ba.user_id
     )
     SELECT
       u.username,
       COUNT(DISTINCT stats.battle_id) AS battles_with_attempts,
       SUM(stats.attempts) AS attempts,
       SUM(stats.successes) AS successes,
       SUM(stats.earned_points) AS earned_points,
       ROUND(
         100.0 * SUM(stats.successes)
         / NULLIF(SUM(stats.attempts), 0),
         1
       ) AS success_pct
     FROM action_totals stats
     JOIN app_user u ON u.user_id = stats.user_id
     GROUP BY u.user_id, u.username
     HAVING SUM(stats.attempts) >= 3
     ORDER BY earned_points DESC, successes DESC
     LIMIT 5`);

  // ---------- MongoDB: activity analytics ----------
  let mongo = null;
  const db = await getMongoDb();
  if (db) {
    const act = db.collection('game_activity');
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [summary] = await act.aggregate([
      { $match: { event_type: 'combination_attempt', timestamp: { $gte: since } } },
      { $group: { _id: null, attempts: { $sum: 1 }, ok: { $sum: { $cond: ['$success', 1, 0] } } } }]).toArray();
    const failedPairs = await act.aggregate([
      { $match: { event_type: 'combination_attempt', outcome: 'NO_RECIPE' } },
      { $group: { _id: { a: { $min: ['$element1', '$element2'] }, b: { $max: ['$element1', '$element2'] } }, n: { $sum: 1 } } },
      { $sort: { n: -1 } }, { $limit: 5 }]).toArray();
    const byType = await act.aggregate([{ $group: { _id: '$event_type', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
    // suspicious = 25+ combination attempts by one user inside a single minute
    const suspicious = await act.aggregate([
      { $match: { event_type: 'combination_attempt', timestamp: { $gte: since } } },
      { $group: { _id: { u: '$user_id', m: { $dateTrunc: { date: '$timestamp', unit: 'minute' } } }, n: { $sum: 1 } } },
      { $match: { n: { $gte: 25 } } }, { $sort: { n: -1 } }, { $limit: 5 }]).toArray();
    mongo = {
      attempts: summary?.attempts ?? 0, ok: summary?.ok ?? 0, byType,
      failedPairs: failedPairs.map((f) => ({ pair: `${f._id.a} + ${f._id.b}`, n: f.n })),
      suspicious: suspicious.map((s) => ({ user: s._id.u, minute: s._id.m.toISOString().slice(0, 16), n: s.n })),
    };
  }

  return (
    <AdminPanel
      isAdmin={me.role_name === 'Admin'}
      me={me.user_id}
      totals={totals}
      elements={elements}
      elementTags={elementTags}
      categories={categories}
      recipes={recipes}
      users={users}
      roles={roles}
      aboveAvg={aboveAvg}
      rarest={rarest}
      battleAnalytics={battleAnalytics}
      mongo={mongo}
    />
  );
}
