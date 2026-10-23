ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_session_id_unique";--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_session_id_unique" UNIQUE("client_id","session_id");
