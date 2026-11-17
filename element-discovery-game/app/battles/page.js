import { requireUser } from '@/lib/auth';
import Lobby from './Lobby';

export const dynamic = 'force-dynamic';

export default async function BattlesPage() {
  const user = await requireUser();
  return <Lobby me={user.username} />;
}
