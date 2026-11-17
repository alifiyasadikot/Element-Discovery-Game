'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Lobby() {
  const router = useRouter();
  const [data, setData] = useState({ open: [], mine: [] });
  const [name, setName] = useState('');
  const [limit, setLimit] = useState(120);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/battles', {
        cache: 'no-store'
      });

      if (!r.ok) return;

      const d = await r.json();

      setData({
        open: Array.isArray(d.open) ? d.open : [],
        mine: Array.isArray(d.mine) ? d.mine : []
      });
    } catch (e) {
      console.error('Failed to load battles:', e);
    }
  }, []);

  useEffect(() => {
    load();

    const timer = setInterval(load, 4000);

    return () => clearInterval(timer);
  }, [load]);

  async function post(url, payload = {}) {
    if (busy) return null;

    setBusy(true);
    setError('');

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        setError(d.error || 'Request failed');
        load();
        return null;
      }

      return d;

    } catch (e) {
      console.error('Battle request failed:', e);
      setError('Cannot connect to the server.');
      return null;

    } finally {
      setBusy(false);
    }
  }


  return (
    <>    
      <h1>Fusion Battles</h1>

      <p className="muted">
        Challenge another player in an asynchronous element
        combination battle!
        Create a challenge and play your timed turn first.
        The system gives both players the same four randomly
        selected starting elements.
        Your opponent can accept after your turn ends and
        gets their own full timer.
      </p>

      <p className="muted">
        Discover new combinations to earn points.
        Each successful recipe scores its XP reward
        plus 5 points per difficulty level.
        Duplicate recipes and failed combinations
        earn zero points.
        Only elements unlocked during your own battle
        attempt can be used.
        The highest score wins!
      </p>
      
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}

      <div className="grid g2">
        
        <div className="card">
          <h2>Create a Challenge</h2>

          <p className="muted small">
            Set a target score for another player to beat.
            Your timer starts immediately after creation.
          </p>

          <label htmlFor="battle-name">
            Challenge Name
          </label>

          <input
            id="battle-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ultimate Element Duel"
          />

          <label htmlFor="battle-limit">
            Time Limit
          </label>

          <select
            id="battle-limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[60, 120, 180, 300].map((s) => (
              <option key={s} value={s}>
                {s / 60} minute{s !== 60 ? 's' : ''}
              </option>
            ))}
          </select>

          <p className="muted small" style={{ marginTop: '.8rem' }}>
            You will receive four random playable elements.
            Successful combinations unlock more elements
            for this battle only.
          </p>

          <div style={{ marginTop: '1rem' }}>
            <button
              disabled={busy || !name.trim()}
              onClick={async () => {
                const d = await post('/api/battles', {
                  name: name.trim(),
                  timeLimit: limit
                });

                if (d?.battle_id) {
                  router.push(`/battles/${d.battle_id}`);
                }
              }}
            >
              {busy ? 'Please wait...' : 'Create & Start Challenge'}
            </button>
          </div>
        </div>

        
        <div className="card">
          <h2>Available Challenges</h2>

          <p className="muted small">
            These players have completed their turns.
            Accept a challenge and try to beat their scores!
          </p>

          {!data.open.length && (
            <div className="muted small">
              No challenges are ready right now.
              New challenges appear after their creators
              finish their timed attempts.
            </div>
          )}

          {data.open.map((b) => (
            <div
              key={b.battle_id}
              className="card"
              style={{
                background: 'var(--panel2)',
                marginTop: '.8rem'
              }}
            >
              <h3>{b.name}</h3>

              <p className="muted small">
                Created by {b.host}
              </p>

              <div
                className="grid g2"
                style={{ marginTop: '.8rem' }}
              >
                <div className="stat">
                  <span className="muted small">
                    Target Score
                  </span>

                  <b>
                    {Number(b.target_score ?? 0).toLocaleString()} pts
                  </b>
                </div>

                <div className="stat">
                  <span className="muted small">
                    Time Limit
                  </span>

                  <b>
                    {b.time_limit / 60} min
                  </b>
                </div>
              </div>

              <p className="muted small">
                You will receive the same four starting
                elements as your opponent after accepting.
                You will have your own full timer.
              </p>

              <button
                disabled={busy}
                style={{ marginTop: '.5rem' }}
                onClick={async () => {
                  const d = await post(
                    `/api/battles/${b.battle_id}/join`
                  );

                  if (d?.ok) {
                    router.push(`/battles/${b.battle_id}`);
                  }
                }}
              >
                {busy ? 'Please wait...' : 'Accept Challenge'}
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="card">
        <h2>Your Battles</h2>

        <p className="muted small">
          Continue an active turn, check whether your
          challenge has been accepted, or review
          completed matches.
        </p>

        {!data.mine.length && (
          <div className="muted small">
            You haven't participated in any battles yet.
          </div>
        )}

        {data.mine.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Players</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {data.mine.map((b) => {
                const statusLabels = {
                  Active: 'Turn in progress',
                  Pending: 'Awaiting opponent',
                  Completed: 'Completed',
                  Cancelled: 'Cancelled'
                };

                return (
                  <tr key={b.battle_id}>
                    <td>
                      <Link href={`/battles/${b.battle_id}`}>
                        {b.name}
                      </Link>
                    </td>

                    <td className="muted">
                      {b.players}
                    </td>

                    <td>
                      <span className="pill">
                        {statusLabels[b.status] || b.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
