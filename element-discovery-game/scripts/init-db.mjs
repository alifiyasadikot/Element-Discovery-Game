// Creates the MySQL database, runs schema + triggers/procedures/views + seed data,
// then adds demo accounts.   WARNING: drops and recreates all game tables.
//   npm run db:init            (with demo players)
//   npm run db:init -- --no-demo
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { ROOT } from './env.mjs';

const DB = process.env.MYSQL_DATABASE || 'element_game';
const noDemo = process.argv.includes('--no-demo');

/** split a .sql file into statements, honouring the mysql-client DELIMITER command */
function splitSql(text) {
  const out = [];
  let delim = ';', buf = '';
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) { delim = m[1]; continue; }
    if (!buf.trim() && /^\s*(--.*)?$/.test(line)) continue;
    buf += line + '\n';
    if (buf.trimEnd().endsWith(delim)) {
      const stmt = buf.trimEnd().slice(0, -delim.length).trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  charset: 'utf8mb4',
});

// Safety check: initialization is permitted only for a new
// database or an existing database with no game tables.
const [existingTables] = await conn.query(
  `SELECT TABLE_NAME
   FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = ?
     AND TABLE_TYPE = 'BASE TABLE'
   LIMIT 1`,
  [DB]
);

if (existingTables.length > 0) {
  await conn.end();

  throw new Error(
    `Refusing to initialize "${DB}" because it already ` +
    `contains tables. This script is for fresh databases only. ` +
    `Existing player and battle data have not been modified.`
  );
}

await conn.query(
  `CREATE DATABASE IF NOT EXISTS \`${DB}\` ` +
  `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
);

await conn.query(`USE \`${DB}\``);

for (const file of ['01_schema.sql', '02_programmability.sql', '03_seed.sql']) {
  const stmts = splitSql(fs.readFileSync(path.join(ROOT, 'database', file), 'utf8'));
  for (const s of stmts) {
    try { await conn.query(s); }
    catch (e) { console.error(`\n✗ ${file}: ${e.message}\n--- statement ---\n${s.slice(0, 300)}\n`); process.exit(1); }
  }
  console.log(`✓ ${file} (${stmts.length} statements)`);
}

if (!noDemo) {
  const role = async (name) => (await conn.query('SELECT role_id FROM role WHERE role_name = ?', [name]))[0][0].role_id;
  const mk = async (username, email, pw, roleName) => {
    const [r] = await conn.query('INSERT INTO app_user (username, email, password_hash, role_id) VALUES (?,?,?,?)',
      [username, email, await bcrypt.hash(pw, 10), await role(roleName)]);
    return r.insertId;
  };
  const admin = await mk('admin', 'admin@elements.dev', 'admin123', 'Admin');
  const ava = await mk('ava', 'ava@example.com', 'password123', 'Player');
  const ben = await mk('ben', 'ben@example.com', 'password123', 'Player');
  const cleo = await mk('cleo', 'cleo@example.com', 'password123', 'Player');

  const [els] = await conn.query('SELECT element_id, name FROM element');
  const id = Object.fromEntries(els.map((e) => [e.name, e.element_id]));
  const play = async (uid, pairs) => { for (const [a, b] of pairs) await conn.query('CALL combine_elements(?,?,?)', [uid, id[a], id[b]]); };

  await play(ava, [['Fire','Water'],['Earth','Water'],['Fire','Earth'],['Air','Earth'],['Air','Fire'],['Steam','Air'],['Cloud','Water'],
    ['Rain','Earth'],['Plant','Earth'],['Lava','Water'],['Stone','Fire'],['Mud','Energy'],['Life','Earth'],['Metal','Energy']]);
  await play(ben,  [['Fire','Water'],['Earth','Water'],['Fire','Earth'],['Air','Fire'],['Air','Earth'],['Water','Water']]);
  await play(cleo, [['Fire','Water'],['Fire','Fire']]);

  // Asynchronous multiplayer battles are created by players.
  // Asynchronous multiplayer battles are created by players.
  // The host begins immediately with four randomly selected
  // playable elements, and the challenger joins only after
  // the host's timed attempt has finished.
  //
  // Do not manufacture a completed battle during initialization.
  // Real battle history is created through the application.

  console.log('✓ demo accounts: admin@elements.dev / admin123 (Admin), ava|ben|cleo @example.com / password123');
}

await conn.end();
console.log('Done.');
