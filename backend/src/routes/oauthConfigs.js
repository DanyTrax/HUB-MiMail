const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { safeTextOrNull, normalizeUrlOrNull } = require("../utils/input");

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["superadmin", "company_admin"]));

async function fetchWithTimeout(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Comprueba datos guardados (sin exponer secretos): formato, HTTPS y que Microsoft responda metadata del tenant.
 */
router.get("/microsoft/check", async (req, res) => {
  const result = await db.query(
    `SELECT
      client_id AS "clientId",
      tenant_id AS "tenantId",
      redirect_uri AS "redirectUri",
      frontend_origin AS "frontendOrigin",
      is_active AS "isActive"
     FROM oauth_provider_configs
     WHERE company_id = $1
       AND provider = 'microsoft'::provider_type
     LIMIT 1`,
    [req.user.companyId]
  );
  const row = result.rows[0];
  if (!row) {
    return res.json({
      ok: false,
      checks: {},
      hint: "No hay configuracion guardada. Completa el formulario y pulsa Guardar."
    });
  }

  const checks = {
    clientIdPresent: Boolean(row.clientId && String(row.clientId).length >= 8),
    tenantPresent: Boolean(row.tenantId && String(row.tenantId).trim()),
    redirectUriHttps:
      /^https:\/\//i.test(row.redirectUri || "") ||
      /^http:\/\/localhost(?::\d+)?\//i.test(row.redirectUri || ""),
    redirectUriCallbackPath: /\/auth\/microsoft\/callback/i.test(row.redirectUri || ""),
    frontendOriginHttps:
      /^https:\/\//i.test(row.frontendOrigin || "") ||
      /^http:\/\/localhost(?::\d+)?$/i.test(row.frontendOrigin || ""),
    configActive: row.isActive === true
  };

  let microsoftTenantMetadata = false;
  let microsoftTenantMetadataDetail = null;
  try {
    const tenant = encodeURIComponent((row.tenantId || "common").trim());
    const metaUrl = `https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`;
    const r = await fetchWithTimeout(metaUrl, 8000);
    microsoftTenantMetadata = r.ok;
    if (!r.ok) microsoftTenantMetadataDetail = `HTTP ${r.status}`;
  } catch (err) {
    microsoftTenantMetadataDetail = err.name === "AbortError" ? "timeout" : err.message;
  }
  checks.microsoftTenantMetadata = microsoftTenantMetadata;
  if (microsoftTenantMetadataDetail) {
    checks.microsoftTenantMetadataDetail = microsoftTenantMetadataDetail;
  }

  const ok =
    checks.clientIdPresent &&
    checks.tenantPresent &&
    checks.redirectUriHttps &&
    checks.redirectUriCallbackPath &&
    checks.frontendOriginHttps &&
    checks.configActive &&
    checks.microsoftTenantMetadata;

  return res.json({
    ok,
    checks,
    azure: {
      redirectUriMustMatchExactly: row.redirectUri,
      note:
        "En Azure Entra ID > Registro de aplicaciones > Autenticacion: agrega exactamente esta Redirect URI (tipo Web). El Client ID y Tenant deben ser de esa misma app."
    }
  });
});

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
