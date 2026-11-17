
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CombineBoard from '@/components/CombineBoard';
import Icon from '@/components/Icon';

function formatSeconds(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function Room({ battleId, me }) {
  const router = useRouter();

  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [left, setLeft] = useState(null);

  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  // The server supplies the authoritative timer value.
  // This reference is only for displaying a smooth countdown.
  const clockRef = useRef({
    remaining: null,
    syncedAt: 0
  });

  const refreshedAfterCompletion = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/battles/${battleId}/state`,
        { cache: 'no-store' }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Failed to load battle');
        return;
      }

      setError('');
      setState(data);

      const remaining =
        data.battle.remaining === null ||
        data.battle.remaining === undefined
          ? null
          : Math.max(0, Number(data.battle.remaining));

      clockRef.current = {
        remaining,
        syncedAt: Date.now()
      };

      setLeft(remaining);

      // Refresh server-rendered navigation and XP after completion.
      if (
        data.battle.status === 'Completed' &&
        !refreshedAfterCompletion.current
      ) {
        refreshedAfterCompletion.current = true;
        router.refresh();
      }

    } catch (e) {
      console.error('Battle state error:', e);
      setError('Cannot connect to the battle server.');
    }
  }, [battleId, router]);

  // Server polling also advances expired turns.
  useEffect(() => {
    load();

    const poll = setInterval(load, 2000);

    return () => clearInterval(poll);
  }, [load]);

  // Smooth visual timer between server updates.
  useEffect(() => {
    const timer = setInterval(() => {
      const clock = clockRef.current;

      if (clock.remaining === null) {
        setLeft(null);
        return;
      }

      const elapsed = Math.floor(
        (Date.now() - clock.syncedAt) / 1000
      );

      setLeft(Math.max(0, clock.remaining - elapsed));
    }, 250);

    return () => clearInterval(timer);
  }, []);

  async function onCombine(a, b) {
    if (busy) return;

    setBusy(true);
    setError('');
    setFlash(null);

    try {
      const response = await fetch(
        `/api/battles/${battleId}/combine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            e1: a.element_id,
            e2: b.element_id
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Combination failed');
        return;
      }

      if (data.outcome === 'SUCCESS') {
        setFlash({
          kind: 'good',
          text:
            `${a.name} + ${b.name} = ` +
            `${data.result?.name || 'New element'}! ` +
            `+${data.points} points`
        });

      } else if (data.outcome === 'DUPLICATE') {
        setFlash({
          kind: 'warn',
          text:
            `You already completed this recipe. ` +
            `No additional points.`
        });

      } else if (data.outcome === 'FAIL') {
        setFlash({
          kind: 'bad',
          text:
            `${a.name} + ${b.name} does not produce ` +
            `a valid combination. 0 points.`
        });

      } else if (data.outcome === 'TIME_UP') {
        setFlash({
          kind: 'warn',
          text: 'Your time is up! Your score has been saved.'
        });
      }

      // Reload the player's score and newly unlocked elements.
      await load();

    } catch (e) {
      console.error('Combine error:', e);
      setError('Cannot submit the combination.');

    } finally {
      setBusy(false);
    }
  }

  async function act(path) {
    if (busy) return;

    const message =
      path === 'cancel'
        ? 'Cancel this challenge? It will end without a win or loss. This cannot be undone.'
        : 'Leave and forfeit this battle? Your opponent will automatically win. This cannot be undone.';

    if (!window.confirm(message)) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      const response = await fetch(
        `/api/battles/${battleId}/${path}`,
        { method: 'POST' }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Action failed');
        await load();
        return;
      }

      if (path === 'cancel') {
        router.push('/battles');
        return;
      }

      // A confirmed forfeit finalizes the match.
      await load();

    } catch (e) {
      console.error('Battle action error:', e);
      setError('Cannot complete this action.');

    } finally {
      setBusy(false);
    }
  }

  async function viewDetails() {
    if (detailsLoading) return;

    if (details) {
      setDetails(null);
      setDetailsError('');
      return;
    }

    setDetailsLoading(true);
    setDetailsError('');

    try {
      const response = await fetch(
        `/api/battles/${battleId}/details`,
        { cache: 'no-store' }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDetailsError(
          data.error || 'Cannot load match details'
        );
        return;
      }

      setDetails(data);

    } catch (e) {
      console.error('Match details error:', e);
      setDetailsError('Cannot load match details.');

    } finally {
      setDetailsLoading(false);
    }
  }

  if (error && !state) {
    return (
      <div className="card">
        <div className="err">{error}</div>
        <Link href="/battles">Back to battles</Link>
      </div>
    );
  }

  if (!state) {
    return <div className="muted">Loading battle...</div>;
  }

  const { battle, players } = state;

  const host = players[0] || null;
  const challenger = players[1] || null;

  const isHost = host?.user_id === me;
  const isChallenger = challenger?.user_id === me;

  const myPlayer = players.find((p) => p.user_id === me);

  const isMyTurn =
    battle.status === 'Active' &&
    battle.active_player_id === me;

  const canPlay =
    isMyTurn &&
    left !== null &&
    left > 0;

  const canCancel =
    isHost &&
    !challenger &&
    (
      battle.status === 'Active' ||
      battle.status === 'Pending'
    );

  const canForfeit =
    isChallenger &&
    canPlay;

  const completed = battle.status === 'Completed';
  const cancelled = battle.status === 'Cancelled';

  const unlockedElements = Array.isArray(
    state.unlocked_elements
  ) ? state.unlocked_elements : [];

  const statusLabels = {
    HOST_TURN: 'Player 1 Turn',
    AWAITING_OPPONENT: 'Awaiting Challenger',
    CHALLENGER_TURN: 'Player 2 Turn',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    WAITING: 'Waiting'
  };

  return (
    <>
      <p>
        <Link href="/battles">
          ← Back to Battles
        </Link>
      </p>

      <div className="card">
        <div className="row">
          <div>
            <h1 style={{ margin: 0 }}>
              {battle.name}
            </h1>

            <span className="muted small">
              {statusLabels[battle.phase] || battle.status}
              {' · '}
              {battle.time_limit} second limit per player
            </span>
          </div>

          {isMyTurn && (
            <div className="right center">
              <div className="muted small">
                Your Time Remaining
              </div>

              <div
                className="timer"
                style={{
                  color:
                    left !== null && left <= 15
                      ? 'var(--bad)'
                      : 'inherit'
                }}
              >
                {formatSeconds(left)}
              </div>
            </div>
          )}
        </div>

        <div
          className="grid g3"
          style={{ marginTop: '1rem' }}
        >
          {players.map((p) => (
            <div
              key={p.user_id}
              className={
                `stat ${p.user_id === me ? 'me' : ''}`
              }
            >
              <span className="muted small">
                {p.username}
                {p.user_id === me ? ' (You)' : ''}
                {completed && battle.winner_id === p.user_id
                  ? ' 🏆'
                  : ''}
              </span>

              <b>
                {p.score === null
                  ? 'Hidden'
                  : `${p.score} pts`}
              </b>

              <span className="muted small">
                {p.combinations_completed === null
                  ? 'Result hidden until completion'
                  : `${p.combinations_completed} successful recipes`}
              </span>
            </div>
          ))}

          {isChallenger && !completed && !cancelled && (
            <div className="stat">
              <span className="muted small">
                Score to Beat
              </span>

              <b>
                {battle.target_score ?? 0} pts
              </b>

              <span className="muted small">
                Higher score wins. Equal scores use
                completion time.
              </span>
            </div>
          )}
        </div>

        {isMyTurn && left === 0 && (
          <div
            className="toast warn"
            style={{ marginTop: '1rem' }}
          >
            Your timer has expired.
            The server is updating the battle status.
          </div>
        )}

        {battle.phase === 'AWAITING_OPPONENT' && (
          <div
            className="toast good"
            style={{ marginTop: '1rem' }}
          >
            <b>Your turn is complete!</b>

            <p>
              Your final target score is{' '}
              <b>{myPlayer?.score ?? 0} points</b>.
            </p>

            <p className="muted small">
              Your challenge is now available for
              another player to accept. Your score
              is saved, and your timer will not restart.
            </p>
          </div>
        )}

        {battle.phase === 'CHALLENGER_TURN' && isHost && (
          <div
            className="toast warn"
            style={{ marginTop: '1rem' }}
          >
            Player 2 has accepted your challenge
            and is playing their own timed turn.

            <p className="muted small">
              Their score and combinations will remain
              hidden until the battle is completed.
            </p>
          </div>
        )}

        {cancelled && (
          <div
            className="toast warn"
            style={{ marginTop: '1rem' }}
          >
            This challenge was cancelled.
            No player receives a win or loss.
          </div>
        )}

        {completed && (
          <div
            className={
              `toast ${
                battle.winner_id === me
                  ? 'good'
                  : battle.winner_id
                    ? 'bad'
                    : 'warn'
              }`
            }
            style={{ marginTop: '1rem' }}
          >
            {battle.winner_id ? (
              <>
                <b>Winner: {battle.winner_name}</b>

                <p>
                  {battle.winner_id === me
                    ? 'You won! You receive 100 battle XP.'
                    : 'You receive 25 battle XP for participating.'}
                </p>

                {battle.end_reason === 'Forfeit' && (
                  <p className="muted small">
                    Player 2 forfeited the challenge.
                  </p>
                )}
              </>
            ) : (
              <>
                <b>Match Drawn!</b>

                <p>
                  Both players receive 25 battle XP.
                </p>
              </>
            )}
          </div>
        )}

        <div
          className="row"
          style={{ marginTop: '1rem' }}
        >
          {canCancel && (
            <button
              className="danger small"
              disabled={busy}
              onClick={() => act('cancel')}
            >
              Cancel Challenge
            </button>
          )}

          {canForfeit && (
            <button
              className="danger small"
              disabled={busy}
              onClick={() => act('forfeit')}
            >
              Leave and Forfeit
            </button>
          )}

          {completed && (
            <button
              disabled={detailsLoading}
              onClick={viewDetails}
            >
              {detailsLoading
                ? 'Loading Details...'
                : details
                ? 'Hide Match Details'
                : 'View Match Details'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}

      {flash && (
        <div
          className={`toast ${flash.kind}`}
          role="status"
        >
          {flash.text}
        </div>
      )}

      {isMyTurn && (
        <div className="card">
          <h2>Combine Elements</h2>

          <p className="muted small">
            You can use only the four starting elements
            and new elements unlocked through your
            successful combinations in this battle.
          </p>

          <div className="stat" style={{ marginBottom: '1rem' }}>
            <span className="muted small">
              Your Battle Collection
            </span>

            <b>{unlockedElements.length} elements</b>

            <span className="muted small">
              This collection is separate from
              your single-player discoveries.
            </span>
          </div>

          <CombineBoard
            elements={unlockedElements}
            onCombine={onCombine}
            busy={busy}
            disabled={!canPlay}
            hint={
              canPlay
                ? 'New recipes earn points. Duplicates earn zero.'
                : 'Your timer has ended.'
            }
          />
        </div>
      )}

      {completed && (
        <div className="card">
          <h2>Final Match Results</h2>

          <div className="grid g2">
            {players.map((p) => (
              <div key={p.user_id} className="stat">
                <span className="muted small">
                  {p.username}
                </span>

                <b>{p.score} points</b>

                <div className="muted small">
                  Successful recipes: {p.combinations_completed}
                </div>

                <div className="muted small">
                  Completion time:{' '}
                  {p.completion_time === null
                    ? 'No successful combinations'
                    : `${p.completion_time} seconds`}
                </div>
              </div>
            ))}
          </div>

          <p
            className="muted small"
            style={{ marginTop: '1rem' }}
          >
            Completion time is measured from the start
            of each player's own turn to their last
            scoring combination. It is used only when
            final scores are equal.
          </p>
        </div>
      )}

      {completed && detailsError && (
        <div className="err" role="alert">
          {detailsError}
        </div>
      )}

      {completed && details && (
        <div className="card">
          <h2>Match Details</h2>

          <p className="muted small">
            Both players' successful, failed,
            and duplicate attempts are displayed
            now that the match has finished.
          </p>

          {!details.actions.length && (
            <div className="muted small">
              No combinations were attempted.
            </div>
          )}

          {details.actions.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Player</th>
                    <th>Combination</th>
                    <th>Result</th>
                    <th>Outcome</th>
                    <th>Points</th>
                  </tr>
                </thead>

                <tbody>
                  {details.actions.map((a) => (
                    <tr key={a.action_seq}>
                      <td>{a.action_seq}</td>

                      <td>{a.username}</td>

                      <td>
                        {a.e1} + {a.e2}
                      </td>

                      <td>
                        {a.result ? (
                          <>
                            <Icon
                              src={a.result_icon}
                              size="1rem"
                            />
                            {' '}
                            {a.result}
                          </>
                        ) : (
                          <span className="muted">
                            No recipe
                          </span>
                        )}
                      </td>

                      <td>
                        <span
                          style={{
                            color:
                              a.outcome === 'SUCCESS'
                                ? 'var(--good)'
                                : a.outcome === 'DUPLICATE'
                                  ? 'var(--warn)'
                                  : 'var(--bad)'
                          }}
                        >
                          {a.outcome}
                        </span>
                      </td>

                      <td>
                        {a.success
                          ? `+${a.points_earned}`
                          : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p
            className="muted small"
            style={{ marginTop: '1rem' }}
          >
            All attempts are stored in MySQL's
            battle_action table.
          </p>
        </div>
      )}
    </>
  );
}
