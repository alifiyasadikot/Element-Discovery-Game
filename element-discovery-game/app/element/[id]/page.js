import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { query, one } from '@/lib/db';
import { getElementMeta } from '@/lib/mongo';
import Icon from '@/components/Icon';
import { RARITY_COLOR } from '@/lib/ui';

export const dynamic = 'force-dynamic';

// Discovery graph, from the player's point of view:
//   left  = the two ingredients that CREATE this element
//   right = elements this one helps to create ("?" until the player owns them)
export default async function ElementPage({ params }) {
  const user = await requireUser();
  const id = Number(params.id);
  const el = await one(
    `SELECT e.*, c.category_name FROM element e JOIN category c ON c.category_id = e.category_id WHERE e.element_id = ? AND e.is_active`, [id]);
  if (!el) notFound();
  const owned = await one('SELECT 1 AS ok FROM user_element WHERE user_id = ? AND element_id = ?', [user.user_id, id]);
  if (!owned) return (<div className="card center"><h2>🔒 Locked element</h2><p className="muted">Discover it first to see its details.</p><Link href="/play" className="btn">Back to play</Link></div>);

  const own = (col) => `EXISTS (SELECT 1 FROM user_element x WHERE x.user_id = ${Number(user.user_id)} AND x.element_id = ${col})`;
  const createdFrom = await query(
    `SELECT a.name AS a_name, a.icon_url AS a_icon, b.name AS b_name, b.icon_url AS b_icon, r.xp_reward, r.difficulty,
            ${own('r.element1_id')} AND ${own('r.element2_id')} AS known
       FROM recipe r JOIN element a ON a.element_id = r.element1_id JOIN element b ON b.element_id = r.element2_id
      WHERE r.result_element_id = ?`, [id]);
  const usedIn = await query(
    `SELECT o.element_id AS res_id, o.name AS res_name, o.icon_url AS res_icon, p.name AS partner, ${own('r.result_element_id')} AS known
       FROM recipe r
       JOIN element o ON o.element_id = r.result_element_id
       JOIN element p ON p.element_id = IF(r.element1_id = ?, r.element2_id, r.element1_id)
      WHERE r.element1_id = ? OR r.element2_id = ?`, [id, id, id]);
  const tags = await query('SELECT tag FROM element_tag WHERE element_id = ? ORDER BY tag', [id]);
  const meta = await getElementMeta(id);
   const globalOwners = (await one('SELECT COUNT(*) AS n FROM user_element WHERE element_id = ?', [id])).n;

  // Recursively trace ingredient dependencies through recipes
  // this player has actually discovered.
  const dependencyChain = await query(
    `WITH RECURSIVE dependencies AS (
       SELECT
         e.element_id,
         e.name,
         0 AS depth,
         CAST(
           CONCAT(',', e.element_id, ',')
           AS CHAR(1000)
         ) AS visited_path
       FROM element e
       WHERE e.element_id = ?

       UNION ALL

       SELECT
         ingredient.element_id,
         ingredient.name,
         dependencies.depth + 1,
         CONCAT(
           dependencies.visited_path,
           ingredient.element_id,
           ','
         )
       FROM dependencies
       JOIN recipe r
         ON r.result_element_id = dependencies.element_id
       JOIN discovery d
         ON d.recipe_id = r.recipe_id
        AND d.user_id = ?
       JOIN element ingredient
         ON ingredient.element_id IN (
           r.element1_id,
           r.element2_id
         )
       JOIN user_element owned
         ON owned.element_id = ingredient.element_id
        AND owned.user_id = ?
       WHERE dependencies.depth < 10
         AND LOCATE(
           CONCAT(',', ingredient.element_id, ','),
           dependencies.visited_path
         ) = 0
     )
     SELECT
       element_id,
       name,
       MIN(depth) AS depth
     FROM dependencies
     WHERE depth > 0
     GROUP BY element_id, name
     ORDER BY depth, name`,
    [id, user.user_id, user.user_id]
  );

  // --- tiny node-link graph (SVG) ---
  const ingredients = createdFrom.filter((r) => r.known).flatMap((r) => [{ name: r.a_name, icon: r.a_icon }, { name: r.b_name, icon: r.b_icon }])
    .filter((n, i, arr) => arr.findIndex((m) => m.name === n.name) === i).slice(0, 4);
  const outputs = usedIn.filter((u, i, arr) => arr.findIndex((m) => m.res_id === u.res_id) === i).slice(0, 6)
    .map((u) => (u.known ? { name: u.res_name, icon: u.res_icon, id: u.res_id } : { name: '???', icon: '❔' }));
  const H = Math.max(160, Math.max(ingredients.length, outputs.length) * 56 + 20);
  const y = (i, n) => (H / (n + 1)) * (i + 1);

  return (
    <>
      <p><Link href="/collection">← Collection</Link></p>
      <div className="card" style={{ borderColor: RARITY_COLOR[el.rarity] }}>
        <div className="row"><span className="big"><Icon src={el.icon_url} size="3rem" /></span>
          <div><h1 style={{ margin: 0 }}>{el.name}</h1>
            <div className="row small"><span className="pill" style={{ color: RARITY_COLOR[el.rarity] }}>{el.rarity}</span><span className="pill muted">{el.category_name}</span>
              {tags.map((t) => <span key={t.tag} className="pill muted">#{t.tag}</span>)}</div></div></div>
        <p>{el.description}</p>
        {meta?.lore && <p className="muted"><i>{meta.lore}</i></p>}
        {meta?.aliases?.length > 0 && <div className="small muted">Also known as: {meta.aliases.join(', ')}</div>}
        {meta?.fun_facts?.map((f, i) => <div key={i} className="small muted">• {f}</div>)}
        <div className="small muted" style={{ marginTop: '.5rem' }}>Unlocked by {globalOwners} player{globalOwners === 1 ? '' : 's'}.</div>
      </div>

      <div className="card">
        <h2>Discovery graph</h2>
        <svg viewBox={`0 0 640 ${H}`} width="100%" style={{ maxWidth: 640 }}>
          {ingredients.map((n, i) => <line key={'l' + i} x1="130" y1={y(i, ingredients.length)} x2="270" y2={H / 2} stroke="#2a3560" strokeWidth="2" />)}
          {outputs.map((n, i) => <line key={'r' + i} x1="370" y1={H / 2} x2="510" y2={y(i, outputs.length)} stroke="#2a3560" strokeWidth="2" />)}
          {ingredients.map((n, i) => (<g key={'a' + i}><rect className="node" x="20" y={y(i, ingredients.length) - 20} width="110" height="40" rx="10" /><text x="75" y={y(i, ingredients.length) + 4} textAnchor="middle">{n.icon} {n.name}</text></g>))}
          <g><rect className="node me" x="270" y={H / 2 - 24} width="100" height="48" rx="12" /><text x="320" y={H / 2 + 5} textAnchor="middle" style={{ fontWeight: 700 }}>{el.name}</text></g>
          {outputs.map((n, i) => (<g key={'o' + i}><rect className="node" x="510" y={y(i, outputs.length) - 20} width="110" height="40" rx="10" /><text x="565" y={y(i, outputs.length) + 4} textAnchor="middle">{n.icon} {n.name}</text></g>))}
        </svg>
        {!ingredients.length && <div className="muted small">Starter element — nothing creates it.</div>}
      </div>

      <div className="card">
        <h3>Known Ingredient Dependencies</h3>

        <p className="muted small">
          Recursive MySQL query showing ingredients from
          your previously discovered recipe chains.
          The query prevents cycles and limits recursion
          to 10 levels.
        </p>

        {dependencyChain.length === 0 ? (
          <div className="muted small">
            No earlier discovered recipe dependencies.
          </div>
        ) : (
          <div>
            {dependencyChain.map((item) => (
              <div
                key={item.element_id}
                className="small"
                style={{ padding: '.25rem 0' }}
              >
                <Link href={`/element/${item.element_id}`}>
                  {item.name}
                </Link>

                <span className="muted">
                  {' '}· Dependency level {item.depth}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid g2">
        <div className="card"><h3>Created from</h3>
          {createdFrom.length === 0 && <div className="muted small">Starter element.</div>}
          {createdFrom.map((r, i) => <div key={i} className="small">{r.known ? <><Icon src={r.a_icon} size="1rem" /> {r.a_name} + <Icon src={r.b_icon} size="1rem" /> {r.b_name} · {r.xp_reward} XP · difficulty {r.difficulty}</> : <span className="muted">❔ ??? + ??? (you haven't found both ingredients yet)</span>}</div>)}
        </div>
        <div className="card"><h3>Used to create</h3>
          {usedIn.length === 0 && <div className="muted small">Not used in any recipe yet.</div>}
          {usedIn.map((u, i) => <div key={i} className="small">{u.known ? <>with {u.partner} → <Icon src={u.res_icon} size="1rem" /> {u.res_name}</> : <span className="muted">with ??? → ❔ ???</span>}</div>)}
        </div>
      </div>
    </>
  );
}
