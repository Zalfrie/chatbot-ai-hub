import { sql } from 'drizzle-orm';

export const createUpdatedAtFunction = sql`
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`;

export const createClientsTrigger = sql`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clients_updated') THEN
      CREATE TRIGGER trg_clients_updated
      BEFORE UPDATE ON clients
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
`;

export const createChatbotsTrigger = sql`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chatbots_updated') THEN
      CREATE TRIGGER trg_chatbots_updated
      BEFORE UPDATE ON chatbots
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
`;

export const createKnowledgeTrigger = sql`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_knowledge_updated') THEN
      CREATE TRIGGER trg_knowledge_updated
      BEFORE UPDATE ON knowledge_bases
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
`;
