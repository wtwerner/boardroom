ALTER TABLE `user` ADD `email_too` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `user` SET `email_verified` = false WHERE `id` NOT IN (SELECT `user_id` FROM `account` WHERE `provider_id` = 'credential');
