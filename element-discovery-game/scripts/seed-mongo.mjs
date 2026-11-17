// Creates the MongoDB collections + indexes and fills element_metadata (lore, aliases, tags)
// from the MySQL catalogue.   npm run db:mongo
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import './env.mjs';

const ALIASES = { Steam: ['Vapor'], Human: ['Person', 'Mortal'], AI: ['Artificial Intelligence'], Fire: ['Flame'], Water: ['H2O'],
  Dragon: ['Wyrm'], Phoenix: ['Firebird'], Computer: ['PC'], Gold: ['Au'], Time: ['Chronos'] };
const LORE = { Fire: 'Humanity\'s oldest tool, and its oldest fear.', Phoenix: 'Legends say it burns every five hundred years and begins again.',
  Dragon: 'Hoards gold, guards mountains, and never forgives a thief.', 'Philosopher\'s Stone': 'The alchemist\'s endgame: it turns lead to gold and mortals to legends.',
  AI: 'The newest mind in the world — made, not born.', Time: 'Sand in the sun: everything it touches ages.' };

const my = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'element_game', charset: 'utf8mb4' });
const [elements] = await my.query('SELECT element_id, name, description FROM element');
const [tags] = await my.query('SELECT element_id, tag FROM element_tag');
const [recipes] = await my.query(
  `SELECT r.element1_id, r.element2_id, a.name AS a, b.name AS b, o.element_id AS res_id
     FROM recipe r JOIN element a ON a.element_id = r.element1_id JOIN element b ON b.element_id = r.element2_id JOIN element o ON o.element_id = r.result_element_id`);
await my.end();

const client = await new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 4000 }).connect();
const db = client.db(process.env.MONGODB_DB || 'element_game');

// ---- indexes ----
const act = db.collection('game_activity');
await act.createIndex({ user_id: 1, timestamp: -1 });
await act.createIndex({ event_type: 1, timestamp: -1 });
await act.createIndex({ timestamp: -1 });
const sess = db.collection('game_sessions');
await sess.createIndex({ battle_id: 1, user_id: 1 }, { unique: true });
await sess.createIndex({ last_seen: 1 }, { expireAfterSeconds: 3600 }); // stale battle sessions vanish after 1h
const meta = db.collection('element_metadata');
await meta.createIndex({ element_id: 1 }, { unique: true });
await meta.createIndex({ name: 'text', lore: 'text', aliases: 'text', tags: 'text' }); // lore / alias search

// ---- element_metadata ----
let n = 0;
for (const e of elements) {
  const made = recipes.find((r) => r.res_id === e.element_id);
  const used = recipes.filter((r) => r.element1_id === e.element_id || r.element2_id === e.element_id).length;
  const doc = {
    element_id: e.element_id, name: e.name,
    lore: LORE[e.name] ?? (made ? `Formed when ${made.a} meets ${made.b}.` : e.description),
    aliases: ALIASES[e.name] ?? [],
    tags: tags.filter((t) => t.element_id === e.element_id).map((t) => t.tag),
    fun_facts: [used ? `Used in ${used} recipe${used === 1 ? '' : 's'}.` : 'Not used in any recipe — a true end-point.'],
    related_concepts: [],
  };
  await meta.updateOne({ element_id: e.element_id }, { $set: doc }, { upsert: true });
  n++;
}
console.log(`✓ MongoDB ready: ${n} element_metadata docs, indexes on game_activity / game_sessions / element_metadata`);
await client.close();
