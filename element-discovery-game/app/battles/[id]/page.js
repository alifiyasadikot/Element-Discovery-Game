
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { one } from '@/lib/db';
import Room from './Room';

export const dynamic = 'force-dynamic';

export default async function BattlePage({ params }) {
  const user = await requireUser();
  const id = Number(params.id);

  if (!Number.isInteger(id) || id < 1) {
    notFound();
  }

  const membership = await one(
    `SELECT 1 AS ok
     FROM battle_player
     WHERE battle_id = ?
       AND user_id = ?`,
    [id, user.user_id]
  );

  if (!membership) {
    notFound();
  }

  return (
    <Room
      battleId={id}
      me={user.user_id}
    />
  );
}
