CREATE TYPE "public"."plan" AS ENUM('free', 'basic', 'pro');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('claude', 'openai', 'gemini', 'groq');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('web', 'whatsapp', 'both');--> statement-breakpoint
CREATE TYPE "public"."wa_session_status" AS ENUM('disconnected', 'connecting', 'connected', 'banned');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('web', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'closed', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."usage_channel" AS ENUM('web', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('superadmin', 'admin');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"api_key" varchar(64) NOT NULL,
	"webhook_url" varchar(500),
	"plan" "plan" DEFAULT 'free',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug"),
	CONSTRAINT "clients_email_unique" UNIQUE("email"),
	CONSTRAINT "clients_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "chatbots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigserial NOT NULL,
	"name" varchar(255) NOT NULL,
	"system_prompt" text NOT NULL,
	"welcome_message" text,
	"language" varchar(10) DEFAULT 'id',
	"ai_provider" "ai_provider" DEFAULT 'groq',
	"ai_model" varchar(100) DEFAULT 'llama-3.3-70b-versatile',
	"temperature" numeric(3, 2) DEFAULT '0.85',
	"max_tokens" integer DEFAULT 1000,
	"channel" "channel" DEFAULT 'both',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigserial NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"category" varchar(100),
	"priority" smallint DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigserial NOT NULL,
	"wa_number" varchar(30) NOT NULL,
	"session_data" text,
	"status" "wa_session_status" DEFAULT 'disconnected',
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_sessions_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigserial NOT NULL,
	"chatbot_id" bigserial NOT NULL,
	"session_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"channel" "conversation_channel" NOT NULL,
	"user_identifier" varchar(100),
	"user_name" varchar(255),
	"status" "conversation_status" DEFAULT 'active',
	"metadata" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "conversations_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" bigserial NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"tokens_used" integer,
	"wa_message_id" varchar(100),
	"is_error" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigserial NOT NULL,
	"log_date" date DEFAULT '2026-03-16' NOT NULL,
	"channel" "usage_channel" NOT NULL,
	"message_count" integer DEFAULT 0,
	"token_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "admin_role" DEFAULT 'admin',
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_sessions" ADD CONSTRAINT "wa_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_chatbot_id_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."chatbots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_clients_api_key" ON "clients" USING btree ("api_key");--> statement-breakpoint
CREATE INDEX "idx_clients_slug" ON "clients" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "chatbots_client_id_unique" ON "chatbots" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_client" ON "knowledge_bases" USING btree ("client_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_conv_client" ON "conversations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_conv_session" ON "conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_conv_user" ON "conversations" USING btree ("client_id","user_identifier");--> statement-breakpoint
CREATE INDEX "idx_conv_status" ON "conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_messages_conv" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_client_date" ON "usage_logs" USING btree ("client_id","log_date");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_logs_client_date_channel_unique" ON "usage_logs" USING btree ("client_id","log_date","channel");