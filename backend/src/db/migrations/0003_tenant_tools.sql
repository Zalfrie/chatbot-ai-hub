-- Phase 10: Tool Use / Function Calling per-tenant

CREATE TABLE IF NOT EXISTS tenant_tools (
  id                BIGSERIAL PRIMARY KEY,
  client_id         BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  description       TEXT NOT NULL,
  parameters_schema JSONB NOT NULL,
  webhook_url       VARCHAR(500) NOT NULL,
  http_method       VARCHAR(10) DEFAULT 'POST' CHECK (http_method IN ('GET', 'POST')),
  headers_template  JSONB NULL,
  timeout_ms        INT DEFAULT 5000,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tools_client ON tenant_tools(client_id, is_active);

-- Kill switch per chatbot
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS tools_enabled BOOLEAN DEFAULT FALSE;

-- Trigger for updated_at on tenant_tools
DROP TRIGGER IF EXISTS trg_tenant_tools_updated ON tenant_tools;
CREATE TRIGGER trg_tenant_tools_updated
BEFORE UPDATE ON tenant_tools
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
