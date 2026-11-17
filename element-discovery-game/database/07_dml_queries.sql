-- =====================================================================
-- Element Discovery Game  -  07_dml_queries.sql  (DML + query demo)
-- Part A  INSERT / UPDATE / DELETE inside a transaction, then ROLLBACK,
--         so the live game data is left exactly as it was.
-- Part B  SELECT queries on the real game data: JOIN, nested,
--         correlated, EXISTS / NOT EXISTS, GROUP BY ... HAVING,
--         CTE, recursive CTE, view, function.
-- Run after `npm run setup`:
--     mysql -u root -p -h 127.0.0.1 --table element_game < database/07_dml_queries.sql
-- =====================================================================

USE element_game;

-- =====================================================================
-- PART A  DML (transaction, rolled back at the end)
-- =====================================================================
START TRANSACTION;

-- A1. INSERT: a new category, two elements, their tags and a recipe
INSERT INTO category (category_name, description, icon_url)
VALUES ('Crystal', 'Gems and minerals', '💎');
SET @cat = LAST_INSERT_ID();

INSERT INTO element (name, description, icon_url, rarity, category_id) VALUES
    ('Quartz', 'A clear crystal.',            '🔹', 'Uncommon', @cat),
    ('Prism',  'Quartz that splits the light.', '🔷', 'Rare',     @cat);
SET @quartz = (SELECT element_id FROM element WHERE name = 'Quartz');
SET @prism  = (SELECT element_id FROM element WHERE name = 'Prism');
SET @fire   = (SELECT element_id FROM element WHERE name = 'Fire');

INSERT INTO element_tag (element_id, tag) VALUES (@quartz, 'mineral'), (@prism, 'mineral'), (@prism, 'light');

-- the pair is stored in ascending order (ck_recipe_order)
INSERT INTO recipe (element1_id, element2_id, result_element_id, difficulty, xp_reward)
VALUES (LEAST(@fire, @quartz), GREATEST(@fire, @quartz), @prism, 3, 30);

-- A2. INSERT a player. Triggers fire: trg_user_level_ins sets level,
--     trg_user_starters gives the four starter elements.
INSERT INTO app_user (username, email, password_hash, role_id)
VALUES ('demo_player', 'demo@example.com', SHA2('demo123', 256),
        (SELECT role_id FROM role WHERE role_name = 'Player'));
SET @demo = LAST_INSERT_ID();
SELECT u.username, u.level, COUNT(ue.element_id) AS starter_elements
FROM app_user u JOIN user_element ue ON ue.user_id = u.user_id
WHERE u.user_id = @demo
GROUP BY u.user_id, u.username, u.level;

SAVEPOINT after_inserts;

-- A3. UPDATE: give XP (trg_user_level_upd recalculates the level)
UPDATE app_user SET xp = xp + 450 WHERE user_id = @demo;
SELECT username, xp, level FROM app_user WHERE user_id = @demo;

-- A4. UPDATE: mark a favourite, raise hard recipes' XP, soft-delete an element
UPDATE user_element SET favorite = TRUE WHERE user_id = @demo AND element_id = @fire;
UPDATE recipe SET xp_reward = xp_reward + 5 WHERE difficulty >= 4;
UPDATE element SET is_active = FALSE WHERE element_id = @quartz;

-- A5. ROLLBACK TO SAVEPOINT: undo only the updates
ROLLBACK TO SAVEPOINT after_inserts;
SELECT username, xp, level FROM app_user WHERE user_id = @demo;   -- back to 0 XP, level 1

-- A6. DELETE: remove a tag, then the player (ON DELETE CASCADE removes the unlocks)
DELETE FROM element_tag WHERE element_id = @prism AND tag = 'light';
DELETE FROM app_user WHERE user_id = @demo;
SELECT COUNT(*) AS demo_unlocks_left FROM user_element WHERE user_id = @demo;   -- 0

-- A7. A delete MySQL refuses (left commented out so the script keeps running):
-- DELETE FROM element WHERE element_id = @fire;
--   ERROR 1451: Fire is used by recipes and has no ON DELETE action.

ROLLBACK;   -- everything in Part A is undone
SELECT COUNT(*) AS crystal_category_rows FROM category WHERE category_name = 'Crystal';   -- 0

-- =====================================================================
-- PART B  QUERIES on the real game data
-- =====================================================================

