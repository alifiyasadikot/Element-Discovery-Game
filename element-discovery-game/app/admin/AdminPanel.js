'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

async function send(url, method, payload) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { ok: r.ok, data: await r.json() };
}

export default function AdminPanel({ isAdmin, me, totals, elements, elementTags, categories, recipes, users, roles, aboveAvg, rarest, battleAnalytics, mongo }) {  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const [el, setEl] = useState({ name: '', description: '', icon: '', rarity: 'Common', categoryId: categories[0]?.category_id, tags: '', lore: '' });
  const [rc, setRc] = useState({ e1: '', e2: '', result: '', difficulty: 1, xp: 10 });
  const active = elements.filter((e) => e.is_active);

  async function run(fn, okText) {
    const { ok, data } = await fn();
    setMsg(ok ? { kind: 'good', text: okText } : { kind: 'bad', text: data.error || 'Failed' });
    if (ok) router.refresh();
  }
  const Stat = ({ label, value }) => <div className="stat"><b>{value}</b><span className="muted small">{label}</span></div>;

  return (
    <>
      <h1>Admin panel</h1>
      {msg && <div className={`toast ${msg.kind}`}>{msg.text}</div>}
      <div className="grid g3" style={{ marginBottom: '1rem' }}>
        <Stat label="Players" value={totals.users} /><Stat label="Active elements" value={totals.elements} /><Stat label="Recipes" value={totals.recipes} />
        <Stat label="Discoveries" value={totals.discoveries} /><Stat label="Finished battles" value={totals.battles} />
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Add element</h2>
          <div className="row"><div style={{ flex: 2 }}><label>Name</label><input value={el.name} onChange={(e) => setEl({ ...el, name: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label>Icon (emoji / URL)</label><input value={el.icon} onChange={(e) => setEl({ ...el, icon: e.target.value })} /></div></div>
          <label>Description</label><input value={el.description} onChange={(e) => setEl({ ...el, description: e.target.value })} />
          <div className="row"><div style={{ flex: 1 }}><label>Category</label><select value={el.categoryId} onChange={(e) => setEl({ ...el, categoryId: e.target.value })}>{categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}</select></div>
            <div style={{ flex: 1 }}><label>Rarity</label><select value={el.rarity} onChange={(e) => setEl({ ...el, rarity: e.target.value })}>{['Common', 'Uncommon', 'Rare', 'Legendary'].map((r) => <option key={r}>{r}</option>)}</select></div></div>
          <label>Tags (comma separated → MySQL ELEMENT_TAG)</label><input value={el.tags} onChange={(e) => setEl({ ...el, tags: e.target.value })} />
          <label>Lore (stored in MongoDB element_metadata)</label><input value={el.lore} onChange={(e) => setEl({ ...el, lore: e.target.value })} />
          <div style={{ marginTop: '.8rem' }}><button onClick={() => run(() => send('/api/admin/elements', 'POST', el), 'Element created')}>Create element</button></div>
        </div>
        <div className="card">
          <h2>Add recipe</h2>
          <div className="row"><div style={{ flex: 1 }}><label>Ingredient 1</label><Sel v={rc.e1} on={(v) => setRc({ ...rc, e1: v })} list={active} /></div>
            <div style={{ flex: 1 }}><label>Ingredient 2</label><Sel v={rc.e2} on={(v) => setRc({ ...rc, e2: v })} list={active} /></div></div>
          <label>Result</label><Sel v={rc.result} on={(v) => setRc({ ...rc, result: v })} list={active} />
          <div className="row"><div style={{ flex: 1 }}><label>Difficulty (1-5)</label><input type="number" min="1" max="5" value={rc.difficulty} onChange={(e) => setRc({ ...rc, difficulty: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label>XP reward</label><input type="number" min="0" value={rc.xp} onChange={(e) => setRc({ ...rc, xp: e.target.value })} /></div></div>
          <div style={{ marginTop: '.8rem' }}><button onClick={() => run(() => send('/api/admin/recipes', 'POST', rc), 'Recipe created')}>Create recipe</button></div>
          <p className="muted small">A+B and B+A are the same recipe — duplicates are rejected by the database (UNIQUE + CHECK).</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>MySQL insights</h2>
          <h3>Players above average XP <span className="muted small">(subquery)</span></h3>
          {aboveAvg.map((u) => <div key={u.username} className="small">{u.username} — {u.xp} XP</div>)}
          {!aboveAvg.length && <div className="muted small">—</div>}
          <h3 style={{ marginTop: '.8rem' }}>Rarest elements by owners <span className="muted small">(GROUP BY)</span></h3>
          {rarest.map((r) => <div key={r.name} className="small">{r.name} <span className="muted">({r.rarity})</span> — {r.owners} owner{r.owners === 1 ? '' : 's'}</div>)}

          <h3 style={{ marginTop: '1rem' }}>
            Battle performance
            <span className="muted small">
              {' '}(CTE, GROUP BY, HAVING)
            </span>
          </h3>

          <p className="muted small">
            Players with at least 3 recorded attempts in
            completed battles.
          </p>

          {battleAnalytics.map((p) => (
            <div
              key={p.username}
              className="small"
              style={{ padding: '.35rem 0' }}
            >
              <b>{p.username}</b>
              {' · '}
              {p.attempts} attempts
              {' · '}
              {p.successes} successful
              {' · '}
              {p.success_pct}% success
              {' · '}
              {p.earned_points} points
            </div>
          ))}

          {!battleAnalytics.length && (
            <div className="muted small">
              No qualifying completed battle activity yet.
            </div>
          )}
        </div>
        <div className="card">
          <h2>MongoDB activity <span className="muted small">(last 24h)</span></h2>
          {!mongo ? <div className="muted">MongoDB is offline — analytics unavailable.</div> : (
            <>
              <div className="small">Attempts: <b>{mongo.attempts}</b> · success rate: <b>{mongo.attempts ? Math.round((100 * mongo.ok) / mongo.attempts) : 0}%</b></div>
              <h3 style={{ marginTop: '.6rem' }}>Most-tried impossible pairs</h3>
              {mongo.failedPairs.map((f) => <div key={f.pair} className="small">{f.pair} — {f.n}×</div>)}
              {!mongo.failedPairs.length && <div className="muted small">—</div>}
              <h3 style={{ marginTop: '.6rem' }}>Events logged</h3>
              <div className="small muted">{mongo.byType.map((t) => `${t._id}: ${t.n}`).join(' · ') || '—'}</div>
              <h3 style={{ marginTop: '.6rem' }}>⚠️ Suspicious activity</h3>
              {mongo.suspicious.map((s, i) => <div key={i} className="small" style={{ color: 'var(--warn)' }}>user #{s.user}: {s.n} attempts in one minute ({s.minute})</div>)}
              {!mongo.suspicious.length && <div className="muted small">Nothing unusual.</div>}
            </>)}
        </div>
      </div>

      <div className="card">
        <h2>Elements ({elements.length})</h2>
        <table><thead><tr><th></th><th>Name</th><th>Category</th><th>Rarity</th><th>Status</th><th>Tags</th><th></th></tr></thead><tbody>          {elements.map((e) => (
            <tr key={e.element_id} style={{ opacity: e.is_active ? 1 : 0.5 }}>
              <td><Icon src={e.icon_url} size="1.2rem" /></td>
              <td>{e.name}</td>
              <td>{e.category_name}</td>
              <td>{e.rarity}</td>
              <td>{e.is_active ? 'Active' : 'Deactivated'}</td>

              <td>
                {elementTags
                  .filter((t) => t.element_id === e.element_id)
                  .map((t) => (
                    <div
                      key={t.tag}
                      className="small"
                      style={{ marginBottom: '.3rem' }}
                    >
                      <span className="pill">
                        #{t.tag}
                      </span>

                      {isAdmin && t.tag !== 'starter' && (
                        <button
                          className="ghost small"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove tag #${t.tag} from ${e.name}?`
                              )
                            ) {
                              run(
                                () => send(
                                  '/api/admin/elements',
                                  'DELETE',
                                  {
                                    elementId: e.element_id,
                                    tag: t.tag
                                  }
                                ),
                                'Element tag removed'
                              );
                            }
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
              </td>

              <td>
                <button
                  className="ghost small"
                  onClick={() => run(
                    () => send(
                      '/api/admin/elements',
                      'PATCH',
                      {
                        elementId: e.element_id,
                        isActive: !e.is_active
                      }
                    ),
                    e.is_active
                      ? 'Element deactivated'
                      : 'Element restored'
                  )}
                >
                  {e.is_active ? 'Deactivate' : 'Restore'}
                </button>
              </td>
            </tr>))}
        </tbody></table>
      </div>

      <div className="card">
        <h2>Recipes (latest 60)</h2>
                <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Recipe</th>
              <th>Difficulty</th>
              <th>XP Reward</th>
              <th>Battle Points</th>
              <th>Times Found</th>
            </tr>
          </thead>

          <tbody>
            {recipes.map((r) => (
              <tr key={r.recipe_id}>
                <td>{r.recipe_id}</td>
                <td>
                  {r.a_name} + {r.b_name}
                  {' → '}
                  <b>{r.res_name}</b>
                </td>
                <td>{r.difficulty}</td>
                <td>{r.xp_reward}</td>
                <td>
                  <b>{r.battle_points}</b>
                </td>
                <td>{r.found}</td>
              </tr>
            ))}
        </tbody></table>
      </div>

      <div className="card">
        <h2>Users</h2>
        <table><thead><tr><th>User</th><th>Email</th><th>Level</th><th>XP</th><th>Role</th></tr></thead><tbody>
          {users.map((u) => (
            <tr key={u.user_id}><td>{u.username}</td><td className="muted">{u.email}</td><td>{u.level}</td><td>{u.xp}</td>
              <td>{isAdmin && u.user_id !== me ? (
                <select style={{ width: 'auto' }} value={u.role_id} onChange={(e) => run(() => send('/api/admin/users', 'PATCH', { userId: u.user_id, roleId: e.target.value }), 'Role updated')}>
                  {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}</select>) : u.role_name}</td></tr>))}
        </tbody></table>
      </div>
    </>
  );
}

function Sel({ v, on, list }) {
  return (
    <select value={v} onChange={(e) => on(e.target.value)}>
      <option value="">Choose…</option>
      {list.map((e) => <option key={e.element_id} value={e.element_id}>{e.name}</option>)}
    </select>
  );
}
