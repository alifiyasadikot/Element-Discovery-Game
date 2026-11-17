-- =====================================================================
-- Element Discovery Game  -  02_programmability.sql
-- Triggers, stored procedures and views.
-- Uses the mysql-client DELIMITER command (scripts/init-db.mjs understands it too).
-- =====================================================================

DROP VIEW IF EXISTS leaderboard_xp_view, leaderboard_discoveries_view, leaderboard_weekly_view,
  leaderboard_first_view, player_statistics_view, recent_first_discoveries_view, battle_history_view;
DROP FUNCTION IF EXISTS recipe_battle_points;
DROP EVENT IF EXISTS ev_async_battle_clock;
DROP PROCEDURE IF EXISTS combine_elements;
DROP PROCEDURE IF EXISTS create_battle;
DROP PROCEDURE IF EXISTS join_battle;
DROP PROCEDURE IF EXISTS battle_combine;
DROP PROCEDURE IF EXISTS finish_battle;
DROP PROCEDURE IF EXISTS finish_battle_core;
DROP PROCEDURE IF EXISTS advance_battle_core;
DROP PROCEDURE IF EXISTS advance_battle;
DROP PROCEDURE IF EXISTS refresh_expired_battles;
DROP PROCEDURE IF EXISTS cancel_battle;
DROP PROCEDURE IF EXISTS forfeit_battle;
DROP PROCEDURE IF EXISTS grant_achievements;
DROP PROCEDURE IF EXISTS bump_challenge;
DROP TRIGGER IF EXISTS trg_user_level_ins;
DROP TRIGGER IF EXISTS trg_user_level_upd;
DROP TRIGGER IF EXISTS trg_user_starters;
DROP TRIGGER IF EXISTS trg_after_discovery;
DROP TRIGGER IF EXISTS trg_achievement_xp;
DROP TRIGGER IF EXISTS trg_challenge_completed;

DELIMITER //

-- ---------------------------------------------------------------------
-- STORED FUNCTION: MULTIPLAYER RECIPE POINTS
-- ---------------------------------------------------------------------

CREATE FUNCTION recipe_battle_points (
  p_xp_reward INT,
  p_difficulty INT
)
RETURNS INT
DETERMINISTIC
NO SQL
BEGIN
  RETURN p_xp_reward + (p_difficulty * 5);
END //
-- ---------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------

-- level is derived from xp:  level = 1 + floor(sqrt(xp / 100))
CREATE TRIGGER trg_user_level_ins BEFORE INSERT ON app_user
FOR EACH ROW
BEGIN
  SET NEW.level = 1 + FLOOR(SQRT(NEW.xp / 100));
END //

CREATE TRIGGER trg_user_level_upd BEFORE UPDATE ON app_user
FOR EACH ROW
BEGIN
  SET NEW.level = 1 + FLOOR(SQRT(NEW.xp / 100));
END //

-- every new player starts with the elements tagged 'starter'
CREATE TRIGGER trg_user_starters AFTER INSERT ON app_user
FOR EACH ROW
BEGIN
  INSERT INTO user_element (user_id, element_id)
  SELECT NEW.user_id, t.element_id
    FROM element_tag t JOIN element e ON e.element_id = t.element_id
   WHERE t.tag = 'starter' AND e.is_active;
END //

-- achievement XP is paid out the moment the achievement row is created
CREATE TRIGGER trg_achievement_xp AFTER INSERT ON user_achievement
FOR EACH ROW
BEGIN
  UPDATE app_user
     SET xp = xp + (SELECT xp_reward FROM achievement WHERE achievement_id = NEW.achievement_id)
   WHERE user_id = NEW.user_id;
END //

-- challenge XP is paid out when a challenge flips to Completed
CREATE TRIGGER trg_challenge_completed AFTER UPDATE ON user_challenge
FOR EACH ROW
BEGIN
  IF NEW.status = 'Completed' AND OLD.status <> 'Completed' THEN
    UPDATE app_user
       SET xp = xp + (SELECT xp_reward FROM challenge WHERE challenge_id = NEW.challenge_id)
     WHERE user_id = NEW.user_id;
  END IF;
END //

-- ---------------------------------------------------------------------
-- HELPER PROCEDURES (called from triggers / other procedures)
-- ---------------------------------------------------------------------

