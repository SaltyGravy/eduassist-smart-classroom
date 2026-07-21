CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`student_user_id` integer NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`marked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`corrected_by` integer,
	FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`corrected_by`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_records_unique` ON `attendance_records` (`session_id`,`student_user_id`);--> statement-breakpoint
CREATE INDEX `attendance_records_student_idx` ON `attendance_records` (`student_user_id`);--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer NOT NULL,
	`qr_token` text NOT NULL,
	`manual_code` text NOT NULL,
	`starts_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` integer NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`class_id`) REFERENCES `classroom_classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_sessions_token_unique` ON `attendance_sessions` (`qr_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_sessions_code_unique` ON `attendance_sessions` (`manual_code`);--> statement-breakpoint
CREATE INDEX `attendance_sessions_class_idx` ON `attendance_sessions` (`class_id`);--> statement-breakpoint
CREATE INDEX `attendance_sessions_expiry_idx` ON `attendance_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `class_enrolments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer NOT NULL,
	`student_user_id` integer NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classroom_classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_enrolments_unique` ON `class_enrolments` (`class_id`,`student_user_id`);--> statement-breakpoint
CREATE INDEX `class_enrolments_student_idx` ON `class_enrolments` (`student_user_id`);--> statement-breakpoint
CREATE TABLE `classroom_classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_name` text NOT NULL,
	`subject_code` text NOT NULL,
	`semester` text NOT NULL,
	`section` text NOT NULL,
	`class_code` text NOT NULL,
	`faculty_user_id` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`faculty_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classroom_classes_code_unique` ON `classroom_classes` (`class_code`);--> statement-breakpoint
CREATE INDEX `classroom_classes_faculty_idx` ON `classroom_classes` (`faculty_user_id`);