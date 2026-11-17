import Link from 'next/link';
import { getUser } from '@/lib/auth';
import LogoutButton from './LogoutButton';

export default async function Nav() {
  const user = await getUser();
  return (
    <nav className="top">
      <Link href="/" className="brand">⚗️ Element Discovery</Link>
      {user ? (
        <>
          <Link href="/play">Play</Link>
          <Link href="/collection">Collection</Link>
          <Link href="/battles">Battles</Link>
          <Link href="/challenges">Challenges</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          {['Admin', 'Moderator'].includes(user.role_name) && <Link href="/admin">Admin</Link>}
          <span className="right row">
            <Link href="/profile">{user.username} · Lv {user.level} · {user.xp} XP</Link>
            <LogoutButton />
          </span>
        </>
      ) : (
        <span className="right row">
          <Link href="/login">Sign in</Link>
          <Link href="/register" className="btn small">Create account</Link>
        </span>
      )}
    </nav>
  );
}