-- add progress to every running challenge of a type, then complete the ones that hit target
CREATE PROCEDURE bump_challenge (IN p_user INT, IN p_type VARCHAR(30), IN p_amount INT)
BEGIN
  INSERT INTO user_challenge (user_id, challenge_id, progress, status)
  SELECT p_user, c.challenge_id, p_amount, 'InProgress'
    FROM challenge c
   WHERE c.challenge_type = p_type AND NOW() BETWEEN c.start_date AND c.end_date
  ON DUPLICATE KEY UPDATE
    progress = IF(user_challenge.status = 'InProgress', user_challenge.progress + p_amount, user_challenge.progress);

  UPDATE user_challenge uc
    JOIN challenge c ON c.challenge_id = uc.challenge_id
     SET uc.status = 'Completed', uc.completed_at = NOW()
   WHERE uc.user_id = p_user AND uc.status = 'InProgress'
     AND c.challenge_type = p_type AND uc.progress >= c.target_value;
END //

-- award every achievement whose requirement the user now meets
CREATE PROCEDURE grant_achievements (IN p_user INT)
BEGIN
  DECLARE v_wins INT DEFAULT 0;
  -- read into a variable first: the INSERT below fires a trigger that updates app_user,
  -- so app_user must not be read inside that same statement (error 1442)
  SELECT total_wins INTO v_wins FROM app_user WHERE user_id = p_user;

  INSERT IGNORE INTO user_achievement (user_id, achievement_id, progress, status)
  SELECT p_user, a.achievement_id, a.requirement_value, 'Earned'
    FROM achievement a
   WHERE CASE a.requirement_type
           WHEN 'DISCOVERY_COUNT'       THEN (SELECT COUNT(*) FROM discovery WHERE user_id = p_user)
           WHEN 'FIRST_DISCOVERY_COUNT' THEN (SELECT COUNT(*) FROM discovery WHERE user_id = p_user AND is_first_discovery)
           WHEN 'RARE_COUNT'            THEN (SELECT COUNT(*) FROM user_element ue JOIN element e ON e.element_id = ue.element_id
                                               WHERE ue.user_id = p_user AND e.rarity IN ('Rare','Legendary'))
           WHEN 'BATTLE_WINS'           THEN v_wins
           ELSE 0
         END >= a.requirement_value;
END //

-- every successful discovery updates challenges + achievements
CREATE TRIGGER trg_after_discovery AFTER INSERT ON discovery
FOR EACH ROW
BEGIN
  CALL bump_challenge(NEW.user_id, 'DISCOVER_COUNT', 1);
  IF NEW.is_first_discovery THEN
    CALL bump_challenge(NEW.user_id, 'FIRST_DISCOVERY', 1);
  END IF;
  CALL grant_achievements(NEW.user_id);
END //

-- ---------------------------------------------------------------------
-- CORE DISCOVERY TRANSACTION
-- returns one row: outcome = NO_RECIPE | ALREADY_OWNED | DISCOVERED
-- ---------------------------------------------------------------------
CREATE PROCEDURE combine_elements (IN p_user INT, IN p_e1 INT, IN p_e2 INT)
BEGIN
  DECLARE v_lo INT;
  DECLARE v_hi INT;
  DECLARE v_recipe INT DEFAULT NULL;
  DECLARE v_result INT DEFAULT NULL;
  DECLARE v_reward INT DEFAULT 0;
  DECLARE v_first  TINYINT DEFAULT 0;
  DECLARE v_xp     INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET v_lo = LEAST(p_e1, p_e2), v_hi = GREATEST(p_e1, p_e2);

  START TRANSACTION;

  IF (SELECT COUNT(*) FROM user_element WHERE user_id = p_user AND element_id IN (v_lo, v_hi))
       < IF(v_lo = v_hi, 1, 2) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You have not unlocked one of those elements';
  END IF;

  SELECT r.recipe_id, r.result_element_id, r.xp_reward
    INTO v_recipe, v_result, v_reward
    FROM recipe r JOIN element e ON e.element_id = r.result_element_id
   WHERE r.element1_id = v_lo AND r.element2_id = v_hi AND e.is_active
   LIMIT 1 FOR UPDATE;

  IF v_recipe IS NULL THEN
    COMMIT;
    SELECT 'NO_RECIPE' AS outcome, NULL AS recipe_id, NULL AS result_element_id, 0 AS xp_earned, 0 AS is_first_discovery;
  ELSEIF EXISTS (SELECT 1 FROM user_element WHERE user_id = p_user AND element_id = v_result) THEN
    COMMIT;
    SELECT 'ALREADY_OWNED' AS outcome, v_recipe AS recipe_id, v_result AS result_element_id, 0 AS xp_earned, 0 AS is_first_discovery;
  ELSE
    -- first discovery = nobody on the server owns this element yet
    SET v_first = NOT EXISTS (SELECT 1 FROM user_element WHERE element_id = v_result);
    SET v_xp = v_reward + IF(v_first, 50, 0);

    INSERT INTO user_element (user_id, element_id) VALUES (p_user, v_result);
    INSERT INTO discovery (user_id, recipe_id, is_first_discovery, xp_earned)
    VALUES (p_user, v_recipe, v_first, v_xp);                 -- fires trg_after_discovery
    UPDATE app_user SET xp = xp + v_xp WHERE user_id = p_user; -- fires trg_user_level_upd

    COMMIT;
    SELECT 'DISCOVERED' AS outcome, v_recipe AS recipe_id, v_result AS result_element_id, v_xp AS xp_earned, v_first AS is_first_discovery;
  END IF;
