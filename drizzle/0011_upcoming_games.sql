CREATE TABLE `upcoming_game` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`platform` text,
	`prelaunch` integer DEFAULT false NOT NULL,
	`launch` text,
	`launch_until` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade
);
