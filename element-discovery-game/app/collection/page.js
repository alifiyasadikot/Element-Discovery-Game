import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query, one } from '@/lib/db';
import Icon from '@/components/Icon';
import FavButton from '@/components/FavButton';
import { RARITY_COLOR } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Collection({ searchParams }) {
  const user = await requireUser();
  const { q = '', category = '', rarity = '', fav = '' } = searchParams;
  const like = `%${q.trim()}%`;

  const items = await query(
    `SELECT e.element_id, e.name, e.description, e.icon_url, e.rarity, c.category_name, ue.favorite, ue.unlocked_at,
            (SELECT CONCAT(a.name, ' + ', b.name)
               FROM discovery d JOIN recipe r ON r.recipe_id = d.recipe_id
               JOIN element a ON a.element_id = r.element1_id JOIN element b ON b.element_id = r.element2_id
              WHERE d.user_id = ue.user_id AND r.result_element_id = e.element_id LIMIT 1) AS origin
       FROM user_element ue
       JOIN element e  ON e.element_id = ue.element_id
       JOIN category c ON c.category_id = e.category_id
      WHERE ue.user_id = ? AND e.is_active
        AND (? = '' OR e.name LIKE ? OR e.description LIKE ?
             OR EXISTS (SELECT 1 FROM element_tag t WHERE t.element_id = e.element_id AND t.tag LIKE ?))
        AND (? = '' OR c.category_name = ?) AND (? = '' OR e.rarity = ?) AND (? = '' OR ue.favorite)
      ORDER BY ue.favorite DESC, ue.unlocked_at`,
    [user.user_id, q.trim(), like, like, like, category, category, rarity, rarity, fav]);
  const cats = await query('SELECT category_name FROM category ORDER BY category_name');
  const stats = await one('SELECT * FROM player_statistics_view WHERE user_id = ?', [user.user_id]);

  return (
    <>
      <h1>Your collection</h1>
      <div className="card">
        <div className="row"><b>{stats.collection_pct}% complete</b><span className="muted small">{stats.elements_owned} of {stats.elements_total} elements</span></div>
        <div className="bar" style={{ margin: '.5rem 0' }}><i style={{ width: stats.collection_pct + '%' }} /></div>
        <form className="row inline" action="/collection">
          <input name="q" placeholder="Search name, description or tag" defaultValue={q} style={{ minWidth: 220 }} />
          <select name="category" defaultValue={category}><option value="">All categories</option>{cats.map((c) => <option key={c.category_name}>{c.category_name}</option>)}</select>
          <select name="rarity" defaultValue={rarity}><option value="">All rarities</option>{['Common', 'Uncommon', 'Rare', 'Legendary'].map((r) => <option key={r}>{r}</option>)}</select>
          <label className="row small" style={{ margin: 0 }}><input type="checkbox" name="fav" value="1" defaultChecked={!!fav} style={{ width: 'auto' }} /> ★ only</label>
          <button>Filter</button><Link href="/collection" className="btn ghost">Reset</Link>
        </form>
      </div>
      <div className="grid g3">
        {items.map((e) => (
          <Link key={e.element_id} href={`/element/${e.element_id}`} className="card" style={{ borderColor: RARITY_COLOR[e.rarity] + '99', color: 'inherit', textDecoration: 'none', marginBottom: 0 }}>
            <div className="row"><Icon src={e.icon_url} size="2rem" /><b>{e.name}</b><span className="right"><FavButton elementId={e.element_id} initial={!!e.favorite} /></span></div>
            <div className="row small" style={{ margin: '.3rem 0' }}>
              <span className="pill" style={{ color: RARITY_COLOR[e.rarity] }}>{e.rarity}</span><span className="pill muted">{e.category_name}</span>
            </div>
            <div className="muted small">{e.description}</div>
            <div className="small" style={{ marginTop: '.4rem' }}>{e.origin ? <>Made from <b>{e.origin}</b></> : <span className="muted">Starter element</span>}</div>
            <div className="muted small">Unlocked {e.unlocked_at.slice(0, 10)}</div>
          </Link>
        ))}
        {!items.length && <div className="muted">Nothing matches your filters.</div>}
      </div>
    </>
  );
}
