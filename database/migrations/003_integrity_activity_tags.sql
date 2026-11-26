-- 003: integrity rules, achievements, activity history and tags (Database Architect: Amit Sahoo).
--   1. CHECK constraints 001/002 were missing (slugs, years, URLs, usernames, password hashes …).
--   2. Tags split from genres: genres are RAWG's 19 genres, everything else ("Open World",
--      "Souls-like", "Action RPG") becomes a tag. Removes overlaps like Action / Action RPG / RPG.
--   3. `achievements` (a game's achievement list) and `user_achievements` (who unlocked what).
--   4. `activity`: an append-only history of library changes, written only by triggers.
--   5. Triggers: unlocked achievements can never exceed the game's total, and every library
--      change is logged to `activity`.
-- Works on an empty database and on one that already holds data (it backfills).
-- Triggers contain `;`, so this file uses DELIMITER like the mysql client and Workbench do;
-- `npm run db:migrate` understands it too.
-- Never edit this file once applied anywhere; add 004_*.sql instead.

SET @old_safe_updates = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

-- 1. Missing CHECK constraints --------------------------------------------------------------
-- REGEXP_LIKE(…, 'c') is case-sensitive; plain REGEXP follows the column's case-insensitive collation.

ALTER TABLE games
  ADD CONSTRAINT chk_games_id           CHECK (REGEXP_LIKE(id, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c')),
  ADD CONSTRAINT chk_games_title        CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  ADD CONSTRAINT chk_games_release_year CHECK (release_year BETWEEN 1950 AND 2100),
  ADD CONSTRAINT chk_games_storage      CHECK (storage_gb IS NULL OR storage_gb > 0),
  ADD CONSTRAINT chk_games_cover_url    CHECK (cover_url IS NULL OR REGEXP_LIKE(cover_url, '^https?://', 'c')),
  ADD CONSTRAINT chk_games_banner_url   CHECK (banner_url IS NULL OR REGEXP_LIKE(banner_url, '^https?://', 'c')),
  ADD CONSTRAINT chk_games_summary      CHECK (summary IS NULL OR CHAR_LENGTH(summary) <= 5000);

-- Same rules as the sign-up endpoint (backend/routes/auth.ts). A bcrypt hash is always
-- "$2a$/$2b$/$2y$", a two-digit cost, "$", then 53 characters: plain text can never be stored.
ALTER TABLE users
  ADD CONSTRAINT chk_users_username      CHECK (REGEXP_LIKE(username, '^[A-Za-z0-9_-]{3,50}$', 'c')),
  ADD CONSTRAINT chk_users_password_hash CHECK (password_hash IS NULL
                                                OR REGEXP_LIKE(password_hash, '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$', 'c'));

ALTER TABLE user_games
  ADD CONSTRAINT chk_user_games_notes CHECK (notes IS NULL OR CHAR_LENGTH(notes) <= 5000);

ALTER TABLE companies ADD CONSTRAINT chk_companies_name CHECK (CHAR_LENGTH(TRIM(name)) > 0);
ALTER TABLE platforms ADD CONSTRAINT chk_platforms_name CHECK (CHAR_LENGTH(TRIM(name)) > 0);

-- 2. Tags split from genres -----------------------------------------------------------------

CREATE TABLE tags (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(50) NOT NULL UNIQUE,
  CONSTRAINT chk_tags_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
);

CREATE TABLE game_tags (
  game_id  VARCHAR(100) NOT NULL,
  tag_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (game_id, tag_id),
  INDEX idx_game_tags_tag (tag_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);

-- Every name that is not one of RAWG's genres moves to tags, keeping its links to games.
INSERT INTO tags (name)
SELECT name FROM genres
 WHERE name NOT IN ('Action', 'Adventure', 'Arcade', 'Board Games', 'Card', 'Casual', 'Educational',
                    'Family', 'Fighting', 'Indie', 'Massively Multiplayer', 'Platformer', 'Puzzle',
                    'Racing', 'RPG', 'Shooter', 'Simulation', 'Sports', 'Strategy');

INSERT INTO game_tags (game_id, tag_id)
SELECT gg.game_id, t.id
  FROM game_genres gg
  JOIN genres ge ON ge.id = gg.genre_id
  JOIN tags t    ON t.name = ge.name;

-- Tags that imply a genre keep the game in that genre (an "Action RPG" is Action and RPG).
INSERT IGNORE INTO genres (name)
SELECT DISTINCT m.genre
  FROM (SELECT 'Action RPG' AS tag, 'Action' AS genre
        UNION ALL SELECT 'Action RPG', 'RPG'
        UNION ALL SELECT 'FPS', 'Shooter'
        UNION ALL SELECT '4X', 'Strategy'
        UNION ALL SELECT 'Driving', 'Racing') AS m
  JOIN tags t ON t.name = m.tag;

INSERT IGNORE INTO game_genres (game_id, genre_id)
SELECT gt.game_id, ge.id
  FROM (SELECT 'Action RPG' AS tag, 'Action' AS genre
        UNION ALL SELECT 'Action RPG', 'RPG'
        UNION ALL SELECT 'FPS', 'Shooter'
        UNION ALL SELECT '4X', 'Strategy'
        UNION ALL SELECT 'Driving', 'Racing') AS m
  JOIN tags t       ON t.name = m.tag
  JOIN game_tags gt ON gt.tag_id = t.id
  JOIN genres ge    ON ge.name = m.genre;

-- Removing the moved names from genres also removes their game_genres rows (ON DELETE CASCADE).
DELETE FROM genres WHERE name IN (SELECT name FROM tags);

-- From now on a genre can only be one of RAWG's 19; anything else belongs in tags.
ALTER TABLE genres
  ADD CONSTRAINT chk_genres_name CHECK (name IN (
    'Action', 'Adventure', 'Arcade', 'Board Games', 'Card', 'Casual', 'Educational', 'Family',
    'Fighting', 'Indie', 'Massively Multiplayer', 'Platformer', 'Puzzle', 'Racing', 'RPG',
    'Shooter', 'Simulation', 'Sports', 'Strategy'));

-- 3. Achievements ---------------------------------------------------------------------------

-- The achievements a game has (imported from RAWG). games.achievements_total stays the total
-- RAWG reports; this table lists the ones we know by name, which can be fewer.
CREATE TABLE achievements (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  game_id      VARCHAR(100) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  description  VARCHAR(500) NULL,
  image_url    VARCHAR(500) NULL,
  UNIQUE KEY uq_achievements_game_name (game_id, name),
  CONSTRAINT chk_achievements_name  CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_achievements_image CHECK (image_url IS NULL OR REGEXP_LIKE(image_url, '^https?://', 'c')),
  CONSTRAINT fk_achievements_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Which user unlocked which achievement, and when. The game is not stored again here: it is
-- the achievement's game (storing it would be a partial dependency, a 2NF violation).
-- A trigger checks the game is in the user's library, since a foreign key cannot reach it.
CREATE TABLE user_achievements (
  user_id         INT UNSIGNED NOT NULL,
  achievement_id  INT UNSIGNED NOT NULL,
  unlocked_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id),
  INDEX idx_user_achievements_achievement (achievement_id),
  CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_achievements_achievement FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

-- 4. Activity history -----------------------------------------------------------------------

-- Append-only: rows are written by the triggers below, never by the API. game_id is not a
-- foreign key to user_games because the history outlives removing a game from the library.
-- old_value/new_value hold the changed field's value as text (status name, score, hours …).
CREATE TABLE activity (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  game_id     VARCHAR(100) NOT NULL,
  type        ENUM('ADDED', 'REMOVED', 'STATUS', 'SCORE', 'HOURS', 'FAVORITE', 'ACHIEVEMENTS', 'REVIEW') NOT NULL,
  old_value   VARCHAR(50) NULL,
  new_value   VARCHAR(50) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_user_time (user_id, created_at),
  INDEX idx_activity_game (game_id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Backfill the history from what is already there, at the times the rows recorded.
INSERT INTO activity (user_id, game_id, type, new_value, created_at)
SELECT user_id, game_id, 'ADDED', status, updated_at FROM user_games;

INSERT INTO activity (user_id, game_id, type, new_value, created_at)
SELECT user_id, game_id, 'HOURS', CAST(hours_played AS CHAR), last_played_at
  FROM user_games
 WHERE last_played_at IS NOT NULL AND hours_played > 0;

INSERT INTO activity (user_id, game_id, type, new_value, created_at)
SELECT user_id, game_id, 'REVIEW', 'posted', created_at FROM reviews;

SET SQL_SAFE_UPDATES = @old_safe_updates;

-- 5. Triggers -------------------------------------------------------------------------------
-- Error numbers match what MySQL itself raises, so the API's error handler already maps them:
-- 3819 (check constraint violated) → 400, 1452 (foreign key fails) → 409.

DELIMITER $$

-- Unlocked achievements stay between the ones unlocked by name and the game's total.
CREATE TRIGGER trg_user_games_before_insert
BEFORE INSERT ON user_games
FOR EACH ROW
BEGIN
  IF NEW.achievements_unlocked > (SELECT achievements_total FROM games WHERE id = NEW.game_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 3819,
      MESSAGE_TEXT = 'achievements_unlocked cannot be more than the game''s achievements_total';
  END IF;
END$$

CREATE TRIGGER trg_user_games_before_update
BEFORE UPDATE ON user_games
FOR EACH ROW
BEGIN
  IF NEW.achievements_unlocked > (SELECT achievements_total FROM games WHERE id = NEW.game_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 3819,
      MESSAGE_TEXT = 'achievements_unlocked cannot be more than the game''s achievements_total';
  END IF;
  IF NEW.achievements_unlocked < (SELECT COUNT(*)
                                    FROM user_achievements ua
                                    JOIN achievements a ON a.id = ua.achievement_id
                                   WHERE ua.user_id = NEW.user_id AND a.game_id = NEW.game_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 3819,
      MESSAGE_TEXT = 'achievements_unlocked cannot be less than the achievements unlocked by name';
  END IF;
END$$

-- Lowering a game's total (for example a RAWG re-import) lowers anyone above it to the new total.
CREATE TRIGGER trg_games_after_update
AFTER UPDATE ON games
FOR EACH ROW
BEGIN
  IF NEW.achievements_total < OLD.achievements_total THEN
    UPDATE user_games
       SET achievements_unlocked = NEW.achievements_total
     WHERE game_id = NEW.id AND achievements_unlocked > NEW.achievements_total;
  END IF;
END$$

-- An achievement can only be unlocked for a game in the user's library.
CREATE TRIGGER trg_user_achievements_before_insert
BEFORE INSERT ON user_achievements
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1
                   FROM achievements a
                   JOIN user_games ug ON ug.game_id = a.game_id AND ug.user_id = NEW.user_id
                  WHERE a.id = NEW.achievement_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 1452,
      MESSAGE_TEXT = 'cannot unlock an achievement for a game that is not in the user''s library';
  END IF;
END$$

-- Unlocking by name raises the library counter if needed (which logs an ACHIEVEMENTS activity).
CREATE TRIGGER trg_user_achievements_after_insert
AFTER INSERT ON user_achievements
FOR EACH ROW
BEGIN
  DECLARE v_game VARCHAR(100);
  SELECT game_id INTO v_game FROM achievements WHERE id = NEW.achievement_id;
  UPDATE user_games ug
     SET ug.achievements_unlocked = GREATEST(ug.achievements_unlocked,
           (SELECT COUNT(*)
              FROM user_achievements ua
              JOIN achievements a ON a.id = ua.achievement_id
             WHERE ua.user_id = NEW.user_id AND a.game_id = v_game))
   WHERE ug.user_id = NEW.user_id AND ug.game_id = v_game;
END$$

-- Activity history: one row per change to a library entry.
CREATE TRIGGER trg_user_games_after_insert
AFTER INSERT ON user_games
FOR EACH ROW
BEGIN
  INSERT INTO activity (user_id, game_id, type, new_value, created_at)
  VALUES (NEW.user_id, NEW.game_id, 'ADDED', NEW.status, UTC_TIMESTAMP());
END$$

CREATE TRIGGER trg_user_games_after_update
AFTER UPDATE ON user_games
FOR EACH ROW
BEGIN
  IF NOT (OLD.status <=> NEW.status) THEN
    INSERT INTO activity (user_id, game_id, type, old_value, new_value, created_at)
    VALUES (NEW.user_id, NEW.game_id, 'STATUS', OLD.status, NEW.status, UTC_TIMESTAMP());
  END IF;
  IF NOT (OLD.score <=> NEW.score) THEN
    INSERT INTO activity (user_id, game_id, type, old_value, new_value, created_at)
    VALUES (NEW.user_id, NEW.game_id, 'SCORE', OLD.score, NEW.score, UTC_TIMESTAMP());
  END IF;
  IF OLD.hours_played <> NEW.hours_played THEN
    INSERT INTO activity (user_id, game_id, type, old_value, new_value, created_at)
    VALUES (NEW.user_id, NEW.game_id, 'HOURS', OLD.hours_played, NEW.hours_played, UTC_TIMESTAMP());
  END IF;
  IF OLD.is_favorite <> NEW.is_favorite THEN
    INSERT INTO activity (user_id, game_id, type, old_value, new_value, created_at)
    VALUES (NEW.user_id, NEW.game_id, 'FAVORITE',
            IF(OLD.is_favorite, 'true', 'false'), IF(NEW.is_favorite, 'true', 'false'), UTC_TIMESTAMP());
  END IF;
  IF OLD.achievements_unlocked <> NEW.achievements_unlocked THEN
    INSERT INTO activity (user_id, game_id, type, old_value, new_value, created_at)
    VALUES (NEW.user_id, NEW.game_id, 'ACHIEVEMENTS', OLD.achievements_unlocked, NEW.achievements_unlocked, UTC_TIMESTAMP());
  END IF;
END$$

-- Removing a game from the library also forgets its unlocked achievements.
CREATE TRIGGER trg_user_games_after_delete
AFTER DELETE ON user_games
FOR EACH ROW
BEGIN
  DELETE ua
    FROM user_achievements ua
    JOIN achievements a ON a.id = ua.achievement_id
   WHERE ua.user_id = OLD.user_id AND a.game_id = OLD.game_id;
  INSERT INTO activity (user_id, game_id, type, old_value, created_at)
  VALUES (OLD.user_id, OLD.game_id, 'REMOVED', OLD.status, UTC_TIMESTAMP());
END$$

CREATE TRIGGER trg_reviews_after_insert
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
  INSERT INTO activity (user_id, game_id, type, new_value, created_at)
  VALUES (NEW.user_id, NEW.game_id, 'REVIEW', 'posted', UTC_TIMESTAMP());
END$$

CREATE TRIGGER trg_reviews_after_update
AFTER UPDATE ON reviews
FOR EACH ROW
BEGIN
  IF OLD.body <> NEW.body THEN
    INSERT INTO activity (user_id, game_id, type, new_value, created_at)
    VALUES (NEW.user_id, NEW.game_id, 'REVIEW', 'edited', UTC_TIMESTAMP());
  END IF;
END$$

DELIMITER ;
