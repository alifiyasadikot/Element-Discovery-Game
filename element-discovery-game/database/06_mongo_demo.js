// =====================================================================
// Element Discovery Game  -  06_mongo_demo.js  (MongoDB / NoSQL demo)
// Shows the collections, indexes and full CRUD + aggregation on the
// game's MongoDB database. Demo documents are removed at the end.
// Run after `npm run db:mongo`:
//     mongosh "mongodb://127.0.0.1:27017/element_game" database/06_mongo_demo.js
// =====================================================================

db = db.getSiblingDB('element_game');

print('\n== Collections');
printjson(db.getCollectionNames());

print('\n== Indexes (unique, compound, TTL, text)');
printjson(db.game_activity.getIndexes().map((i) => i.key));
printjson(db.game_sessions.getIndexes().map((i) => ({ key: i.key, unique: i.unique, ttl: i.expireAfterSeconds })));
printjson(db.element_metadata.getIndexes().map((i) => i.key));

// ---------- CREATE ----------
print('\n== CREATE: insertOne / insertMany');
printjson(db.game_activity.insertOne({
  user_id: 999, event_type: 'demo_event', element1: 'Fire', element2: 'Water',
  success: true, outcome: 'DISCOVERED', timestamp: new Date(),
}));
printjson(db.game_activity.insertMany([
  { user_id: 999, event_type: 'demo_event', element1: 'Water', element2: 'Water', success: false, outcome: 'NO_RECIPE', timestamp: new Date() },
  { user_id: 999, event_type: 'demo_event', element1: 'Air', element2: 'Fire', success: true, outcome: 'DISCOVERED', timestamp: new Date() },
]));

// ---------- READ ----------
print('\n== READ: findOne (flexible document with arrays)');
printjson(db.element_metadata.findOne({ name: 'Fire' }, { _id: 0 }));

print('\n== READ: find with filter, projection, sort, limit');
printjson(db.game_activity.find({ user_id: 999 }, { _id: 0, element1: 1, element2: 1, outcome: 1 })
  .sort({ timestamp: -1 }).limit(5).toArray());

print('\n== READ: full-text search on lore / aliases / tags (text index)');
printjson(db.element_metadata.find(
  { $text: { $search: 'fire legend' } },
  { _id: 0, name: 1, lore: 1, score: { $meta: 'textScore' } })
  .sort({ score: { $meta: 'textScore' } }).limit(5).toArray());

// ---------- UPDATE ----------
print('\n== UPDATE: $addToSet into an array');
printjson(db.element_metadata.updateOne({ name: 'Fire' }, { $addToSet: { fun_facts: 'Demo fact added in the viva.' } }));

print('\n== UPDATE: upsert a live battle session (TTL index removes it after 1 hour)');
printjson(db.game_sessions.updateOne(
  { battle_id: 999, user_id: 999 },
  { $set: { last_seen: new Date() }, $setOnInsert: { started_at: new Date() } },
  { upsert: true }));

// ---------- AGGREGATE ----------
print('\n== AGGREGATE: events per type');
printjson(db.game_activity.aggregate([
  { $group: { _id: '$event_type', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray());

print('\n== AGGREGATE: success rate per user');
printjson(db.game_activity.aggregate([
  { $match: { event_type: { $in: ['combination_attempt', 'demo_event'] } } },
  { $group: { _id: '$user_id', attempts: { $sum: 1 }, ok: { $sum: { $cond: ['$success', 1, 0] } } } },
  { $project: { attempts: 1, ok: 1, success_pct: { $round: [{ $multiply: [{ $divide: ['$ok', '$attempts'] }, 100] }, 1] } } },
  { $sort: { attempts: -1 } },
  { $limit: 5 },
]).toArray());

print('\n== AGGREGATE: most failed pairs (what players keep trying)');
printjson(db.game_activity.aggregate([
  { $match: { outcome: 'NO_RECIPE' } },
  { $group: { _id: { a: { $min: ['$element1', '$element2'] }, b: { $max: ['$element1', '$element2'] } }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 5 },
]).toArray());

// ---------- DELETE ----------
print('\n== DELETE: $pull from an array, deleteOne, deleteMany');
printjson(db.element_metadata.updateOne({ name: 'Fire' }, { $pull: { fun_facts: 'Demo fact added in the viva.' } }));
printjson(db.game_sessions.deleteOne({ battle_id: 999, user_id: 999 }));
printjson(db.game_activity.deleteMany({ event_type: 'demo_event' }));

print('\nDone: demo documents removed.');