END //

-- ---------------------------------------------------------------------
-- BATTLES
-- ---------------------------------------------------------------------


CREATE PROCEDURE create_battle (IN p_user INT, IN p_name VARCHAR(80), IN p_time_limit INT)
BEGIN
  DECLARE v_id INT;
  DECLARE v_recipe_count INT DEFAULT 0;
  DECLARE v_usable_count INT DEFAULT 0;
  DECLARE v_first_recipe INT DEFAULT NULL;
  DECLARE v_a INT;
  DECLARE v_b INT;
  DECLARE v_c INT;
  DECLARE v_d INT;
  DECLARE v_extra INT DEFAULT NULL;
  DECLARE v_starters JSON;
  DECLARE v_now DATETIME;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_time_limit IS NULL OR p_time_limit NOT BETWEEN 30 AND 900 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Time limit must be between 30 and 900 seconds';
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Battle name is required';
  END IF;

  START TRANSACTION;

  -- Only recipes with active inputs and active results are playable.
  SELECT COUNT(*) INTO v_recipe_count
  FROM recipe r
  JOIN element a ON a.element_id = r.element1_id
  JOIN element b ON b.element_id = r.element2_id
  JOIN element c ON c.element_id = r.result_element_id
  WHERE a.is_active = TRUE
    AND b.is_active = TRUE
    AND c.is_active = TRUE;

  IF v_recipe_count < 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'At least two active recipes are required';
  END IF;

  -- Count active elements usable as inputs in an active recipe.
  SELECT COUNT(*) INTO v_usable_count
  FROM element e
  WHERE e.is_active = TRUE
    AND EXISTS (
      SELECT 1
      FROM recipe r
      JOIN element a ON a.element_id = r.element1_id
      JOIN element b ON b.element_id = r.element2_id
      JOIN element c ON c.element_id = r.result_element_id
      WHERE a.is_active = TRUE
        AND b.is_active = TRUE
        AND c.is_active = TRUE
        AND (
          r.element1_id = e.element_id
          OR r.element2_id = e.element_id
        )
    );

  IF v_usable_count < 4 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'At least four usable active elements are required';
  END IF;

  -- Choose two different playable recipes randomly.
  -- Their inputs guarantee at least two immediate combinations.
  SELECT r.recipe_id, r.element1_id, r.element2_id
  INTO v_first_recipe, v_a, v_b
  FROM recipe r
  JOIN element a ON a.element_id = r.element1_id
  JOIN element b ON b.element_id = r.element2_id
  JOIN element c ON c.element_id = r.result_element_id
  WHERE a.is_active = TRUE
    AND b.is_active = TRUE
    AND c.is_active = TRUE
  ORDER BY RAND()
  LIMIT 1;

  SELECT r.element1_id, r.element2_id
  INTO v_c, v_d
  FROM recipe r
  JOIN element a ON a.element_id = r.element1_id
  JOIN element b ON b.element_id = r.element2_id
  JOIN element c ON c.element_id = r.result_element_id
  WHERE a.is_active = TRUE
    AND b.is_active = TRUE
    AND c.is_active = TRUE
    AND r.recipe_id <> v_first_recipe
  ORDER BY RAND()
  LIMIT 1;

  -- Build a distinct set of inputs.
  SET v_starters = JSON_ARRAY(v_a);

  IF NOT JSON_CONTAINS(v_starters, JSON_ARRAY(v_b)) THEN
    SET v_starters = JSON_ARRAY_APPEND(v_starters, '$', v_b);
  END IF;

  IF NOT JSON_CONTAINS(v_starters, JSON_ARRAY(v_c)) THEN
    SET v_starters = JSON_ARRAY_APPEND(v_starters, '$', v_c);
  END IF;

  IF NOT JSON_CONTAINS(v_starters, JSON_ARRAY(v_d)) THEN
    SET v_starters = JSON_ARRAY_APPEND(v_starters, '$', v_d);
  END IF;

  -- If the recipes share inputs, fill the remaining slots
  -- with other randomly chosen, usable, active elements.
  WHILE JSON_LENGTH(v_starters) < 4 DO
    SET v_extra = NULL;

    SELECT e.element_id INTO v_extra
    FROM element e
    WHERE e.is_active = TRUE
      AND NOT JSON_CONTAINS(v_starters, JSON_ARRAY(e.element_id))
      AND EXISTS (
        SELECT 1
        FROM recipe r
        JOIN element a ON a.element_id = r.element1_id
        JOIN element b ON b.element_id = r.element2_id
        JOIN element c ON c.element_id = r.result_element_id
        WHERE a.is_active = TRUE
          AND b.is_active = TRUE
          AND c.is_active = TRUE
          AND (
            r.element1_id = e.element_id
            OR r.element2_id = e.element_id
          )
      )
    ORDER BY RAND()
    LIMIT 1;

    IF v_extra IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot generate four playable starting elements';
    END IF;

    SET v_starters = JSON_ARRAY_APPEND(v_starters, '$', v_extra);
  END WHILE;

  SET v_now = NOW();

  INSERT INTO battle (
    name,
    time_limit,
    start_time,
    status,
    starting_elements
  )
  VALUES (
    TRIM(p_name),
    p_time_limit,
    v_now,
    'Active',
    v_starters
  );

  SET v_id = LAST_INSERT_ID();

  INSERT INTO battle_player (
    battle_id,
    user_id,
    joined_at
  )
  VALUES (
    v_id,
    p_user,
    v_now
  );

  COMMIT;

  SELECT v_id AS battle_id;
