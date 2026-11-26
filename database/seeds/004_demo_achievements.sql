-- 004_demo_achievements: the demo users unlock a few achievements by name, so the achievements
-- and activity features have data to show. Uses the achievement lists that 002_rawg_games.sql
-- imports for the demo games; without that seed this file inserts nothing.
-- Apply after migration 003 and the other seeds. Idempotent: INSERT IGNORE skips rows that exist.
-- Each unlock fires the triggers from 003: the library counter rises if needed and is logged.

INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
SELECT 1, a.id, '2026-10-30 21:00:00' FROM achievements a WHERE a.game_id = 'elden-ring' ORDER BY a.id LIMIT 6;

INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
SELECT 1, a.id, '2026-10-26 20:30:00' FROM achievements a WHERE a.game_id = 'witcher-3' ORDER BY a.id LIMIT 4;

INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
SELECT 2, a.id, '2026-10-19 22:00:00' FROM achievements a WHERE a.game_id = 'elden-ring' ORDER BY a.id LIMIT 3;

INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
SELECT 3, a.id, '2026-10-01 23:15:00' FROM achievements a WHERE a.game_id = 'doom-eternal' ORDER BY a.id LIMIT 5;

INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
SELECT 4, a.id, '2026-10-27 19:45:00' FROM achievements a WHERE a.game_id = 'baldurs-gate-3' ORDER BY a.id LIMIT 4;
