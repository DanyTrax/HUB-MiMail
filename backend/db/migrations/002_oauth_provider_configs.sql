-- Fase OAuth multiempresa: configuracion por empresa/proveedor

CREATE TABLE IF NOT EXISTS oauth_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider provider_type NOT NULL,
  client_id VARCHAR(190) NOT NULL,
  client_secret TEXT NOT NULL,
  tenant_id VARCHAR(190) NOT NULL DEFAULT 'common',
  redirect_uri VARCHAR(300) NOT NULL,
  frontend_origin VARCHAR(300) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_provider_configs_company
  ON oauth_provider_configs(company_id, provider, is_active);
