CREATE TABLE `file_tags` (
	`path` text NOT NULL,
	`tag_id` integer NOT NULL,
	`tagged_at` integer NOT NULL,
	PRIMARY KEY(`path`, `tag_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_file_tags_tag` ON `file_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `folder_views` (
	`path` text PRIMARY KEY NOT NULL,
	`sort_key` text,
	`sort_dir` text,
	`view_mode` text,
	`icon_size` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prefs` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recents` (
	`path` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`opened_at` integer NOT NULL,
	`open_count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recents_opened` ON `recents` (`opened_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);