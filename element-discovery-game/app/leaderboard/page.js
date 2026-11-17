import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import Icon from '@/components/Icon';

export const dynamic = 'force-dynamic';

// Every tab is one SELECT over a MySQL VIEW -> rankings are always computed on read.
const TABS = {
  xp:         { label: 'Global XP',      sql: 'SELECT xp_rank AS rnk, username, level, xp AS score, elements_owned AS extra FROM leaderboard_xp_view ORDER BY xp_rank, username LIMIT 25', unit: 'XP', extra: 'Elements' },
  weekly:     { label: 'This week',      sql: 'SELECT weekly_rank AS rnk, username, weekly_discoveries AS extra, weekly_xp AS score FROM leaderboard_weekly_view ORDER BY weekly_rank, username LIMIT 25', unit: 'XP (7 days)', extra: 'Discoveries' },
  discoveries:{ label: 'Most discoveries', sql: 'SELECT disc_rank AS rnk, username, discoveries AS score FROM leaderboard_discoveries_view ORDER BY disc_rank, username LIMIT 25', unit: 'Discoveries' },
  first:      { label: 'World firsts',   sql: 'SELECT first_rank AS rnk, username, first_discoveries AS score FROM leaderboard_first_view ORDER BY first_rank, username LIMIT 25', unit: 'First discoveries' },
  battles:    { label: 'Battle wins',    sql: 'SELECT RANK() OVER (ORDER BY total_wins DESC) AS rnk, username, total_wins AS score, total_losses AS extra FROM app_user ORDER BY total_wins DESC, username LIMIT 25', unit: 'Wins', extra: 'Losses' },
};

export default async function Leaderboard({ searchParams }) {
  const me = await requireUser();
  const tab = TABS[searchParams.tab] ? searchParams.tab : 'xp';
  const t = TABS[tab];
  const rows = await query(t.sql);
  const feed = await query('SELECT * FROM recent_first_discoveries_view LIMIT 8');
  return (
    <>
      <h1>Leaderboard</h1>
      <div className="tabs">{Object.entries(TABS).map(([k, v]) => <Link key={k} href={`/leaderboard?tab=${k}`} className={k === tab ? 'on' : ''}>{v.label}</Link>)}</div>
      <div className="grid g2" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <div className="card">
          <table>
            <thead><tr><th>#</th><th>Player</th>{rows[0]?.level != null && <th>Level</th>}<th>{t.unit}</th>{t.extra && <th>{t.extra}</th>}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.username} className={r.username === me.username ? 'me' : ''}>
                <td>{r.rnk}</td><td>{r.username}</td>{r.level != null && <td>{r.level}</td>}<td><b>{r.score}</b></td>{t.extra && <td>{r.extra}</td>}
              </tr>))}</tbody>
          </table>
        </div>
        <div className="card">
          <h2>🚩 World-first feed</h2>
          {!feed.length && <div className="muted small">No world firsts yet — go be the first!</div>}
          {feed.map((f) => (
            <div key={f.discovery_id} className="small" style={{ padding: '.3rem 0' }}>
              <Icon src={f.icon_url} size="1rem" /> <b>{f.element_name}</b> <span className="muted">by {f.username} · {f.discovered_at.slice(0, 16)}</span>
            </div>))}
        </div>
      </div>
    </>
  );
}