END //



-- Player 2 joins only after Player 1's turn has expired.
CREATE PROCEDURE join_battle (IN p_battle INT, IN p_user INT)
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_start DATETIME;
  DECLARE v_limit INT;
  DECLARE v_starters JSON;
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_host INT DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status, start_time, time_limit, starting_elements
  INTO v_status, v_start, v_limit, v_starters
  FROM battle
  WHERE battle_id = p_battle
  FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Battle not found';
  END IF;

  -- Update expired turns before checking availability.
  CALL advance_battle_core(p_battle);

  SELECT status INTO v_status
  FROM battle
  WHERE battle_id = p_battle;

  IF v_status <> 'Pending'
     OR v_start IS NULL
     OR v_starters IS NULL
     OR NOW() < DATE_ADD(v_start, INTERVAL v_limit SECOND) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Challenge is not ready for acceptance';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM battle_player
  WHERE battle_id = p_battle;

  IF v_count <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Challenge already has an opponent';
  END IF;

  SELECT user_id INTO v_host
  FROM battle_player
  WHERE battle_id = p_battle
  ORDER BY joined_at, user_id
  LIMIT 1;

  IF p_user = v_host THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'You cannot challenge yourself';
  END IF;

  INSERT INTO battle_player (
    battle_id,
    user_id,
    joined_at
  )
  VALUES (
    p_battle,
    p_user,
    NOW()
  );

  -- Retain Player 1's original start_time.
  UPDATE battle
  SET status = 'Active'
  WHERE battle_id = p_battle;

  COMMIT;
END //



