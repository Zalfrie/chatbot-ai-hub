-- Catch-up for databases that never ran 0003: its journal timestamp is older than 0002's, so Drizzle
-- skipped it on databases that were already at 0002. Every statement is idempotent. Where 0003 did run,
-- this only renames its constraints to the names declared in the Drizzle schema.
-- Also owns the updated_at triggers, which used to exist only on databases where db:seed had run.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
ALTER TABLE "chatbots" ADD COLUMN IF NOT EXISTS "tools_enabled" boolean DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_tools" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"parameters_schema" jsonb NOT NULL,
	"webhook_url" varchar(500) NOT NULL,
	"http_method" varchar(10) DEFAULT 'POST',
	"headers_template" jsonb,
	"timeout_ms" integer DEFAULT 5000,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_tools_client_name_unique" UNIQUE("client_id","name"),
	CONSTRAINT "http_method_check" CHECK ("tenant_tools"."http_method" IN ('GET', 'POST')),
	CONSTRAINT "tenant_tools_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
-- 0003 left the constraint names to Postgres
DO $$
DECLARE
  rename_pair text[];
BEGIN
  FOREACH rename_pair SLICE 1 IN ARRAY ARRAY[
    ['tenant_tools_client_id_name_key', 'tenant_tools_client_name_unique'],
    ['tenant_tools_http_method_check', 'http_method_check'],
    ['tenant_tools_client_id_fkey', 'tenant_tools_client_id_clients_id_fk']
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'tenant_tools'::regclass AND conname = rename_pair[1]
    ) THEN
      EXECUTE format('ALTER TABLE "tenant_tools" RENAME CONSTRAINT %I TO %I', rename_pair[1], rename_pair[2]);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tools_client" ON "tenant_tools" USING btree ("client_id","is_active");
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_clients_updated" ON "clients";
--> statement-breakpoint
CREATE TRIGGER "trg_clients_updated" BEFORE UPDATE ON "clients" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_chatbots_updated" ON "chatbots";
--> statement-breakpoint
CREATE TRIGGER "trg_chatbots_updated" BEFORE UPDATE ON "chatbots" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_knowledge_updated" ON "knowledge_bases";
--> statement-breakpoint
CREATE TRIGGER "trg_knowledge_updated" BEFORE UPDATE ON "knowledge_bases" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_tenant_tools_updated" ON "tenant_tools";
--> statement-breakpoint
CREATE TRIGGER "trg_tenant_tools_updated" BEFORE UPDATE ON "tenant_tools" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