-- B1. JOIN: the recipe book, ELEMENT joined three times
SELECT CONCAT(a.name, ' + ', b.name, ' = ', o.name) AS recipe, r.difficulty, r.xp_reward
FROM recipe r
JOIN element a ON a.element_id = r.element1_id
JOIN element b ON b.element_id = r.element2_id
JOIN element o ON o.element_id = r.result_element_id
ORDER BY r.difficulty, o.name
LIMIT 15;

-- B2. Nested subquery: players above the average XP
SELECT username, xp
FROM app_user
WHERE xp > (SELECT AVG(xp) FROM app_user)
ORDER BY xp DESC;

-- B3. Correlated subquery: the top-XP account in each role
SELECT r.role_name, u.username, u.xp
FROM app_user u
JOIN role r ON r.role_id = u.role_id
WHERE u.xp = (SELECT MAX(u2.xp) FROM app_user u2 WHERE u2.role_id = u.role_id);

-- B4. Correlated subquery in SELECT: how many players own each legendary element
SELECT e.name,
       (SELECT COUNT(*) FROM user_element ue WHERE ue.element_id = e.element_id) AS owners
FROM element e
WHERE e.rarity = 'Legendary'
ORDER BY owners DESC, e.name;

-- B5. NOT EXISTS: elements no player has discovered yet
SELECT e.name, e.rarity
FROM element e
WHERE e.is_active
  AND NOT EXISTS (SELECT 1 FROM user_element ue WHERE ue.element_id = e.element_id)
ORDER BY FIELD(e.rarity, 'Common', 'Uncommon', 'Rare', 'Legendary'), e.name
LIMIT 10;

-- B6. GROUP BY ... HAVING: categories with more than 5 active elements
SELECT c.category_name, COUNT(*) AS elements
FROM element e
JOIN category c ON c.category_id = e.category_id
WHERE e.is_active
GROUP BY c.category_name
HAVING COUNT(*) > 5
ORDER BY elements DESC;

-- B7. CTE: each player's discoveries and first discoveries
WITH per_player AS (
    SELECT d.user_id,
           COUNT(*) AS discoveries,
           SUM(d.is_first_discovery) AS firsts,
           SUM(d.xp_earned) AS xp_from_discoveries
    FROM discovery d
    GROUP BY d.user_id
)
SELECT u.username, p.discoveries, p.firsts, p.xp_from_discoveries
FROM per_player p
JOIN app_user u ON u.user_id = p.user_id
ORDER BY p.discoveries DESC;

-- B8. Recursive CTE: every ingredient needed to make Human, back to the starters
WITH RECURSIVE ingredients AS (
    SELECT e.element_id, e.name, 0 AS depth
    FROM element e
    WHERE e.name = 'Human'
    UNION ALL
    SELECT ing.element_id, ing.name, i.depth + 1
    FROM ingredients i
    JOIN recipe r    ON r.result_element_id = i.element_id
    JOIN element ing ON ing.element_id IN (r.element1_id, r.element2_id)
    WHERE i.depth < 8
)
SELECT name, MIN(depth) AS steps_back
FROM ingredients
WHERE depth > 0
GROUP BY element_id, name
ORDER BY steps_back, name;

-- B9. View: the XP leaderboard
SELECT * FROM leaderboard_xp_view LIMIT 5;

-- B10. Stored function: battle points for the hardest recipes
SELECT o.name AS result, r.difficulty, r.xp_reward,
       recipe_battle_points(r.xp_reward, r.difficulty) AS battle_points
FROM recipe r
JOIN element o ON o.element_id = r.result_element_id
ORDER BY battle_points DESC
LIMIT 5;

-- B11. Stored procedure: a player combines Fire + Water through the game's own logic
--      (left commented out because it changes that player's data)
-- CALL combine_elements(2, (SELECT element_id FROM element WHERE name='Fire'), (SELECT element_id FROM element WHERE name='Water'));

-- B12. Battle results (weak entity battle_action), after a battle has been played in the app
SELECT b.battle_id, b.name, b.status, w.username AS winner,
       COUNT(ba.action_seq) AS moves,
       TIMESTAMPDIFF(SECOND, b.start_time, b.end_time) AS duration_sec   -- derived, not stored
FROM battle b
LEFT JOIN app_user w      ON w.user_id = b.winner_id
LEFT JOIN battle_action ba ON ba.battle_id = b.battle_id
GROUP BY b.battle_id, b.name, b.status, w.username, b.start_time, b.end_time
ORDER BY b.battle_id DESC
LIMIT 5;