-- Called only inside a transaction holding the battle row lock.
-- p_forfeit_user is NULL for normal timeout completion.
-- A non-NULL value identifies the forfeiting challenger.
CREATE PROCEDURE finish_battle_core (
  IN p_battle INT,
  IN p_forfeit_user INT
)
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_limit INT;
  DECLARE v_starters JSON;

  DECLARE v_count INT DEFAULT 0;
  DECLARE v_u1 INT DEFAULT NULL;
  DECLARE v_u2 INT DEFAULT NULL;
  DECLARE v_s1 INT DEFAULT 0;
  DECLARE v_s2 INT DEFAULT 0;
  DECLARE v_t1 INT DEFAULT NULL;
  DECLARE v_t2 INT DEFAULT NULL;
  DECLARE v_join2 DATETIME;

  DECLARE v_winner INT DEFAULT NULL;
  DECLARE v_reason VARCHAR(10) DEFAULT 'Normal';

  SELECT status, time_limit, starting_elements
  INTO v_status, v_limit, v_starters
  FROM battle
  WHERE battle_id = p_battle;

  IF v_status <> 'Active' OR v_starters IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Battle cannot be finalized';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM battle_player
  WHERE battle_id = p_battle;

  IF v_count <> 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Both players must participate';
  END IF;

  -- Player 1 is the first participant.
  SELECT user_id, score, completion_time
  INTO v_u1, v_s1, v_t1
  FROM battle_player
  WHERE battle_id = p_battle
  ORDER BY joined_at, user_id
  LIMIT 1;

  -- Player 2 is the second participant.
  SELECT user_id, score, completion_time, joined_at
  INTO v_u2, v_s2, v_t2, v_join2
  FROM battle_player
  WHERE battle_id = p_battle
  ORDER BY joined_at, user_id
  LIMIT 1 OFFSET 1;

  IF p_forfeit_user IS NOT NULL THEN

    IF p_forfeit_user <> v_u2 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only Player 2 can forfeit';
    END IF;

    IF NOW() >= DATE_ADD(v_join2, INTERVAL v_limit SECOND) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Player 2 turn already expired';
    END IF;

    -- A forfeit always gives Player 1 the win.
    SET v_winner = v_u1;
    SET v_reason = 'Forfeit';

  ELSE

    -- Normal completion is forbidden before the deadline.
    IF NOW() < DATE_ADD(v_join2, INTERVAL v_limit SECOND) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Player 2 timer has not expired';
    END IF;

    IF v_s1 > v_s2 THEN
      SET v_winner = v_u1;

    ELSEIF v_s2 > v_s1 THEN
      SET v_winner = v_u2;

    -- Same score: use completion time.
    ELSEIF v_t1 IS NULL AND v_t2 IS NULL THEN
      SET v_winner = NULL;

    ELSEIF v_t1 IS NULL THEN
      SET v_winner = v_u2;

    ELSEIF v_t2 IS NULL THEN
      SET v_winner = v_u1;

    ELSEIF v_t1 < v_t2 THEN
      SET v_winner = v_u1;

    ELSEIF v_t2 < v_t1 THEN
      SET v_winner = v_u2;

    ELSE
      SET v_winner = NULL;
    END IF;

  END IF;

  -- The Active -> Completed transition is the reward guard.
  UPDATE battle
  SET status = 'Completed',
      end_time = NOW(),
      winner_id = v_winner,
      end_reason = v_reason
  WHERE battle_id = p_battle
    AND status = 'Active';

  IF ROW_COUNT() = 1 THEN

    -- Preserve the original XP and win/loss rules.
    UPDATE app_user u
    JOIN battle_player bp
      ON bp.user_id = u.user_id
     AND bp.battle_id = p_battle
    SET u.xp = u.xp + IF(u.user_id <=> v_winner, 100, 25),
        u.total_wins = u.total_wins
          + IF(u.user_id <=> v_winner, 1, 0),
        u.total_losses = u.total_losses
          + IF(
              v_winner IS NOT NULL
              AND u.user_id <> v_winner,
              1,
              0
            );

    IF v_winner IS NOT NULL THEN
      CALL bump_challenge(v_winner, 'BATTLE_WIN', 1);
      CALL grant_achievements(v_winner);
    END IF;

  END IF;
END //


-- Backward-compatible entry point.
-- Never ends a battle before its server-side deadline.
CREATE PROCEDURE finish_battle (IN p_battle INT)
BEGIN
  CALL advance_battle(p_battle);
END //


