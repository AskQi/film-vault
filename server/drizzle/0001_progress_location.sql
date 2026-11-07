ALTER TABLE `roll_progress` ADD `event` text DEFAULT 'progress' NOT NULL;--> statement-breakpoint
ALTER TABLE `roll_progress` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `roll_progress` ADD `lng` real;--> statement-breakpoint
ALTER TABLE `roll_progress` ADD `address` text;