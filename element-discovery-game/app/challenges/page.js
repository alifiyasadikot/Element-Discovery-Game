import { requireUser } from '@/lib/auth';
import { query, one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Challenges() {
  const user = await requireUser();
  const challenges = await query(
    `SELECT c.*, COALESCE(uc.progress, 0) AS progress, COALESCE(uc.status, 'InProgress') AS status, uc.completed_at
       FROM challenge c LEFT JOIN user_challenge uc ON uc.challenge_id = c.challenge_id AND uc.user_id = ?
      WHERE NOW() BETWEEN c.start_date AND c.end_date ORDER BY c.challenge_type, c.target_value`, [user.user_id]);
  const achievements = await query(
    `SELECT a.*, ua.earned_at FROM achievement a LEFT JOIN user_achievement ua ON ua.achievement_id = a.achievement_id AND ua.user_id = ?
      ORDER BY a.requirement_type, a.requirement_value`, [user.user_id]);
  const s = await one('SELECT discoveries, first_discoveries, total_wins FROM player_statistics_view WHERE user_id = ?', [user.user_id]);
  const rare = (await one(
    `SELECT COUNT(*) AS n FROM user_element ue JOIN element e ON e.element_id = ue.element_id
      WHERE ue.user_id = ? AND e.rarity IN ('Rare','Legendary')`, [user.user_id])).n;
  const current = { DISCOVERY_COUNT: s.discoveries, FIRST_DISCOVERY_COUNT: s.first_discoveries, RARE_COUNT: rare, BATTLE_WINS: s.total_wins };

  return (
    <>
      <h1>Challenges</h1>
      <div className="grid g2">
        {challenges.map((c) => {
          const pct = Math.min(100, Math.round((c.progress / c.target_value) * 100));
          return (
            <div key={c.challenge_id} className="card" style={{ marginBottom: 0 }}>
              <div className="row"><b>{c.title}</b><span className="pill right" style={{ color: c.status === 'Completed' ? 'var(--good)' : 'var(--muted)' }}>{c.status === 'Completed' ? 'Completed' : 'In progress'}</span></div>
              <div className="muted small">{c.description}</div>
              <div className="bar" style={{ margin: '.6rem 0 .3rem' }}><i style={{ width: pct + '%' }} /></div>
              <div className="row small"><span>{Math.min(c.progress, c.target_value)} / {c.target_value}</span><span className="right">+{c.xp_reward} XP</span></div>
            </div>);
        })}
      </div>
      <h1 style={{ marginTop: '2rem' }}>Achievements</h1>
      <div className="grid g3">
        {achievements.map((a) => (
          <div key={a.achievement_id} className="card" style={{ marginBottom: 0, opacity: a.earned_at ? 1 : 0.6 }}>
            <div className="row"><span style={{ fontSize: '1.8rem' }}>{a.icon_url}</span><b>{a.name}</b></div>
            <div className="muted small">{a.description}</div>
            <div className="small" style={{ marginTop: '.4rem' }}>
              {a.earned_at ? <span style={{ color: 'var(--good)' }}>Earned {a.earned_at.slice(0, 10)} · +{a.xp_reward} XP</span>
                : <>{Math.min(current[a.requirement_type], a.requirement_value)} / {a.requirement_value} · +{a.xp_reward} XP</>}
            </div>
          </div>))}
      </div>
    </>
  );
}
