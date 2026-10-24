CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bga_game` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`bgg_id` integer,
	`premium` integer NOT NULL,
	`player_counts` text NOT NULL,
	`average_duration` integer,
	`realtime` integer NOT NULL,
	`turn_based` integer NOT NULL,
	`beta` integer NOT NULL,
	`games_played` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bga_game_bgg_idx` ON `bga_game` (`bgg_id`);--> statement-breakpoint
CREATE TABLE `catalog_game` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collection_item` (
	`user_id` text NOT NULL,
	`game_id` integer NOT NULL,
	`own` integer DEFAULT false NOT NULL,
	`wishlist` integer DEFAULT false NOT NULL,
	`want_to_play` integer DEFAULT false NOT NULL,
	`prev_owned` integer DEFAULT false NOT NULL,
	`bgg_user_rating` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `game` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer,
	`thumbnail` text,
	`image` text,
	`min_players` integer,
	`max_players` integer,
	`best_players` text,
	`min_playtime` integer,
	`max_playtime` integer,
	`weight` real,
	`bgg_rating` real,
	`bgg_rank` integer,
	`categories` text,
	`mechanics` text,
	`description` text,
	`tier` text,
	`details_fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_night` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`night` text NOT NULL,
	`url` text,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`date` text,
	`location` text,
	`guests` integer DEFAULT 0 NOT NULL,
	`capacity` integer,
	`cancelled` integer DEFAULT false NOT NULL,
	`channel_id` text,
	`message_id` text,
	`thread_id` text,
	`created_by` text,
	`reminded_at` integer,
	`log_nudged_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `game_night_starts_idx` ON `game_night` (`starts_at`);--> statement-breakpoint
CREATE INDEX `game_night_date_idx` ON `game_night` (`night`,`date`);--> statement-breakpoint
CREATE TABLE `game_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`night` text DEFAULT 'core' NOT NULL,
	`game_night_id` integer,
	`chosen` integer DEFAULT false NOT NULL,
	`bringer_id` text,
	`asked_id` text,
	`links` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`played_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_night_id`) REFERENCES `game_night`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bringer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`asked_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `game_plan_game_idx` ON `game_plan` (`game_id`);--> statement-breakpoint
CREATE INDEX `game_plan_night_idx` ON `game_plan` (`game_night_id`);--> statement-breakpoint
CREATE TABLE `night_rsvp` (
	`game_night_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`status` text NOT NULL,
	`guests` integer DEFAULT 0 NOT NULL,
	`via` text NOT NULL,
	`responded_at` integer NOT NULL,
	PRIMARY KEY(`game_night_id`, `player_id`),
	FOREIGN KEY (`game_night_id`) REFERENCES `game_night`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `opinion` (
	`user_id` text NOT NULL,
	`game_id` integer NOT NULL,
	`sentiment` text,
	`want_to_play` integer DEFAULT false NOT NULL,
	`want_to_play_since` integer,
	`must_play` integer DEFAULT false NOT NULL,
	`must_play_since` integer,
	`play_online` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_ready` (
	`plan_id` integer NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`plan_id`, `user_id`),
	FOREIGN KEY (`plan_id`) REFERENCES `game_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_vote` (
	`plan_id` integer NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`plan_id`, `user_id`),
	FOREIGN KEY (`plan_id`) REFERENCES `game_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `play` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer,
	`game_name` text NOT NULL,
	`played_on` text NOT NULL,
	`location` text,
	`notes` text,
	`source` text NOT NULL,
	`night` text DEFAULT 'core' NOT NULL,
	`source_ref` text,
	`needs_review` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_source_ref_unique` ON `play` (`source_ref`);--> statement-breakpoint
CREATE INDEX `play_played_on_idx` ON `play` (`played_on`);--> statement-breakpoint
CREATE INDEX `play_game_idx` ON `play` (`game_id`);--> statement-breakpoint
CREATE TABLE `play_player` (
	`play_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`ambiguous_name` text,
	PRIMARY KEY(`play_id`, `player_id`),
	FOREIGN KEY (`play_id`) REFERENCES `play`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `player` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`color` text,
	`discord_id` text,
	`user_id` text,
	`welcomed_at` integer,
	`welcomed_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`welcomed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_discord_id_unique` ON `player` (`discord_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `player_user_id_unique` ON `player` (`user_id`);--> statement-breakpoint
CREATE TABLE `ranking` (
	`user_id` text NOT NULL,
	`game_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `suggestion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bgg_id` integer,
	`name` text NOT NULL,
	`year` integer,
	`thumbnail` text,
	`reason` text,
	`source` text NOT NULL,
	`added_by` text,
	`for_user_id` text,
	`night` text,
	`dismissed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`for_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_name_idx` ON `suggestion` (`name`);--> statement-breakpoint
CREATE TABLE `suggestion_vote` (
	`suggestion_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`suggestion_id`, `user_id`),
	FOREIGN KEY (`suggestion_id`) REFERENCES `suggestion`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`discord_id` text,
	`bgg_username` text,
	`bga_username` text,
	`bga_premium` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_discord_id_unique` ON `user` (`discord_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
