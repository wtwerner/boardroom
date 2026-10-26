ALTER TABLE `user` ADD `name_chosen_at` integer;--> statement-breakpoint
UPDATE `user` SET `name` = (SELECT `name` FROM `player` WHERE `player`.`user_id` = `user`.`id`) WHERE EXISTS (SELECT 1 FROM `player` WHERE `player`.`user_id` = `user`.`id` AND `player`.`name` != `user`.`name`);--> statement-breakpoint
UPDATE `user` SET `name_chosen_at` = `created_at`;
