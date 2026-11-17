import { requireUser } from '@/lib/auth';
import { query, one } from '@/lib/db';
import PlayClient from './PlayClient';

export const dynamic = 'force-dynamic';

export default async function PlayPage() {
  const user = await requireUser();
  const elements = await query(
    `SELECT e.element_id, e.name, e.description, e.icon_url, e.rarity, ue.favorite
       FROM user_element ue JOIN element e ON e.element_id = ue.element_id
      WHERE ue.user_id = ? AND e.is_active ORDER BY ue.unlocked_at, e.element_id`, [user.user_id]);
  const stats = await one('SELECT elements_total FROM player_statistics_view WHERE user_id = ?', [user.user_id]);
  return <PlayClient initialElements={elements.map((e) => ({ ...e, favorite: !!e.favorite }))} user={user} total={stats.elements_total} />;
}
