const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { safeTextOrNull, normalizeUrlOrNull } = require("../utils/input");

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["superadmin", "company_admin"]));

router.get("/microsoft", async (req, res) => {
  const result = await db.query(
    `SELECT
      id,
      provider::text AS provider,
      client_id AS "clientId",
      tenant_id AS "tenantId",
      redirect_uri AS "redirectUri",
      frontend_origin AS "frontendOrigin",
      is_active AS "isActive",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
     FROM oauth_provider_configs
     WHERE company_id = $1
       AND provider = 'microsoft'::provider_type
     LIMIT 1`,
    [req.user.companyId]
  );
  return res.json({ item: result.rows[0] || null });
});

router.put("/microsoft", async (req, res) => {
  const clientId = safeTextOrNull(req.body?.clientId, 190);
  const clientSecretInput = safeTextOrNull(req.body?.clientSecret, 2000);
  const tenantId = safeTextOrNull(req.body?.tenantId, 190) || "common";
  const redirectUri = normalizeUrlOrNull(req.body?.redirectUri, 300);
  const frontendOrigin = normalizeUrlOrNull(req.body?.frontendOrigin, 300);
  const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : true;

  const existing = await db.query(
    `SELECT client_secret AS "clientSecret"
     FROM oauth_provider_configs
     WHERE company_id = $1
       AND provider = 'microsoft'::provider_type
     LIMIT 1`,
    [req.user.companyId]
  );
  const clientSecret = clientSecretInput || existing.rows[0]?.clientSecret || null;

  if (!clientId || !clientSecret || !redirectUri || !frontendOrigin) {
    return res.status(400).json({
      error: "clientId, clientSecret, redirectUri y frontendOrigin son requeridos y validos"
    });
  }

  const upsertResult = await db.query(
    `INSERT INTO oauth_provider_configs (
      company_id, provider, client_id, client_secret, tenant_id, redirect_uri, frontend_origin, is_active
    )
    VALUES ($1, 'microsoft'::provider_type, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (company_id, provider)
    DO UPDATE SET
      client_id = EXCLUDED.client_id,
      client_secret = EXCLUDED.client_secret,
      tenant_id = EXCLUDED.tenant_id,
      redirect_uri = EXCLUDED.redirect_uri,
      frontend_origin = EXCLUDED.frontend_origin,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING
      id,
      provider::text AS provider,
      client_id AS "clientId",
      tenant_id AS "tenantId",
      redirect_uri AS "redirectUri",
      frontend_origin AS "frontendOrigin",
      is_active AS "isActive",
      created_at AS "createdAt",
      updated_at AS "updatedAt"`,
    [req.user.companyId, clientId, clientSecret, tenantId, redirectUri, frontendOrigin, isActive]
  );

  return res.json(upsertResult.rows[0]);
});

module.exports = router;
