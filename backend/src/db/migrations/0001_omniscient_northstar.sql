ALTER TABLE "conversations" ALTER COLUMN "session_id" SET DATA TYPE varchar(128);--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "session_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "usage_logs" ALTER COLUMN "log_date" DROP DEFAULT;