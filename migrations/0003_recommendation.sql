CREATE TABLE `item_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text NOT NULL,
	`version_id` integer,
	`score` real,
	`dwell_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_events_item_kind` ON `item_events` (`item_id`,`kind`);--> statement-breakpoint
CREATE INDEX `item_events_created` ON `item_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `item_scores` (
	`item_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`score` real NOT NULL,
	`scored_at` integer NOT NULL,
	PRIMARY KEY(`item_id`, `version_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `preference_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_scores_version_score` ON `item_scores` (`version_id`,`score`);--> statement-breakpoint
CREATE TABLE `preference_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`body` text NOT NULL,
	`source` text NOT NULL,
	`parent_id` integer,
	`status` text NOT NULL,
	`eval_json` text,
	`rationale` text,
	`created_at` integer NOT NULL,
	`activated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preference_versions_single_active` ON `preference_versions` (`status`) WHERE status = 'active';