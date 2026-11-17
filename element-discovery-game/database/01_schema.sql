-- =====================================================================
-- Element Discovery Game  -  01_schema.sql  (tables, keys, constraints)
-- Works on MySQL 8.0+ (and MariaDB 10.5+).  Run inside an empty database:
--     CREATE DATABASE element_game; USE element_game;
-- Naming note: USER -> app_user and MATCH -> battle because USER / MATCH are
-- reserved words in several SQL dialects.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS battle_action, battle_player, battle, user_achievement, achievement,
  user_challenge, challenge, discovery, user_element, recipe, element_tag, element,
  category, app_user, role;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE role (
  role_id      INT AUTO_INCREMENT PRIMARY KEY,
  role_name    VARCHAR(30)  NOT NULL UNIQUE,
  description  VARCHAR(255)
);

CREATE TABLE app_user (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(30)  NOT NULL UNIQUE,
  email          VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  avatar_url     VARCHAR(255),
  join_date      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  xp             INT          NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level          INT          NOT NULL DEFAULT 1 CHECK (level >= 1),   -- derived from xp by trigger
  total_wins     INT          NOT NULL DEFAULT 0 CHECK (total_wins >= 0),
  total_losses   INT          NOT NULL DEFAULT 0 CHECK (total_losses >= 0),
  role_id        INT          NOT NULL,
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES role(role_id)
);

CREATE TABLE category (
  category_id    INT AUTO_INCREMENT PRIMARY KEY,
  category_name  VARCHAR(50)  NOT NULL UNIQUE,
  description    VARCHAR(255),
  icon_url       VARCHAR(255)
);

CREATE TABLE element (
  element_id   INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(60)  NOT NULL UNIQUE,
  description  TEXT,
  icon_url     VARCHAR(255),                       -- emoji glyph or image URL
  rarity       ENUM('Common','Uncommon','Rare','Legendary') NOT NULL DEFAULT 'Common',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE, -- soft delete
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category_id  INT          NOT NULL,
  CONSTRAINT fk_element_category FOREIGN KEY (category_id) REFERENCES category(category_id),
  INDEX idx_element_cat_rarity (category_id, rarity)
);

-- multivalued attribute "tag" of ELEMENT
CREATE TABLE element_tag (
  element_id  INT         NOT NULL,
  tag         VARCHAR(30) NOT NULL,
  PRIMARY KEY (element_id, tag),
  CONSTRAINT fk_tag_element FOREIGN KEY (element_id) REFERENCES element(element_id) ON DELETE CASCADE
);

-- element1 + element2 -> result. Pair is stored canonically (element1_id <= element2_id)
-- so A+B and B+A can never be two different recipes.
CREATE TABLE recipe (
  recipe_id          INT AUTO_INCREMENT PRIMARY KEY,
  element1_id        INT NOT NULL,
  element2_id        INT NOT NULL,
  result_element_id  INT NOT NULL,
  difficulty         TINYINT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  xp_reward          INT NOT NULL DEFAULT 10 CHECK (xp_reward >= 0),
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recipe_e1  FOREIGN KEY (element1_id)       REFERENCES element(element_id),
  CONSTRAINT fk_recipe_e2  FOREIGN KEY (element2_id)       REFERENCES element(element_id),
  CONSTRAINT fk_recipe_res FOREIGN KEY (result_element_id) REFERENCES element(element_id),
  CONSTRAINT uq_recipe_pair UNIQUE (element1_id, element2_id),
  CONSTRAINT ck_recipe_order CHECK (element1_id <= element2_id),
  INDEX idx_recipe_result (result_element_id)
);

-- M:N  app_user <-> element
CREATE TABLE user_element (
  user_id      INT NOT NULL,
  element_id   INT NOT NULL,
  unlocked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  favorite     BOOLEAN  NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, element_id),
  CONSTRAINT fk_ue_user    FOREIGN KEY (user_id)    REFERENCES app_user(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ue_element FOREIGN KEY (element_id) REFERENCES element(element_id)
);

