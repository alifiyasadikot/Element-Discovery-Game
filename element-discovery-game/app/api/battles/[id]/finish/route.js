import { apiUser, json } from '@/lib/api';

// Manual completion is disabled.
// The database automatically expires each player's turn.
export async function POST() {
  const [, err] = await apiUser();
  if (err) return err;

  return json({
    error: 'Manual battle finishing is disabled. Wait for the timer.'
  }, 410);
}