-- A player may use only their starting elements and
-- results they successfully unlocked during this battle.
CREATE PROCEDURE battle_combine (
  IN p_battle INT,
  IN p_user INT,
  IN p_e1 INT,
  IN p_e2 INT
)
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_limit INT;
  DECLARE v_starters JSON;
  DECLARE v_joined DATETIME DEFAULT NULL;

  DECLARE v_lo INT;
  DECLARE v_hi INT;
  DECLARE v_recipe INT DEFAULT NULL;
  DECLARE v_result INT DEFAULT NULL;
  DECLARE v_reward INT DEFAULT 0;
  DECLARE v_diff INT DEFAULT 0;
  DECLARE v_pts INT DEFAULT 0;
  DECLARE v_seq INT;
  DECLARE v_outcome VARCHAR(20);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  -- Lock the battle to serialize attempts and finalization.
  SELECT status, time_limit, starting_elements
  INTO v_status, v_limit, v_starters
  FROM battle
  WHERE battle_id = p_battle
  FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Battle not found';
  END IF;

  IF v_starters IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This is a legacy battle';
  END IF;

  SELECT joined_at INTO v_joined
  FROM battle_player
  WHERE battle_id = p_battle
    AND user_id = p_user;

  IF v_joined IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'You are not a player in this battle';
  END IF;

  -- Handle expired turns before accepting the attempt.
  CALL advance_battle_core(p_battle);

  SELECT status INTO v_status
  FROM battle
  WHERE battle_id = p_battle;

  IF v_status <> 'Active'
     OR NOW() >= DATE_ADD(v_joined, INTERVAL v_limit SECOND) THEN

    COMMIT;

    SELECT
      'TIME_UP' AS outcome,
      0 AS points_earned,
      NULL AS result_element_id;

  ELSE

    SET v_lo = LEAST(p_e1, p_e2);
    SET v_hi = GREATEST(p_e1, p_e2);

    IF v_lo IS NULL OR v_hi IS NULL
       OR v_lo < 1 OR v_hi < 1 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid element IDs';
    END IF;

    IF (
      SELECT COUNT(*)
      FROM element
      WHERE element_id IN (v_lo, v_hi)
        AND is_active = TRUE
    ) < IF(v_lo = v_hi, 1, 2) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Unknown or inactive element';
    END IF;

    -- Input 1 must belong to THIS player's battle collection.
    IF NOT (
      JSON_CONTAINS(v_starters, JSON_ARRAY(v_lo))
      OR EXISTS (
        SELECT 1
        FROM battle_action ba
        WHERE ba.battle_id = p_battle
          AND ba.user_id = p_user
          AND ba.success = TRUE
          AND ba.result_element_id = v_lo
      )
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'First element is locked in this battle';
    END IF;

    -- Input 2 must also belong to THIS player's collection.
    IF NOT (
      JSON_CONTAINS(v_starters, JSON_ARRAY(v_hi))
      OR EXISTS (
        SELECT 1
        FROM battle_action ba
        WHERE ba.battle_id = p_battle
          AND ba.user_id = p_user
          AND ba.success = TRUE
          AND ba.result_element_id = v_hi
      )
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Second element is locked in this battle';
    END IF;

    -- Lookup the canonical pair and require an active result.
    SELECT r.recipe_id,
           r.result_element_id,
           r.xp_reward,
           r.difficulty
    INTO v_recipe, v_result, v_reward, v_diff
    FROM recipe r
    JOIN element e ON e.element_id = r.result_element_id
    WHERE r.element1_id = v_lo
      AND r.element2_id = v_hi
      AND e.is_active = TRUE
    LIMIT 1;

    SELECT COALESCE(MAX(action_seq), 0) + 1
    INTO v_seq
    FROM battle_action
    WHERE battle_id = p_battle;

    IF v_recipe IS NULL THEN
      SET v_outcome = 'FAIL';

    ELSEIF EXISTS (
      SELECT 1
      FROM battle_action
      WHERE battle_id = p_battle
        AND user_id = p_user
        AND recipe_id = v_recipe
        AND success = TRUE
    ) THEN
      SET v_outcome = 'DUPLICATE';

    ELSE
      SET v_outcome = 'SUCCESS';
      SET v_pts = v_reward + v_diff * 5;
    END IF;

    -- Record successful, failed and duplicate attempts.
    INSERT INTO battle_action (
      battle_id,
      action_seq,
      user_id,
      recipe_id,
      element1_id,
      element2_id,
      result_element_id,
      success,
      points_earned
    )
    VALUES (
      p_battle,
      v_seq,
      p_user,
      v_recipe,
      v_lo,
      v_hi,
      v_result,
      (v_outcome = 'SUCCESS'),
      v_pts
    );

    IF v_outcome = 'SUCCESS' THEN
      UPDATE battle_player
      SET score = score + v_pts,
          combinations_completed = combinations_completed + 1,
          completion_time = TIMESTAMPDIFF(
            SECOND,
            v_joined,
            NOW()
          )
      WHERE battle_id = p_battle
        AND user_id = p_user;
    END IF;

    COMMIT;

    SELECT
      v_outcome AS outcome,
      v_pts AS points_earned,
      v_result AS result_element_id;

  END IF;
END //



-- =============================================================
-- ASYNCHRONOUS BATTLE TIMER MANAGEMENT
-- =============================================================

-- Must be called inside a transaction that already locked battle.
CREATE PROCEDURE advance_battle_core (IN p_battle INT)
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_start DATETIME;
  DECLARE v_limit INT;
  DECLARE v_starters JSON;
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_latest_join DATETIME;

  SELECT status, start_time, time_limit, starting_elements
  INTO v_status, v_start, v_limit, v_starters
  FROM battle
  WHERE battle_id = p_battle;

  -- Do not migrate or refinalize historical battles.
  IF v_status = 'Active'
     AND v_start IS NOT NULL
     AND v_starters IS NOT NULL THEN

    SELECT COUNT(*), MAX(joined_at)
    INTO v_count, v_latest_join
    FROM battle_player
    WHERE battle_id = p_battle;

    -- Player 1's turn expired: publish the challenge.
    IF v_count = 1
       AND NOW() >= DATE_ADD(v_start, INTERVAL v_limit SECOND) THEN

      UPDATE battle
      SET status = 'Pending'
      WHERE battle_id = p_battle
        AND status = 'Active';

    -- Player 2's turn expired: finalize the full battle.
    ELSEIF v_count = 2
       AND NOW() >= DATE_ADD(v_latest_join, INTERVAL v_limit SECOND) THEN

      CALL finish_battle_core(p_battle, NULL);

    END IF;
  END IF;
END //


-- Public, transaction-safe timer advancement.
CREATE PROCEDURE advance_battle (IN p_battle INT)
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status INTO v_status
  FROM battle
  WHERE battle_id = p_battle
  FOR UPDATE;

  IF v_status = 'Active' THEN
    CALL advance_battle_core(p_battle);
  END IF;

  COMMIT;
END //



-- Process expired turns without relying on a player's browser.
-- No cursor is held across a transaction commit.
CREATE PROCEDURE refresh_expired_battles ()
BEGIN
  DECLARE v_battle INT DEFAULT NULL;

  expired_loop: LOOP
    SET v_battle = NULL;

    SELECT MIN(b.battle_id)
    INTO v_battle
    FROM battle b
    WHERE b.status = 'Active'
      AND b.starting_elements IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM battle_player bp
        WHERE bp.battle_id = b.battle_id
      )
      AND NOW() >= DATE_ADD(
        (
          SELECT MAX(bp.joined_at)
          FROM battle_player bp
          WHERE bp.battle_id = b.battle_id
        ),
        INTERVAL b.time_limit SECOND
      );

    IF v_battle IS NULL THEN
      LEAVE expired_loop;
    END IF;

    -- Each call locks the battle and commits independently.
    CALL advance_battle(v_battle);
  END LOOP;
END //



-- =============================================================
-- HOST CANCELLATION
-- =============================================================

CREATE PROCEDURE cancel_battle (
  IN p_battle INT,
  IN p_user INT
)
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_start DATETIME;
  DECLARE v_starters JSON;
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_host INT DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status, start_time, starting_elements
  INTO v_status, v_start, v_starters
  FROM battle
  WHERE battle_id = p_battle
  FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Battle not found';
  END IF;

  IF v_start IS NULL OR v_starters IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Legacy battle cannot be cancelled here';
  END IF;

  CALL advance_battle_core(p_battle);

  SELECT status INTO v_status
  FROM battle
  WHERE battle_id = p_battle;

  SELECT COUNT(*) INTO v_count
  FROM battle_player
  WHERE battle_id = p_battle;

  SELECT user_id INTO v_host
  FROM battle_player
  WHERE battle_id = p_battle
  ORDER BY joined_at, user_id
  LIMIT 1;

  IF v_host <> p_user THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Only the host can cancel the challenge';
  END IF;

  IF v_count <> 1 OR v_status NOT IN ('Active', 'Pending') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Challenge cannot be cancelled after acceptance';
  END IF;

  UPDATE battle
  SET status = 'Cancelled',
      end_time = NOW(),
      winner_id = NULL,
      end_reason = NULL
  WHERE battle_id = p_battle;

  COMMIT;
END //


-- =============================================================
-- CHALLENGER FORFEIT
-- =============================================================

CREATE PROCEDURE forfeit_battle (
  IN p_battle INT,
  IN p_user INT
)
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status INTO v_status
  FROM battle
  WHERE battle_id = p_battle
  FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Battle not found';
  END IF;

  -- Expired turns must complete normally, not as forfeits.
  CALL advance_battle_core(p_battle);

  SELECT status INTO v_status
  FROM battle
  WHERE battle_id = p_battle;

  IF v_status <> 'Active' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Challenge is no longer accepting forfeits';
  END IF;

  -- The core validates that p_user is Player 2
  -- and that Player 2's timer has not expired.
  CALL finish_battle_core(p_battle, p_user);

  COMMIT;
END //


-- =============================================================
-- AUTOMATIC DATABASE CLOCK
-- =============================================================

CREATE EVENT ev_async_battle_clock
ON SCHEDULE EVERY 1 SECOND
ON COMPLETION PRESERVE
ENABLE
DO
  CALL refresh_expired_battles() //


DELIMITER ;

-- ---------------------------------------------------------------------
-- VIEWS  (leaderboards are computed on read, never stored twice)
-- ---------------------------------------------------------------------

CREATE VIEW leaderboard_xp_view AS
SELECT u.user_id, u.username, u.avatar_url, u.xp, u.level,
       (SELECT COUNT(*) FROM user_element ue WHERE ue.user_id = u.user_id) AS elements_owned,
       RANK() OVER (ORDER BY u.xp DESC) AS xp_rank
  FROM app_user u;

CREATE VIEW leaderboard_discoveries_view AS
SELECT u.user_id, u.username, COUNT(d.discovery_id) AS discoveries,
       RANK() OVER (ORDER BY COUNT(d.discovery_id) DESC) AS disc_rank
  FROM app_user u LEFT JOIN discovery d ON d.user_id = u.user_id
 GROUP BY u.user_id, u.username;

CREATE VIEW leaderboard_weekly_view AS
SELECT u.user_id, u.username, COALESCE(SUM(d.xp_earned), 0) AS weekly_xp, COUNT(d.discovery_id) AS weekly_discoveries,
       RANK() OVER (ORDER BY COALESCE(SUM(d.xp_earned), 0) DESC) AS weekly_rank
  FROM app_user u
  LEFT JOIN discovery d ON d.user_id = u.user_id AND d.discovered_at >= NOW() - INTERVAL 7 DAY
 GROUP BY u.user_id, u.username;

CREATE VIEW leaderboard_first_view AS
SELECT u.user_id, u.username, COUNT(d.discovery_id) AS first_discoveries,
       RANK() OVER (ORDER BY COUNT(d.discovery_id) DESC) AS first_rank
  FROM app_user u LEFT JOIN discovery d ON d.user_id = u.user_id AND d.is_first_discovery
 GROUP BY u.user_id, u.username;

CREATE VIEW player_statistics_view AS
SELECT u.user_id, u.username, u.xp, u.level, u.total_wins, u.total_losses,
       (SELECT COUNT(*) FROM discovery d WHERE d.user_id = u.user_id) AS discoveries,
       (SELECT COUNT(*) FROM discovery d WHERE d.user_id = u.user_id AND d.is_first_discovery) AS first_discoveries,
       (SELECT COUNT(*) FROM user_achievement ua WHERE ua.user_id = u.user_id AND ua.status = 'Earned') AS achievements,
       (SELECT COUNT(*) FROM user_element ue JOIN element e ON e.element_id = ue.element_id
         WHERE ue.user_id = u.user_id AND e.is_active) AS elements_owned,
       (SELECT COUNT(*) FROM element e WHERE e.is_active) AS elements_total,
       ROUND(100 * (SELECT COUNT(*) FROM user_element ue JOIN element e ON e.element_id = ue.element_id
                     WHERE ue.user_id = u.user_id AND e.is_active)
                 / GREATEST((SELECT COUNT(*) FROM element e WHERE e.is_active), 1), 1) AS collection_pct
  FROM app_user u;

CREATE VIEW recent_first_discoveries_view AS
SELECT d.discovery_id, d.discovered_at, u.username, e.element_id, e.name AS element_name, e.icon_url, e.rarity
  FROM discovery d
  JOIN app_user u ON u.user_id = d.user_id
  JOIN recipe r   ON r.recipe_id = d.recipe_id
  JOIN element e  ON e.element_id = r.result_element_id
 WHERE d.is_first_discovery
 ORDER BY d.discovered_at DESC;

CREATE VIEW battle_history_view AS
SELECT b.battle_id, b.name, b.status, b.start_time, b.end_time, b.winner_id,
       bp.user_id, bp.score, bp.combinations_completed
  FROM battle b JOIN battle_player bp ON bp.battle_id = b.battle_id;
