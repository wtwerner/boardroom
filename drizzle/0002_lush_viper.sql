CREATE TABLE `date_poll` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`night` text DEFAULT 'core' NOT NULL,
	`title` text,
	`location` text,
	`status` text DEFAULT 'open' NOT NULL,
	`game_night_id` integer,
	`channel_id` text,
	`message_id` text,
	`thread_id` text,
	`url` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_night_id`) REFERENCES `game_night`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `date_poll_option` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `date_poll`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `date_poll_option_poll_idx` ON `date_poll_option` (`poll_id`);--> statement-breakpoint
CREATE TABLE `date_poll_vote` (
	`option_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`voted_at` integer NOT NULL,
	PRIMARY KEY(`option_id`, `player_id`),
	FOREIGN KEY (`option_id`) REFERENCES `date_poll_option`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE cascade
);
