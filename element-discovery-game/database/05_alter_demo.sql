-- =====================================================================
-- Element Discovery Game  -  05_alter_demo.sql  (the remaining DDL
-- commands: ALTER TABLE, CREATE/DROP INDEX, RENAME TABLE, TRUNCATE, DROP)
-- Safe to run on the live game database: every change is undone at the
-- end, so the app keeps working and the file can be run again.
--     mysql -u root -p -h 127.0.0.1 element_game < database/05_alter_demo.sql
-- =====================================================================

USE element_game;

-- ---------- ALTER TABLE: columns ----------
ALTER TABLE app_user ADD COLUMN bio VARCHAR(160) NULL AFTER avatar_url;    -- add
ALTER TABLE app_user MODIFY COLUMN bio VARCHAR(300) NULL;                  -- change type
ALTER TABLE app_user RENAME COLUMN bio TO about_me;                        -- rename
ALTER TABLE app_user ALTER COLUMN about_me SET DEFAULT 'New alchemist';   -- set a default
DESCRIBE app_user;
ALTER TABLE app_user DROP COLUMN about_me;                                 -- drop

-- ---------- ALTER TABLE: constraints ----------
ALTER TABLE element_tag ADD CONSTRAINT ck_tag_not_blank CHECK (CHAR_LENGTH(TRIM(tag)) > 0);
SELECT CONSTRAINT_NAME, CHECK_CLAUSE
  FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = 'element_game' AND CONSTRAINT_NAME = 'ck_tag_not_blank';
ALTER TABLE element_tag DROP CHECK ck_tag_not_blank;

-- ---------- CREATE / DROP INDEX ----------
CREATE INDEX idx_user_join_date ON app_user (join_date);
SHOW INDEX FROM app_user WHERE Key_name = 'idx_user_join_date';
DROP INDEX idx_user_join_date ON app_user;

-- ---------- RENAME, TRUNCATE, DROP on a scratch table ----------
CREATE TABLE temp_audit (
  audit_id  INT AUTO_INCREMENT PRIMARY KEY,
  message   VARCHAR(200) NOT NULL,
  logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO temp_audit (message) VALUES ('created'), ('renamed next');
RENAME TABLE temp_audit TO audit_log;
SELECT COUNT(*) AS rows_before_truncate FROM audit_log;
TRUNCATE TABLE audit_log;
SELECT COUNT(*) AS rows_after_truncate FROM audit_log;
DROP TABLE audit_log;
