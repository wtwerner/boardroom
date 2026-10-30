ALTER TABLE `date_poll` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `date_poll_option` ADD `fell_through_at` integer;--> statement-breakpoint
ALTER TABLE `date_poll_vote` ADD `answer` text DEFAULT 'yes' NOT NULL;--> statement-breakpoint
ALTER TABLE `game_night` ADD `finding_date` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- A poll's night is made when the poll is, and holds its name, place and post. Picked polls already have one; a picked poll whose night was deleted goes.
DELETE FROM `date_poll_vote` WHERE `option_id` IN (SELECT o.`id` FROM `date_poll_option` o JOIN `date_poll` p ON p.`id` = o.`poll_id` WHERE p.`game_night_id` IS NULL AND p.`status` = 'picked');--> statement-breakpoint
DELETE FROM `date_poll_option` WHERE `poll_id` IN (SELECT `id` FROM `date_poll` WHERE `game_night_id` IS NULL AND `status` = 'picked');--> statement-breakpoint
DELETE FROM `date_poll` WHERE `game_night_id` IS NULL AND `status` = 'picked';--> statement-breakpoint
-- A night that went back to finding a date keeps the date that fell through, as one of its poll's
INSERT INTO `date_poll_option` (`poll_id`, `starts_at`, `fell_through_at`)
SELECT p.`id`, g.`starts_at`, g.`updated_at` FROM `date_poll` p JOIN `game_night` g ON g.`id` = p.`game_night_id`
WHERE p.`status` <> 'picked' AND NOT EXISTS (SELECT 1 FROM `date_poll_option` o WHERE o.`poll_id` = p.`id` AND o.`starts_at` = g.`starts_at`);--> statement-breakpoint
-- ...and is finding its date again rather than hidden as cancelled, with the poll's post
UPDATE `game_night` SET
  `finding_date` = 1,
  `date` = NULL,
  `cancelled` = CASE WHEN p.`status` = 'open' THEN 0 ELSE 1 END,
  `title` = coalesce(p.`title`, ''),
  `location` = coalesce(p.`location`, `game_night`.`location`),
  `starts_at` = coalesce((SELECT min(o.`starts_at`) FROM `date_poll_option` o WHERE o.`poll_id` = p.`id` AND o.`fell_through_at` IS NULL), `game_night`.`starts_at`),
  `channel_id` = p.`channel_id`,
  `message_id` = p.`message_id`,
  `thread_id` = p.`thread_id`,
  `thread_card_id` = p.`thread_card_id`,
  `announce_channel_id` = p.`announce_channel_id`,
  `announce_message_id` = p.`announce_message_id`,
  `url` = p.`url`,
  `reminded_at` = NULL
FROM `date_poll` p WHERE p.`game_night_id` = `game_night`.`id` AND p.`status` <> 'picked';--> statement-breakpoint
-- A poll that never had a night gets one, finding its date (cancelled when the poll was called off or every date went by)
INSERT INTO `game_night` (`night`, `title`, `starts_at`, `location`, `cancelled`, `finding_date`, `channel_id`, `message_id`, `thread_id`, `thread_card_id`, `announce_channel_id`, `announce_message_id`, `url`, `created_by`, `log_copy_id`, `created_at`, `updated_at`)
SELECT p.`night`, coalesce(p.`title`, ''), coalesce((SELECT min(o.`starts_at`) FROM `date_poll_option` o WHERE o.`poll_id` = p.`id`), p.`created_at`), p.`location`,
  CASE WHEN p.`status` = 'open' THEN 0 ELSE 1 END, 1, p.`channel_id`, p.`message_id`, p.`thread_id`, p.`thread_card_id`, p.`announce_channel_id`, p.`announce_message_id`, p.`url`,
  p.`created_by`, 'poll:' || p.`id`, p.`created_at`, p.`updated_at`
FROM `date_poll` p WHERE p.`game_night_id` IS NULL;--> statement-breakpoint
UPDATE `date_poll` SET `game_night_id` = (SELECT g.`id` FROM `game_night` g WHERE g.`log_copy_id` = 'poll:' || `date_poll`.`id`) WHERE `game_night_id` IS NULL;--> statement-breakpoint
UPDATE `game_night` SET `log_copy_id` = NULL WHERE `log_copy_id` LIKE 'poll:%';--> statement-breakpoint
UPDATE `date_poll` SET `closed_at` = `updated_at` WHERE `status` = 'closed';
