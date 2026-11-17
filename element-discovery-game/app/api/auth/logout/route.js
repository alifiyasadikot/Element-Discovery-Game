import { clearSession } from '@/lib/auth';
import { json } from '@/lib/api';

export async function POST() {
  clearSession();
  return json({ ok: true });
}
