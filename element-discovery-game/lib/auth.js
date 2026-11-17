import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one } from './db';

const COOKIE = 'edg_session';
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');

export async function setSession(userId) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret());
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
}

export function clearSession() {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** current user (fresh from MySQL) or null */
export async function getUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return await one(
      `SELECT u.user_id, u.username, u.email, u.avatar_url, u.xp, u.level, u.total_wins, u.total_losses, r.role_name
         FROM app_user u JOIN role r ON r.role_id = u.role_id WHERE u.user_id = ?`,
      [payload.uid]
    );
  } catch {
    return null;
  }
}

/** for pages: redirect to /login if signed out, / if the role is not allowed */
export async function requireUser(roles) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role_name)) redirect('/play');
  return user;
}

/** XP needed to *reach* a level (level = 1 + floor(sqrt(xp/100))) */
export const xpForLevel = (level) => 100 * (level - 1) ** 2;
export function levelProgress(user) {
  const lo = xpForLevel(user.level), hi = xpForLevel(user.level + 1);
  return { lo, hi, pct: Math.min(100, Math.round(((user.xp - lo) / (hi - lo)) * 100)) };
}
