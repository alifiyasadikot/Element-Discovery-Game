'use client';
import { useMemo, useState } from 'react';
import Icon from './Icon';
import { RARITY_COLOR } from '@/lib/ui';

// Shared by the solo game and the battle room: pick two elements, press Combine.
// `onCombine(a, b)` is supplied by the page and does the actual API call.
export default function CombineBoard({ elements, onCombine, busy, disabled, hint }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return elements.filter((e) => (!s || e.name.toLowerCase().includes(s)) && (!onlyFav || e.favorite));
  }, [elements, q, onlyFav]);

  function pick(e) {
    if (!a) setA(e);
    else if (!b) setB(e);
    else { setA(e); setB(null); }
  }
  async function go() {
    const x = a, y = b;
    setA(null); setB(null);
    await onCombine(x, y);
  }
  const Slot = ({ el, onClear }) => (
    <div className="slot" onClick={onClear} title={el ? 'Click to remove' : 'Pick an element below'}
         style={el ? { borderStyle: 'solid', borderColor: RARITY_COLOR[el.rarity] } : null}>
      {el ? (<><Icon src={el.icon_url} size="2.4rem" /><b>{el.name}</b></>) : <span className="muted small">empty</span>}
    </div>
  );

  return (
    <div>
      <div className="row" style={{ alignItems: 'stretch', flexWrap: 'nowrap' }}>
        <Slot el={a} onClear={() => setA(null)} />
        <div className="plus row" style={{ justifyContent: 'center' }}>+</div>
        <Slot el={b} onClear={() => setB(null)} />
      </div>
      <div className="row" style={{ margin: '.8rem 0' }}>
        <button disabled={!a || !b || busy || disabled} onClick={go}>{busy ? 'Combining…' : 'Combine'}</button>
        {hint && <span className="muted small">{hint}</span>}
      </div>
      <div className="row" style={{ marginBottom: '.5rem' }}>
        <input placeholder={`Search ${elements.length} elements…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        {elements.some((e) => 'favorite' in e) && (
          <label className="row small" style={{ margin: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> ★ only
          </label>
        )}
      </div>
      <div className="chips">
        {shown.map((e) => (
          <button key={e.element_id} className={`chip ${a?.element_id === e.element_id || b?.element_id === e.element_id ? 'sel' : ''}`}
                  style={{ borderColor: RARITY_COLOR[e.rarity] + '88' }} onClick={() => pick(e)}>
            <span className="ic"><Icon src={e.icon_url} /></span><span>{e.favorite ? '★ ' : ''}{e.name}</span>
          </button>
        ))}
        {!shown.length && <span className="muted small">No elements match.</span>}
      </div>
    </div>
  );
}
