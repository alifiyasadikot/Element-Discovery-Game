import Link from 'next/link';
import { requireUser, levelProgress } from '@/lib/auth';
import { query, one } from '@/lib/db';
import { getMongoDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export default async function Profile() {
  const user = await requireUser();
  const s = await one('SELECT * FROM player_statistics_view WHERE user_id = ?', [user.user_id]);
  const lp = levelProgress(user);
  const recent = await query(
    `SELECT d.discovered_at, d.xp_earned, d.is_first_discovery, e.name, e.icon_url, a.name AS a_name, b.name AS b_name
       FROM discovery d JOIN recipe r ON r.recipe_id = d.recipe_id JOIN element e ON e.element_id = r.result_element_id
       JOIN element a ON a.element_id = r.element1_id JOIN element b ON b.element_id = r.element2_id
      WHERE d.user_id = ? ORDER BY d.discovered_at DESC, d.discovery_id DESC LIMIT 8`, [user.user_id]); 
  const battles = await query(
    `SELECT
        b.battle_id,
        b.name,
        b.status,
        b.winner_id,
        b.end_reason,
        bp.score,

        CASE
          WHEN b.status = 'Active'
            AND b.starting_elements IS NOT NULL
            AND (
              SELECT COUNT(*)
              FROM battle_player p
              WHERE p.battle_id = b.battle_id
            ) = 1
          THEN 'Player 1 turn in progress'

          WHEN b.status = 'Active'
            AND b.starting_elements IS NOT NULL
          THEN 'Player 2 turn in progress'

          WHEN b.status = 'Pending'
            AND b.starting_elements IS NOT NULL
          THEN 'Awaiting opponent'

          ELSE b.status
        END AS display_status,

        (
          SELECT GROUP_CONCAT(
            u.username
            ORDER BY p.joined_at, p.user_id
            SEPARATOR ' vs '
          )
          FROM battle_player p
          JOIN app_user u ON u.user_id = p.user_id
          WHERE p.battle_id = b.battle_id
        ) AS players

     FROM battle_player bp
     JOIN battle b ON b.battle_id = bp.battle_id
     WHERE bp.user_id = ?
     ORDER BY b.battle_id DESC
     LIMIT 8`,
    [user.user_id]
  );

  // attempts + success rate come from the MongoDB activity log
  let attempts = null;
  const db = await getMongoDb();
  if (db) {
    const agg = await db.collection('game_activity').aggregate([
      { $match: { user_id: user.user_id, event_type: 'combination_attempt' } },
      { $group: { _id: null, total: { $sum: 1 }, ok: { $sum: { $cond: ['$success', 1, 0] } } } }]).toArray();
    attempts = agg[0] ?? { total: 0, ok: 0 };
  }

  const Stat = ({ label, value }) => <div className="stat"><b>{value}</b><span className="muted small">{label}</span></div>;
  return (
    <>
      <h1>{user.username} <span className="muted small">{user.role_name}</span></h1>
      <div className="card">
        <div className="row"><b>Level {user.level}</b><span className="muted small right">{user.xp} / {lp.hi} XP</span></div>
        <div className="bar" style={{ marginTop: '.5rem' }}><i style={{ width: lp.pct + '%' }} /></div>
      </div>
      <div className="grid g3" style={{ marginBottom: '1rem' }}>
        <Stat label="Discoveries" value={s.discoveries} />
        <Stat label="World firsts" value={s.first_discoveries} />
        <Stat label="Achievements" value={s.achievements} />
        <Stat label="Collection" value={`${s.collection_pct}%`} />
        <Stat label="Battle record" value={`${s.total_wins}W – ${s.total_losses}L`} />
        <Stat label="Combination attempts (MongoDB)" value={attempts ? `${attempts.total} · ${attempts.total ? Math.round((100 * attempts.ok) / attempts.total) : 0}% success` : 'MongoDB offline'} />
      </div>
      <div className="grid g2">
        <div className="card"><h2>Recent discoveries</h2>
          {!recent.length && <div className="muted small">Nothing yet — <Link href="/play">start combining</Link>.</div>}
          {recent.map((r, i) => <div key={i} className="small" style={{ padding: '.25rem 0' }}>{r.icon_url} <b>{r.name}</b> <span className="muted">({r.a_name} + {r.b_name}) +{r.xp_earned} XP {r.is_first_discovery ? '🚩' : ''}</span></div>)}
        </div>
        <div className="card"><h2>Battle history</h2>
          {!battles.length && <div className="muted small">No battles yet — <Link href="/battles">find a duel</Link>.</div>}
          
          {battles.map((b) => {
            const completed = b.status === 'Completed';

            const outcome = !completed
              ? null
              : b.winner_id == null
                ? 'Draw'
                : b.winner_id === user.user_id
                  ? 'Won'
                  : 'Lost';

            return (
              <div
                key={b.battle_id}
                className="small"
                style={{ padding: '.35rem 0' }}
              >
                <Link href={`/battles/${b.battle_id}`}>
                  <b>{b.name}</b>
                </Link>

                <div className="muted">
                  {b.players}
                </div>

                <span className="pill">
                  {b.display_status}
                </span>

                {' '}

                <span className="muted">
                  {b.score} points
                </span>

                {outcome && (
                  <b
                    style={{
                      marginLeft: '.5rem',
                      color:
                        outcome === 'Won'
                          ? 'var(--good)'
                          : outcome === 'Lost'
                            ? 'var(--bad)'
                            : 'var(--muted)'
                    }}
                  >
                    {outcome}
                    {b.end_reason === 'Forfeit'
                      ? outcome === 'Won'
                      ? ' (Opponent forfeited)'
                      : ' (You forfeited)'
                      : ''}
                  </b>
                )}
              </div>
            );
          })}

        </div>
      </div>
    </>
  );
}
