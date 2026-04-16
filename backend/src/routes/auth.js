const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { jwtSecret, microsoftOAuth } = require("../config");
const { requireAuth } = require("../middleware/auth");
const { normalizeEmailOrNull, normalizeSlugOrNull, safeTextOrNull, normalizeUrlOrNull } = require("../utils/input");

const router = express.Router();
const pendingMicrosoftAuth = new Map();
const MICROSOFT_SCOPE = "offline_access https://outlook.office.com/IMAP.AccessAsUser.All";

function toBase64Url(value) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function postMessageTargetOrigin(raw) {
  if (!raw || raw === "*") return "*";
  try {
    return new URL(raw).origin;
  } catch (_err) {
    return "*";
  }
}

function createMicrosoftPopupResponse({ ok, message, payload, targetOrigin }) {
  const escapedMessage = JSON.stringify(message || "");
  const serializedPayload = JSON.stringify(payload || {});
  const safeTargetOrigin = JSON.stringify(postMessageTargetOrigin(targetOrigin));
  const type = ok ? "microsoft-oauth-success" : "microsoft-oauth-error";
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Microsoft OAuth2</title></head>
<body>
  <p>${ok ? "Conexion completada." : "No se pudo completar la conexion."} Puedes cerrar esta ventana.</p>
  <script>
    (function () {
      var payload = ${serializedPayload};
      payload.type = "${type}";
      payload.message = ${escapedMessage};
      if (window.opener) {
        window.opener.postMessage(payload, ${safeTargetOrigin});
      }
      window.close();
    })();
  </script>
</body>
</html>`;
}

async function getCompanyMicrosoftConfig(companyId) {
  const result = await db.query(
    `SELECT
      id,
      client_id AS "clientId",
      client_secret AS "clientSecret",
      tenant_id AS "tenantId",
      redirect_uri AS "redirectUri",
      frontend_origin AS "frontendOrigin"
     FROM oauth_provider_configs
     WHERE company_id = $1
       AND provider = 'microsoft'::provider_type
       AND is_active = TRUE
     LIMIT 1`,
    [companyId]
  );
  return result.rows[0] || null;
}

router.post("/login", async (req, res) => {
  const email = normalizeEmailOrNull(req.body?.email);
  const companySlug = normalizeSlugOrNull(req.body?.companySlug);
  const password = safeTextOrNull(req.body?.password, 256);

  if (!email || !password || !companySlug) {
    return res.status(400).json({ error: "email, password y companySlug son requeridos" });
  }

  const query = `
    SELECT
      u.id AS user_id,
      u.email,
      u.password_hash,
      u.full_name,
      c.id AS company_id,
      c.slug AS company_slug,
      m.role::text AS role
    FROM users u
    INNER JOIN memberships m ON m.user_id = u.id
    INNER JOIN companies c ON c.id = m.company_id
    WHERE u.email = $1
      AND c.slug = $2
      AND u.is_active = TRUE
      AND c.is_active = TRUE
    LIMIT 1
  `;

  const { rows } = await db.query(query, [email, companySlug]);
  if (!rows.length) {
    return res.status(401).json({ error: "Credenciales invalidas o empresa no asignada" });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Credenciales invalidas" });
  }

  const token = jwt.sign(
    {
      sub: user.user_id,
      email: user.email,
      fullName: user.full_name,
      companyId: user.company_id,
      companySlug: user.company_slug,
      role: user.role
    },
    jwtSecret,
    { expiresIn: "8h" }
  );

  return res.json({
    token,
    user: {
      id: user.user_id,
      email: user.email,
      fullName: user.full_name,
      companyId: user.company_id,
      companySlug: user.company_slug,
      role: user.role
    }
  });
});

router.get("/me", requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

router.post("/microsoft/connect-url", requireAuth, async (req, res) => {
  const mailAccountId = safeTextOrNull(req.body?.mailAccountId, 36);
  const frontendOriginInput = normalizeUrlOrNull(req.body?.frontendOrigin, 300);
  if (!mailAccountId) return res.status(400).json({ error: "mailAccountId invalido" });

  const accountResult = await db.query(
    `SELECT id, provider::text AS provider, is_active AS "isActive"
     FROM mail_accounts
     WHERE id = $1 AND company_id = $2`,
    [mailAccountId, req.user.companyId]
  );
  if (!accountResult.rows.length) {
    return res.status(404).json({ error: "Cuenta no encontrada en la empresa" });
  }
  const account = accountResult.rows[0];
  if (!account.isActive) {
    return res.status(400).json({ error: "La cuenta esta inactiva" });
  }
  if (account.provider !== "microsoft") {
    return res.status(400).json({ error: "La cuenta seleccionada no es del proveedor microsoft" });
  }

  const companyMicrosoftConfig = await getCompanyMicrosoftConfig(req.user.companyId);
  const resolvedConfig = companyMicrosoftConfig
    ? {
        ...companyMicrosoftConfig,
        // Origen del panel actual (postMessage); prioridad sobre valor viejo en BD.
        ...(frontendOriginInput ? { frontendOrigin: frontendOriginInput } : {})
      }
    : {
        clientId: microsoftOAuth.clientId,
        clientSecret: microsoftOAuth.clientSecret,
        tenantId: microsoftOAuth.tenantId,
        redirectUri: microsoftOAuth.redirectUri,
        frontendOrigin: frontendOriginInput || null
      };
  if (!resolvedConfig.clientId || !resolvedConfig.redirectUri) {
    return res.status(400).json({
      error: "Microsoft OAuth2 no configurado para esta empresa. Ve a Configuracion Microsoft."
    });
  }

  const state = toBase64Url(crypto.randomBytes(24));
  const codeVerifier = toBase64Url(crypto.randomBytes(64));
  const codeChallenge = toBase64Url(crypto.createHash("sha256").update(codeVerifier).digest());

  pendingMicrosoftAuth.set(state, {
    mailAccountId,
    companyId: req.user.companyId,
    userId: req.user.sub,
    codeVerifier,
    createdAt: Date.now(),
    oauthConfig: resolvedConfig
  });

  const authorizeUrl = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(resolvedConfig.tenantId || "common")}/oauth2/v2.0/authorize`
  );
  authorizeUrl.searchParams.set("client_id", resolvedConfig.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", resolvedConfig.redirectUri);
  authorizeUrl.searchParams.set("response_mode", "query");
  authorizeUrl.searchParams.set("scope", MICROSOFT_SCOPE);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "select_account");

  return res.json({ authorizeUrl: authorizeUrl.toString() });
});

