ALTER TABLE `player` ADD `calendar_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `player_calendar_token_unique` ON `player` (`calendar_token`);