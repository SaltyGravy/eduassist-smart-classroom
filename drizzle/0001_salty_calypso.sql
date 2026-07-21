CREATE TABLE `auth_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_user_id` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_audit_created_idx` ON `auth_audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `auth_audit_target_idx` ON `auth_audit_log` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `auth_system_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `auth_users` ADD `is_admin` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `must_change_password` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `last_login_at` text;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `created_by` text;