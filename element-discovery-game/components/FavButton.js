'use client';
import { useState } from 'react';

export default function FavButton({ elementId, initial }) {
  const [fav, setFav] = useState(initial);
  return (
    <button className="ghost small" title="Toggle favourite" onClick={async (ev) => {
      ev.preventDefault();
      const r = await fetch('/api/favorite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ elementId }) });
      if (r.ok) setFav((await r.json()).favorite);
    }}>{fav ? '★' : '☆'}</button>
  );
}
