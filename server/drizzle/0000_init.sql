CREATE TABLE `brand` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `film_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand_code` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `format_code_map` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `iso_code_map` (
	`code` text PRIMARY KEY NOT NULL,
	`iso` integer NOT NULL,
	`is_exception` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `film_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand_code` text NOT NULL,
	`series_code` text NOT NULL,
	`iso_code` text NOT NULL,
	`iso` integer NOT NULL,
	`format_code` text NOT NULL,
	`format` text NOT NULL,
	`name` text NOT NULL,
	`nominal_frames` integer,
	`default_frames` integer,
	`process` text,
	`color_type` text,
	`status` text DEFAULT 'active' NOT NULL,
	`description` text,
	`nickname` text,
	`usual_ei` integer,
	`push_pull_pref` text,
	`my_rating` integer,
	`my_notes` text,
	`ref_price` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_stock_natural` ON `film_stock` (`brand_code`,`series_code`,`iso_code`,`format_code`);--> statement-breakpoint
CREATE INDEX `idx_stock_brand` ON `film_stock` (`brand_code`);--> statement-breakpoint
CREATE TABLE `pending_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prefix` text NOT NULL,
	`raw_code` text,
	`barcode` text,
	`seen_count` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_stock_prefix_unique` ON `pending_stock` (`prefix`);--> statement-breakpoint
CREATE TABLE `stock_barcode` (
	`barcode` text PRIMARY KEY NOT NULL,
	`stock_id` integer NOT NULL,
	`source` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `film_stock`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stock_prefix` (
	`prefix` text PRIMARY KEY NOT NULL,
	`stock_id` integer NOT NULL,
	`is_primary` integer DEFAULT 1 NOT NULL,
	`seq_max` integer DEFAULT 0 NOT NULL,
	`note` text,
	FOREIGN KEY (`stock_id`) REFERENCES `film_stock`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_prefix_stock` ON `stock_prefix` (`stock_id`);--> statement-breakpoint
CREATE TABLE `camera` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`mount` text,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`mount` text,
	`focal_mm` integer,
	`max_aperture` real,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`roll_id` integer NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`thumb_path` text,
	`mime` text,
	`size` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`roll_id`) REFERENCES `roll`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_asset_roll` ON `asset` (`roll_id`);--> statement-breakpoint
CREATE TABLE `box` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`label` text,
	`purchased_at` text,
	`unit_price` real,
	`source` text,
	`storage` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `film_stock`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `development` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`roll_id` integer NOT NULL,
	`method` text NOT NULL,
	`process` text,
	`developer` text,
	`dilution` text,
	`temp_c` real,
	`duration_sec` integer,
	`agitation` text,
	`push_pull` integer,
	`lab_name` text,
	`dev_at` text,
	`rating` integer,
	`issues` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`roll_id`) REFERENCES `roll`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_dev_roll` ON `development` (`roll_id`);--> statement-breakpoint
CREATE TABLE `frame_note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`roll_id` integer NOT NULL,
	`frame_no` integer NOT NULL,
	`aperture` text,
	`shutter` text,
	`ei` integer,
	`ev_offset` text,
	`lens_id` integer,
	`location` text,
	`note` text,
	`photo_path` text,
	`happened_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`roll_id`) REFERENCES `roll`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lens_id`) REFERENCES `lens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_frame_note_roll` ON `frame_note` (`roll_id`,`frame_no`);--> statement-breakpoint
CREATE TABLE `roll` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`prefix` text NOT NULL,
	`serial_txt` text NOT NULL,
	`seq` integer NOT NULL,
	`stock_id` integer NOT NULL,
	`box_id` integer,
	`frames_total` integer NOT NULL,
	`status` text DEFAULT 'unopened' NOT NULL,
	`camera_id` integer,
	`lens_id` integer,
	`ei` integer,
	`push_pull` integer DEFAULT 0 NOT NULL,
	`loaded_at` text,
	`finished_at` text,
	`expiry_date` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`stock_id`) REFERENCES `film_stock`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`box_id`) REFERENCES `box`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`camera_id`) REFERENCES `camera`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lens_id`) REFERENCES `lens`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_roll_seq" CHECK("roll"."seq" BETWEEN 1 AND 6199),
	CONSTRAINT "ck_roll_code_len" CHECK(length("roll"."code") = 7)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roll_code_unique` ON `roll` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_roll_prefix_seq` ON `roll` (`prefix`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_roll_status` ON `roll` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_roll_stock` ON `roll` (`stock_id`);--> statement-breakpoint
CREATE TABLE `roll_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`roll_id` integer NOT NULL,
	`reached_frame` integer NOT NULL,
	`happened_at` text NOT NULL,
	`camera_id` integer,
	`lens_id` integer,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`roll_id`) REFERENCES `roll`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`camera_id`) REFERENCES `camera`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lens_id`) REFERENCES `lens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_progress_roll` ON `roll_progress` (`roll_id`,`happened_at`);