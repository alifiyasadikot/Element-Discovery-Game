-- =====================================================================
-- Element Discovery Game  -  04_rbac.sql  (role-based access control
-- inside the database: MySQL roles, users, GRANT / REVOKE)
-- MySQL 8.0+.  Run as root AFTER 01-03, from the project folder:
--     mysql -u root -p -h 127.0.0.1 element_game < database/04_rbac.sql
--
-- The app keeps its own roles in the `role` table (Player / Admin /
-- Moderator). This file mirrors them as real MySQL roles so the
-- database itself refuses what a role is not allowed to do.
-- =====================================================================

USE element_game;

-- ---------- clean re-run ----------
DROP USER IF EXISTS 'eg_admin'@'localhost', 'eg_moderator'@'localhost', 'eg_player'@'localhost';
DROP ROLE IF EXISTS 'game_admin', 'game_moderator', 'game_player';

-- ---------- 1. roles ----------
CREATE ROLE 'game_admin', 'game_moderator', 'game_player';

-- Admin: full read/write on every table and view, can run every routine
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON element_game.* TO 'game_admin';

-- Moderator: manages the catalogue (elements, tags, recipes, categories),
-- reads everything, cannot touch accounts or battles
GRANT SELECT ON element_game.* TO 'game_moderator';
GRANT INSERT, UPDATE ON element_game.element     TO 'game_moderator';
GRANT INSERT, UPDATE ON element_game.recipe      TO 'game_moderator';
GRANT INSERT, UPDATE ON element_game.category    TO 'game_moderator';
GRANT INSERT, DELETE ON element_game.element_tag TO 'game_moderator';

-- Player: reads the public catalogue and leaderboards, and changes game
-- state ONLY through stored procedures. The procedures run with
-- SQL SECURITY DEFINER (the default), so they may write tables the
-- player cannot write directly.
GRANT SELECT ON element_game.element                    TO 'game_player';
GRANT SELECT ON element_game.category                   TO 'game_player';
GRANT SELECT ON element_game.element_tag                TO 'game_player';
GRANT SELECT ON element_game.challenge                  TO 'game_player';
GRANT SELECT ON element_game.achievement                TO 'game_player';
GRANT SELECT ON element_game.leaderboard_xp_view        TO 'game_player';
GRANT SELECT ON element_game.leaderboard_discoveries_view TO 'game_player';
GRANT SELECT ON element_game.leaderboard_first_view     TO 'game_player';
GRANT SELECT ON element_game.battle_history_view        TO 'game_player';
GRANT SELECT, UPDATE (favorite) ON element_game.user_element TO 'game_player';  -- column-level privilege
GRANT EXECUTE ON PROCEDURE element_game.combine_elements TO 'game_player';
GRANT EXECUTE ON PROCEDURE element_game.create_battle    TO 'game_player';
GRANT EXECUTE ON PROCEDURE element_game.join_battle      TO 'game_player';
GRANT EXECUTE ON PROCEDURE element_game.battle_combine   TO 'game_player';
GRANT EXECUTE ON PROCEDURE element_game.forfeit_battle   TO 'game_player';
GRANT EXECUTE ON FUNCTION  element_game.recipe_battle_points TO 'game_player';

-- ---------- 2. users, one per role ----------
CREATE USER 'eg_admin'@'localhost'     IDENTIFIED BY 'Admin#2026';
CREATE USER 'eg_moderator'@'localhost' IDENTIFIED BY 'Moder#2026';
CREATE USER 'eg_player'@'localhost'    IDENTIFIED BY 'Player#2026';

GRANT 'game_admin'     TO 'eg_admin'@'localhost';
GRANT 'game_moderator' TO 'eg_moderator'@'localhost';
GRANT 'game_player'    TO 'eg_player'@'localhost';

-- roles are active as soon as the user logs in
SET DEFAULT ROLE ALL TO 'eg_admin'@'localhost', 'eg_moderator'@'localhost', 'eg_player'@'localhost';

-- ---------- 3. REVOKE example ----------
-- moderators may add tags but not remove them
REVOKE DELETE ON element_game.element_tag FROM 'game_moderator';

-- ---------- 4. check ----------
SHOW GRANTS FOR 'game_player';
SHOW GRANTS FOR 'eg_moderator'@'localhost' USING 'game_moderator';

-- ---------- 5. demo for the viva (run by hand) ----------
-- mysql -u eg_player -p -h 127.0.0.1 element_game        (password Player#2026)
--   SELECT name, rarity FROM element LIMIT 5;            -- works
--   CALL combine_elements(2, 1, 2);                      -- works: through the procedure
--   UPDATE user_element SET favorite = 1 WHERE user_id = 2 AND element_id = 1;   -- works: column grant
--   DELETE FROM element WHERE element_id = 1;            -- ERROR 1142: DELETE command denied
--   SELECT * FROM app_user;                              -- ERROR 1142: SELECT command denied
--   UPDATE user_element SET unlocked_at = NOW();         -- ERROR 1143: column not granted
-- mysql -u eg_moderator -p -h 127.0.0.1 element_game     (password Moder#2026)
--   UPDATE element SET is_active = TRUE WHERE element_id = 1;      -- works (catalogue table)
--   DELETE FROM element_tag WHERE tag = 'hot';           -- ERROR 1142: DELETE revoked
--   UPDATE app_user SET xp = 99999;                      -- ERROR 1142
