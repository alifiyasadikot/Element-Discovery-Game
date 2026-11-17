import { MongoClient } from 'mongodb';

// MongoDB holds the flexible / high-volume data:
//   game_activity    - append-only event log (combination attempts, logins, battle actions)
//   game_sessions    - live battle presence (TTL index expires stale sessions)
//   element_metadata - lore, aliases, tags, fun facts per element
// The game keeps working if MongoDB is down (writes are skipped, reads return null).
const g = globalThis;
let downUntil = 0;

export async function getMongoDb() {
  if (Date.now() < downUntil) return null;
  try {
    g.__edgMongo ??= new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {
      serverSelectionTimeoutMS: 1500,
    }).connect();
    const client = await g.__edgMongo;
    return client.db(process.env.MONGODB_DB || 'element_game');
  } catch (e) {
    g.__edgMongo = undefined;
    downUntil = Date.now() + 15000; // do not retry on every request
    console.warn('[mongo] unavailable:', e.message);
    return null;
  }
}

/** fire-and-forget event log */
export async function logActivity(event) {
  try {
    const db = await getMongoDb();
    if (db) await db.collection('game_activity').insertOne({ ...event, timestamp: new Date() });
  } catch (e) {
    console.warn('[mongo] logActivity failed:', e.message);
  }
}

export async function touchBattleSession({ battleId, userId }) {
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection('game_sessions').updateOne(
      { battle_id: battleId, user_id: userId },
      { $set: { last_seen: new Date() }, $setOnInsert: { started_at: new Date() } },
      { upsert: true }
    );
  } catch {}
}

export async function clearBattleSessions(battleId) {
  const id = Number(battleId);

  if (!Number.isSafeInteger(id) || id < 1) {
    return 0;
  }

  try {
    const db = await getMongoDb();

    if (!db) {
      return 0;
    }

    const result = await db.collection('game_sessions').deleteMany({
      battle_id: id
    });

    return result.deletedCount;

  } catch (e) {
    console.warn(
      '[mongo] clearBattleSessions failed:',
      e.message
    );

    return 0;
  }
}

export async function getElementMeta(elementId) {
  try {
    const db = await getMongoDb();
    return db ? await db.collection('element_metadata').findOne({ element_id: elementId }, { projection: { _id: 0 } }) : null;
  } catch {
    return null;
  }
}