router.get("/microsoft/callback", async (req, res) => {
  const state = safeTextOrNull(req.query?.state, 200);
  const code = safeTextOrNull(req.query?.code, 4000);
  const oauthError = safeTextOrNull(req.query?.error, 200);
  const oauthErrorDescription = safeTextOrNull(req.query?.error_description, 800);

  if (oauthError) {
    return res
      .status(400)
      .type("html")
      .send(
        createMicrosoftPopupResponse({
          ok: false,
          message: `Microsoft devolvio error: ${oauthErrorDescription || oauthError}`,
          targetOrigin: "*"
        })
      );
  }

  if (!state || !code) {
    return res
      .status(400)
      .type("html")
      .send(createMicrosoftPopupResponse({ ok: false, message: "Faltan parametros OAuth2 (state/code).", targetOrigin: "*" }));
  }

  const pending = pendingMicrosoftAuth.get(state);
  pendingMicrosoftAuth.delete(state);
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    return res
      .status(400)
      .type("html")
      .send(createMicrosoftPopupResponse({ ok: false, message: "Sesion OAuth2 expirada. Reintenta conectar.", targetOrigin: "*" }));
  }

  const oauthConfig = pending.oauthConfig || {};

  const tokenUrl = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(oauthConfig.tenantId || "common")}/oauth2/v2.0/token`
  );
  const payload = new URLSearchParams();
  payload.set("client_id", oauthConfig.clientId);
  payload.set("grant_type", "authorization_code");
  payload.set("code", code);
  payload.set("redirect_uri", oauthConfig.redirectUri);
  payload.set("code_verifier", pending.codeVerifier);
  payload.set("scope", MICROSOFT_SCOPE);
  if (oauthConfig.clientSecret) payload.set("client_secret", oauthConfig.clientSecret);

  let tokenData;
  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString()
    });
    tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData?.access_token) {
      const detail = tokenData?.error_description || tokenData?.error || "No se obtuvo access_token";
      return res
        .status(400)
        .type("html")
        .send(
          createMicrosoftPopupResponse({
            ok: false,
            message: `No se pudo emitir token: ${detail}`,
            targetOrigin: oauthConfig.frontendOrigin
          })
        );
    }
  } catch (err) {
    return res
      .status(500)
      .type("html")
      .send(
        createMicrosoftPopupResponse({
          ok: false,
          message: `Error al consultar token endpoint: ${err.message}`,
          targetOrigin: oauthConfig.frontendOrigin
        })
      );
  }

  const secretCiphertext = JSON.stringify({
    provider: "microsoft",
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    tokenType: tokenData.token_type || "Bearer",
    expiresIn: tokenData.expires_in || null,
    scope: tokenData.scope || MICROSOFT_SCOPE,
    createdAt: new Date().toISOString()
  });

  const updateCredential = await db.query(
    `UPDATE credentials
     SET secret_ciphertext = $4,
         is_active = TRUE,
         updated_at = NOW()
     WHERE company_id = $1
       AND mail_account_id = $2
       AND provider = $3::provider_type`,
    [pending.companyId, pending.mailAccountId, "microsoft", secretCiphertext]
  );
  if (!updateCredential.rowCount) {
    await db.query(
      `INSERT INTO credentials (company_id, mail_account_id, provider, secret_ciphertext, is_active)
       VALUES ($1, $2, $3::provider_type, $4, TRUE)`,
      [pending.companyId, pending.mailAccountId, "microsoft", secretCiphertext]
    );
  }

  await db.query(
    `UPDATE mail_accounts
     SET metadata = COALESCE(metadata, '{}'::jsonb) ||
       jsonb_build_object('microsoftOauthConnectedAt', NOW()::text),
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [pending.mailAccountId, pending.companyId]
  );

  return res
    .status(200)
    .type("html")
    .send(
      createMicrosoftPopupResponse({
        ok: true,
        message: "Cuenta Microsoft conectada correctamente.",
        targetOrigin: oauthConfig.frontendOrigin,
        payload: {
          accountId: pending.mailAccountId,
          accessToken: tokenData.access_token,
          expiresIn: tokenData.expires_in || null
        }
      })
    );
});

module.exports = router;
