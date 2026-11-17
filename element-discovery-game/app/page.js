import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { query } from '@/lib/db';
import Icon from '@/components/Icon';

export default async function Home() {
  if (await getUser()) redirect('/play');
  const feed = await query('SELECT * FROM recent_first_discoveries_view LIMIT 6');
  return (
    <>
      <section className="hero">
        <h1>Combine. Discover. Battle.</h1>
        <p className="muted">Start with Fire, Water, Earth and Air. Mix them to find 40+ more elements, climb the ranks, and duel other players in timed fusion battles.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: '1.2rem' }}>
          <Link href="/register" className="btn">Start playing</Link>
          <Link href="/login" className="btn ghost">Sign in</Link>
        </div>
      </section>
      {feed.length > 0 && (
        <div className="card">
          <h2>Latest world-first discoveries</h2>
          {feed.map((f) => (
            <div key={f.discovery_id} className="row small" style={{ padding: '.25rem 0' }}>
              <Icon src={f.icon_url} /> <b>{f.element_name}</b> <span className="muted">first found by {f.username}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
