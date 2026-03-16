CREATE TABLE "knowledge_sources" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"knowledge_id" bigint NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"source_url" varchar(500),
	"last_content" text,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_source_type" CHECK ("knowledge_sources"."source_type" IN ('manual', 'file', 'url', 'text'))
);
--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "is_embedded" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "embedded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "chunk_count" smallint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_knowledge_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;