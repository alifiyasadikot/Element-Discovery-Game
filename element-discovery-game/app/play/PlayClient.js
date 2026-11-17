'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CombineBoard from '@/components/CombineBoard';
import Icon from '@/components/Icon';
import { RARITY_COLOR } from '@/lib/ui';

export default function PlayClient({ initialElements, user, total }) {
  const router = useRouter();
  const [elements, setElements] = useState(initialElements);
  const [me, setMe] = useState({ xp: user.xp, level: user.level });
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const lo = 100 * (me.level - 1) ** 2, hi = 100 * me.level ** 2;
  const pct = Math.min(100, Math.round(((me.xp - lo) / (hi - lo)) * 100));

  async function onCombine(a, b) {
    setBusy(true);
    const res = await fetch('/api/combine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ e1: a.element_id, e2: b.element_id }) });
    const d = await res.json();
    setBusy(false);
    const entries = [];
    if (!res.ok) entries.push({ kind: 'bad', text: d.error || 'Something went wrong' });
    else if (d.outcome === 'NO_RECIPE') entries.push({ kind: 'bad', text: `${a.name} + ${b.name} → nothing happens.` });
    else if (d.outcome === 'ALREADY_OWNED') entries.push({ kind: 'warn', text: `${a.name} + ${b.name} → ${d.element.name} (you already have it, no XP).`, icon: d.element.icon_url });
    else {
      setElements((els) => [...els, { ...d.element, favorite: false }]);
      setMe(d.user);
      entries.push({
        kind: 'good', icon: d.element.icon_url,
        text: `${a.name} + ${b.name} → ${d.element.name}! +${d.xp_earned} XP` + (d.is_first_discovery ? ' 🚩 WORLD FIRST!' : ''),
      });
      if (d.leveled_up) entries.push({ kind: 'warn', text: `⬆️ Level up! You are now level ${d.user.level}.` });
      d.new_achievements.forEach((n) => entries.push({ kind: 'warn', text: `🏅 Achievement unlocked: ${n}` }));
      d.completed_challenges.forEach((n) => entries.push({ kind: 'warn', text: `✅ Challenge completed: ${n}` }));
      router.refresh(); // refresh the nav's XP / level
    }
    setLog((l) => [...entries.reverse(), ...l].slice(0, 25));
  }

  return (
    <div className="grid g2" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
      <div className="card">
        <h2>Combine elements</h2>
        <CombineBoard elements={elements} onCombine={onCombine} busy={busy} hint="Pick two elements — order doesn't matter." />
      </div>
      <div>
        <div className="card">
          <div className="row"><b>Level {me.level}</b><span className="muted small right">{me.xp} / {hi} XP</span></div>
          <div className="bar" style={{ margin: '.5rem 0' }}><i style={{ width: pct + '%' }} /></div>
          <div className="muted small">{elements.length} / {total} elements discovered · <Link href="/collection">view collection</Link></div>
        </div>
        <div className="card">
          <h2>Activity</h2>
          {!log.length && <div className="muted small">Your results will show up here.</div>}
          {log.map((l, i) => (
            <div key={i} className={`toast ${l.kind}`}>{l.icon && <><Icon src={l.icon} size="1.1rem" />{' '}</>}{l.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