-- a user's discovery of a recipe's result (one row per user + recipe)
CREATE TABLE discovery (
  discovery_id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL,
  recipe_id           INT NOT NULL,
  discovered_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_first_discovery  BOOLEAN  NOT NULL DEFAULT FALSE,
  xp_earned           INT      NOT NULL DEFAULT 0,
  CONSTRAINT fk_disc_user   FOREIGN KEY (user_id)   REFERENCES app_user(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_disc_recipe FOREIGN KEY (recipe_id) REFERENCES recipe(recipe_id),
  CONSTRAINT uq_disc_user_recipe UNIQUE (user_id, recipe_id),
  INDEX idx_disc_time (discovered_at)
);

CREATE TABLE challenge (
  challenge_id    INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(100) NOT NULL,
  description     TEXT,
  challenge_type  ENUM('DISCOVER_COUNT','FIRST_DISCOVERY','BATTLE_WIN') NOT NULL,
  target_value    INT NOT NULL CHECK (target_value > 0),
  xp_reward       INT NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  start_date      DATETIME NOT NULL,
  end_date        DATETIME NOT NULL,
  CONSTRAINT ck_challenge_dates CHECK (end_date >= start_date)
);

CREATE TABLE user_challenge (
  user_id       INT NOT NULL,
  challenge_id  INT NOT NULL,
  progress      INT NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed_at  DATETIME,
  status        ENUM('InProgress','Completed') NOT NULL DEFAULT 'InProgress',
  PRIMARY KEY (user_id, challenge_id),
  CONSTRAINT fk_uc_user      FOREIGN KEY (user_id)      REFERENCES app_user(user_id)      ON DELETE CASCADE,
  CONSTRAINT fk_uc_challenge FOREIGN KEY (challenge_id) REFERENCES challenge(challenge_id) ON DELETE CASCADE
);

CREATE TABLE achievement (
  achievement_id     INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(80) NOT NULL UNIQUE,
  description        TEXT,
  requirement_type   ENUM('DISCOVERY_COUNT','FIRST_DISCOVERY_COUNT','RARE_COUNT','BATTLE_WINS') NOT NULL,
  requirement_value  INT NOT NULL CHECK (requirement_value > 0),
  xp_reward          INT NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  icon_url           VARCHAR(255)
);

CREATE TABLE user_achievement (
  user_id         INT NOT NULL,
  achievement_id  INT NOT NULL,
  earned_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  progress        INT NOT NULL DEFAULT 0,
  status          ENUM('InProgress','Earned') NOT NULL DEFAULT 'Earned',
  PRIMARY KEY (user_id, achievement_id),
  CONSTRAINT fk_ua_user FOREIGN KEY (user_id)        REFERENCES app_user(user_id)           ON DELETE CASCADE,
  CONSTRAINT fk_ua_ach  FOREIGN KEY (achievement_id) REFERENCES achievement(achievement_id) ON DELETE CASCADE
);


-- Multiplayer fusion battle (the "MATCH" entity)
CREATE TABLE battle (
  battle_id   INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  start_time  DATETIME NULL,                       -- Player 1's turn start
  end_time    DATETIME NULL,                       -- final match completion
  time_limit  INT NOT NULL DEFAULT 120 CHECK (time_limit BETWEEN 30 AND 900),
  status      ENUM('Pending','Active','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  winner_id   INT NULL,

  -- Same four starting elements for both players.
  -- NULL is permitted for battles created before this migration.
  starting_elements JSON NULL,

  -- NULL for unfinished or legacy battles.
  end_reason ENUM('Normal','Forfeit') NULL,

  CONSTRAINT fk_battle_winner
    FOREIGN KEY (winner_id) REFERENCES app_user(user_id),

  CONSTRAINT ck_battle_winner
    CHECK (winner_id IS NULL OR status = 'Completed'),

  CONSTRAINT ck_battle_starting_elements
    CHECK (
      starting_elements IS NULL
      OR (
        JSON_TYPE(starting_elements) = 'ARRAY'
        AND JSON_LENGTH(starting_elements) = 4
      )
    ),

  CONSTRAINT ck_battle_end_reason
    CHECK (end_reason IS NULL OR status = 'Completed')
);


-- M:N  app_user <-> battle
CREATE TABLE battle_player (
  battle_id               INT NOT NULL,
  user_id                 INT NOT NULL,
  joined_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  score                   INT NOT NULL DEFAULT 0,
  combinations_completed  INT NOT NULL DEFAULT 0,
  completion_time         INT NULL,                -- seconds from start to the last scoring action
  PRIMARY KEY (battle_id, user_id),
  CONSTRAINT fk_bp_battle FOREIGN KEY (battle_id) REFERENCES battle(battle_id)  ON DELETE CASCADE,
  CONSTRAINT fk_bp_user   FOREIGN KEY (user_id)   REFERENCES app_user(user_id)
);

-- WEAK ENTITY: cannot exist without its battle.
-- Identifying relationship = battle_id; partial key = action_seq (1,2,3... inside a battle).
CREATE TABLE battle_action (
  battle_id          INT NOT NULL,
  action_seq         INT NOT NULL,
  user_id            INT NOT NULL,
  recipe_id          INT NULL,                     -- NULL when no recipe exists for the attempt
  element1_id        INT NOT NULL,
  element2_id        INT NOT NULL,
  result_element_id  INT NULL,
  action_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success            BOOLEAN NOT NULL DEFAULT FALSE,
  points_earned      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (battle_id, action_seq),
  CONSTRAINT fk_ba_battle  FOREIGN KEY (battle_id) REFERENCES battle(battle_id) ON DELETE CASCADE,
  -- the actor must be a registered player of THIS battle
  CONSTRAINT fk_ba_player  FOREIGN KEY (battle_id, user_id) REFERENCES battle_player(battle_id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ba_recipe  FOREIGN KEY (recipe_id)         REFERENCES recipe(recipe_id),
  CONSTRAINT fk_ba_e1      FOREIGN KEY (element1_id)       REFERENCES element(element_id),
  CONSTRAINT fk_ba_e2      FOREIGN KEY (element2_id)       REFERENCES element(element_id),
  CONSTRAINT fk_ba_result  FOREIGN KEY (result_element_id) REFERENCES element(element_id)
);
