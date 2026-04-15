-- Seed inicial (desarrollo)
-- Ajustar credenciales en produccion.

INSERT INTO companies (name, slug)
VALUES ('Empresa Demo', 'empresa-demo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (email, password_hash, full_name)
VALUES (
  'admin@hub.local',
  crypt('Admin123*', gen_salt('bf')),
  'Super Admin'
)
ON CONFLICT (email)
DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name;

WITH c AS (
  SELECT id FROM companies WHERE slug = 'empresa-demo'
),
u AS (
  SELECT id FROM users WHERE email = 'admin@hub.local'
)
INSERT INTO memberships (company_id, user_id, role)
SELECT c.id, u.id, 'superadmin'::app_role
FROM c, u
ON CONFLICT (company_id, user_id) DO NOTHING;
