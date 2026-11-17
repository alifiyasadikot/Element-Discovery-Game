import { pool, query } from '@/lib/db';
import { apiUser, json, body, dbError, int } from '@/lib/api';
import { getMongoDb } from '@/lib/mongo';

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary'];
const STAFF = ['Admin', 'Moderator'];

// create an element (+ tags in MySQL, lore in MongoDB)
export async function POST(req) {
  const [, err] = await apiUser(STAFF);
  if (err) return err;
  const b = await body(req);
  const name = String(b.name || '').trim();
  const categoryId = int(b.categoryId);
  if (!name || !categoryId || !RARITIES.includes(b.rarity)) return json({ error: 'Name, category and rarity are required' }, 400);
  const tags = [...new Set(String(b.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO element (name, description, icon_url, rarity, category_id) VALUES (?, ?, ?, ?, ?)',
      [name, b.description || null, b.icon || null, b.rarity, categoryId]);
    for (const t of tags) await conn.query('INSERT INTO element_tag (element_id, tag) VALUES (?, ?)', [r.insertId, t.slice(0, 30)]);
    await conn.commit();
    try {
      const db = await getMongoDb();
      if (db) await db.collection('element_metadata').insertOne({
        element_id: r.insertId, name, lore: b.lore || b.description || '', tags, aliases: [], fun_facts: [], related_concepts: [] });
    } catch {}
    return json({ element_id: r.insertId });
  } catch (e) {
    await conn.rollback();
    return dbError(e);
  } finally {
    conn.release();
  }
}

// soft delete / restore
export async function PATCH(req) {
  const [, err] = await apiUser(STAFF);
  if (err) return err;
  const b = await body(req);
  const id = int(b.elementId);
  if (!id) return json({ error: 'elementId required' }, 400);
  await query('UPDATE element SET is_active = ? WHERE element_id = ?', [b.isActive ? 1 : 0, id]);
  return json({ ok: true });
}
// Admin-only deletion of an element's non-starter tag.
// Elements themselves are never physically deleted here.
export async function DELETE(req) {
  const [, err] = await apiUser(['Admin']);
  if (err) return err;

  const b = (await body(req)) ?? {};
  const elementId = int(b.elementId);
  const tag = typeof b.tag === 'string'
    ? b.tag.trim().toLowerCase()
    : '';

  if (
    !elementId ||
    elementId < 1 ||
    !tag ||
    tag.length > 30 ||
    tag === 'starter'
  ) {
    return json({
      error: 'Valid element ID and non-starter tag required'
    }, 400);
  }

  try {
    const result = await query(
      `DELETE FROM element_tag
       WHERE element_id = ?
         AND tag = ?
         AND tag <> 'starter'`,
      [elementId, tag]
    );

    if (result.affectedRows !== 1) {
      return json({
        error: 'Tag not found or protected'
      }, 404);
    }

    // Keep flexible MongoDB metadata in sync when available.
    // MySQL remains the authoritative tag store.
    try {
      const db = await getMongoDb();

      if (db) {
        await db.collection('element_metadata').updateOne(
          { element_id: elementId },
          { $pull: { tags: tag } }
        );
      }
    } catch (mongoError) {
      console.warn(
        'MongoDB tag synchronization failed:',
        mongoError
      );
    }

    return json({
      ok: true,
      deleted: 1
    });

  } catch (e) {
    return dbError(e);
  }
}