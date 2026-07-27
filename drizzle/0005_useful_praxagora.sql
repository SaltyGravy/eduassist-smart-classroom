ALTER TABLE `attendance_sessions` ADD `manual_code_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance_sessions` ADD `rotation_seconds` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `department` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `section` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `roll_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_users` ADD `semester` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_student_roll_unique` ON `auth_users` (`roll_number`) WHERE "auth_users"."role" = 'student' AND "auth_users"."roll_number" <> '';