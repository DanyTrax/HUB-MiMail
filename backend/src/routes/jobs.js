const express = require("express");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { spawn, spawnSync } = require("child_process");
const db = require("../db");
const { microsoftOAuth } = require("../config");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { safeTextOrNull } = require("../utils/input");
const { imapsyncFailureSummary, describeImapsyncExitCode } = require("../utils/imapsyncExitCodes");

const router = express.Router();
const MICROSOFT_SCOPE = "offline_access https://outlook.office.com/IMAP.AccessAsUser.All";

router.use(requireAuth);

function logJobs(event, data = {}) {
  // eslint-disable-next-line no-console
  console.log(`[jobs] ${event}`, data);
}

function formatJobRunRow(row) {
  if (!row) return null;
  const details = row.details || {};
  return {
    ...row,
    errorDetail: details?.error || details?.stderrTail || details?.stdoutTail || null
  };
}

function checkImapsyncAvailable() {
  try {
    const probe = spawnSync("imapsync", ["--version"], { encoding: "utf8" });
    return {
      ok: probe.status === 0,
      status: probe.status,
      error: probe.error ? probe.error.message : null,
      stderr: (probe.stderr || "").trim().slice(0, 300)
    };
  } catch (err) {
    return { ok: false, status: null, error: err.message, stderr: "" };
  }
}

function parseCredentialSecret(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function isTokenExpired(credentialData) {
  const createdAtMs = Date.parse(credentialData?.createdAt || "");
  const expiresIn = Number(credentialData?.expiresIn || 0);
  if (!createdAtMs || !Number.isFinite(expiresIn) || expiresIn <= 0) return true;
  // Margen de seguridad para no correr con token casi vencido.
  const expiresAt = createdAtMs + expiresIn * 1000;
  return Date.now() >= expiresAt - 2 * 60 * 1000;
}

async function getCompanyMicrosoftConfig(companyId) {
  const result = await db.query(
    `SELECT
      client_id AS "clientId",
      client_secret AS "clientSecret",
      tenant_id AS "tenantId"
     FROM oauth_provider_configs
     WHERE company_id = $1
       AND provider = 'microsoft'::provider_type
       AND is_active = TRUE
     LIMIT 1`,
    [companyId]
  );
  return result.rows[0] || null;
}

async function refreshMicrosoftAccessToken({ companyId, accountId, credentialRow, oauthConfig }) {
  if (!oauthConfig?.clientId) {
    throw new Error("Microsoft OAuth2 no esta configurado en backend (MS_CLIENT_ID)");
  }

  const credentialData = parseCredentialSecret(credentialRow.secret_ciphertext);
  if (!credentialData?.refreshToken) {
    throw new Error("La cuenta Microsoft no tiene refresh token guardado");
  }

  const tokenUrl = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(oauthConfig.tenantId || "common")}/oauth2/v2.0/token`
  );
  const payload = new URLSearchParams();
  payload.set("client_id", oauthConfig.clientId);
  payload.set("grant_type", "refresh_token");
  payload.set("refresh_token", credentialData.refreshToken);
  payload.set("scope", MICROSOFT_SCOPE);
  if (oauthConfig.clientSecret) payload.set("client_secret", oauthConfig.clientSecret);

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString()
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData?.access_token) {
    const detail = tokenData?.error_description || tokenData?.error || "No se obtuvo access_token";
    throw new Error(`No se pudo renovar token Microsoft: ${detail}`);
  }

  const updatedSecret = JSON.stringify({
    ...credentialData,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || credentialData.refreshToken,
    tokenType: tokenData.token_type || "Bearer",
    expiresIn: tokenData.expires_in || null,
    scope: tokenData.scope || MICROSOFT_SCOPE,
    createdAt: new Date().toISOString()
  });

  await db.query(
    `UPDATE credentials
     SET secret_ciphertext = $4,
         is_active = TRUE,
         updated_at = NOW()
     WHERE company_id = $1
       AND mail_account_id = $2
       AND id = $3`,
    [companyId, accountId, credentialRow.id, updatedSecret]
  );

  return tokenData.access_token;
}

async function resolveSourceTokenForAccount({ companyId, account, providedSourceToken }) {
  if (account.provider !== "microsoft") return providedSourceToken || null;
  if (providedSourceToken) return providedSourceToken;

  const credentialResult = await db.query(
    `SELECT id, secret_ciphertext
     FROM credentials
     WHERE company_id = $1
       AND mail_account_id = $2
       AND provider = 'microsoft'::provider_type
       AND is_active = TRUE
     ORDER BY updated_at DESC
     LIMIT 1`,
    [companyId, account.id]
  );
  if (!credentialResult.rows.length) {
    throw new Error("La cuenta Microsoft no esta conectada por OAuth2");
  }

  const credentialRow = credentialResult.rows[0];
  const credentialData = parseCredentialSecret(credentialRow.secret_ciphertext);
  if (!credentialData) {
    throw new Error("Credencial Microsoft invalida o corrupta");
  }

  if (credentialData.accessToken && !isTokenExpired(credentialData)) {
    return credentialData.accessToken;
  }

  const companyMicrosoftConfig = await getCompanyMicrosoftConfig(companyId);
  const oauthConfig = companyMicrosoftConfig || {
    clientId: microsoftOAuth.clientId,
    clientSecret: microsoftOAuth.clientSecret,
    tenantId: microsoftOAuth.tenantId
  };

  return refreshMicrosoftAccessToken({
    companyId,
    accountId: account.id,
    credentialRow,
    oauthConfig
  });
}

async function resolveDestinationPasswordForAccount({ companyId, accountId, providedDestinationPassword }) {
  if (providedDestinationPassword) return providedDestinationPassword;
  const credentialResult = await db.query(
    `SELECT secret_ciphertext
     FROM credentials
     WHERE company_id = $1
       AND mail_account_id = $2
       AND provider = 'imap'::provider_type
       AND is_active = TRUE
     ORDER BY updated_at DESC
     LIMIT 1`,
    [companyId, accountId]
  );
  if (!credentialResult.rows.length) {
    throw new Error("No hay contraseña IMAP de destino guardada para esta cuenta");
  }
  const data = parseCredentialSecret(credentialResult.rows[0].secret_ciphertext);
  if (!data?.destinationPassword) {
    throw new Error("La contraseña IMAP de destino guardada es invalida");
  }
  return data.destinationPassword;
}

async function runImapsync({ account, sourceToken, sourcePassword, destinationPassword, dryRun, runId }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hub-mimail-"));
  const cleanupPaths = [];
  let stdoutBuffer = "";
  let stderrBuffer = "";

  try {
    const args = [
      "--host1",
      account.sourceHost || (account.provider === "microsoft" ? "outlook.office365.com" : ""),
      "--port1",
      "993",
      "--ssl1",
      "--user1",
      account.sourceEmail
    ];

    if (sourceToken) {
      // imapsync espera el token OAuth en texto plano en --oauthaccesstoken1,
      // no una ruta de archivo. Pasar el path provoca fallo de autenticacion.
      args.push("--authmech1", "XOAUTH2", "--oauthaccesstoken1", sourceToken);
    } else {
      const pass1Path = path.join(tempDir, "source_password.txt");
      await fs.writeFile(pass1Path, `${sourcePassword}\n`, { mode: 0o600 });
      cleanupPaths.push(pass1Path);
      args.push("--passfile1", pass1Path);
    }

    const pass2Path = path.join(tempDir, "destination_password.txt");
    await fs.writeFile(pass2Path, `${destinationPassword}\n`, { mode: 0o600 });
    cleanupPaths.push(pass2Path);

    args.push(
      "--host2",
      account.destinationHost || "localhost",
      "--port2",
      "993",
      "--ssl2",
      "--user2",
      account.destinationEmail || account.sourceEmail,
      "--passfile2",
      pass2Path,
      "--syncinternaldates",
      "--skipsize",
      "--nofoldersizes"
    );

    if (dryRun) args.push("--justlogin");

    await new Promise((resolve, reject) => {
      const proc = spawn("imapsync", args, { stdio: ["ignore", "pipe", "pipe"] });

      proc.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        if (stdoutBuffer.length > 30000) stdoutBuffer = stdoutBuffer.slice(-30000);
      });
      proc.stderr.on("data", (chunk) => {
        stderrBuffer += chunk.toString();
        if (stderrBuffer.length > 30000) stderrBuffer = stderrBuffer.slice(-30000);
      });

      proc.on("error", async (err) => {
        await db.query(
          `UPDATE job_runs
           SET finished_at = NOW(), status = 'failed', summary = 'imapsync no disponible en runtime', details = $2::jsonb
           WHERE id = $1`,
          [runId, JSON.stringify({ error: err.message })]
        );
        reject(err);
      });

      proc.on("close", async (code) => {
        const status = code === 0 ? "success" : "failed";
        const summary = code === 0 ? "imapsync completado" : imapsyncFailureSummary(code);
        logJobs("run-finished", {
          runId,
          status,
          exitCode: code,
          stderrTail: stderrBuffer.slice(-500),
          stdoutTail: stdoutBuffer.slice(-500)
        });
        await db.query(
          `UPDATE job_runs
           SET finished_at = NOW(), status = $2::job_status, summary = $3, details = $4::jsonb
           WHERE id = $1`,
          [
            runId,
            status,
            summary,
            JSON.stringify({
              exitCode: code,
              exitHintEs: code === 0 ? null : describeImapsyncExitCode(code),
              stdoutTail: stdoutBuffer,
              stderrTail: stderrBuffer
            })
          ]
        );
        resolve();
      });
    });
  } finally {
    for (const p of cleanupPaths) {
      await fs.rm(p, { force: true });
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

router.post("/run", requireRole(["superadmin", "company_admin", "operator"]), async (req, res) => {
  const mailAccountId = safeTextOrNull(req.body?.mailAccountId, 36);
  const sourceTokenInput = safeTextOrNull(req.body?.sourceToken, 10000);
  const sourcePassword = safeTextOrNull(req.body?.sourcePassword, 256);
  const destinationPasswordInput = safeTextOrNull(req.body?.destinationPassword, 256);
  const dryRun = Boolean(req.body?.dryRun);
  logJobs("run-request", {
    companyId: req.user.companyId,
    userId: req.user.sub,
    mailAccountId,
    dryRun
  });

  if (!mailAccountId) {
    return res.status(400).json({ error: "mailAccountId es requerido" });
  }

  const accountResult = await db.query(
    `SELECT
      id,
      provider::text AS provider,
      source_email AS "sourceEmail",
      destination_email AS "destinationEmail",
      source_host AS "sourceHost",
      destination_host AS "destinationHost",
      is_active AS "isActive"
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
  if (account.provider !== "microsoft" && !sourceTokenInput && !sourcePassword) {
    return res.status(400).json({ error: "Debes enviar sourceToken o sourcePassword" });
  }

  const imapsyncProbe = checkImapsyncAvailable();
  if (!imapsyncProbe.ok) {
    logJobs("imapsync-unavailable", imapsyncProbe);
    return res.status(503).json({
      error:
        "imapsync no esta instalado o no es ejecutable en el contenedor backend. Contacta al administrador para habilitar el ejecutor de migraciones."
    });
  }

  let sourceToken = sourceTokenInput;
  try {
    sourceToken = await resolveSourceTokenForAccount({
      companyId: req.user.companyId,
      account,
      providedSourceToken: sourceTokenInput
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "No se pudo resolver token OAuth2 de Microsoft" });
  }

  let destinationPassword = destinationPasswordInput;
  try {
    destinationPassword = await resolveDestinationPasswordForAccount({
      companyId: req.user.companyId,
      accountId: account.id,
      providedDestinationPassword: destinationPasswordInput
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "No se pudo resolver contraseña de destino" });
  }

  const jobResult = await db.query(
    `INSERT INTO jobs (company_id, created_by, job_name, type, status, run_mode, payload)
     VALUES ($1, $2, $3, 'migration', 'running', 'manual', $4::jsonb)
     RETURNING id`,
    [
      req.user.companyId,
      req.user.sub,
      dryRun ? `Probar login ${account.sourceEmail}` : `Migrar ${account.sourceEmail}`,
      JSON.stringify({
        mailAccountId,
        dryRun
      })
    ]
  );
  const jobId = jobResult.rows[0].id;

  const runResult = await db.query(
    `INSERT INTO job_runs (company_id, job_id, status, details)
     VALUES ($1, $2, 'running', '{}'::jsonb)
     RETURNING id`,
    [req.user.companyId, jobId]
  );
  const runId = runResult.rows[0].id;

  runImapsync({ account, sourceToken, sourcePassword, destinationPassword, dryRun, runId }).catch(async (err) => {
    logJobs("run-dispatch-error", {
      runId,
      companyId: req.user.companyId,
      error: err.message
    });
    await db.query(
      `UPDATE job_runs
       SET finished_at = NOW(), status = 'failed', summary = 'Fallo interno al lanzar imapsync', details = $2::jsonb
       WHERE id = $1`,
      [runId, JSON.stringify({ error: err.message })]
    );
  });

  return res.status(202).json({
    ok: true,
    jobId,
    runId,
    message: dryRun ? "Prueba de login en ejecución" : "Migración en ejecución"
  });
});

router.get(
  "/runs/:runId",
  requireRole(["superadmin", "company_admin", "operator", "scheduler", "viewer"]),
  async (req, res) => {
    const runId = safeTextOrNull(req.params.runId, 40);
    if (!runId) {
      return res.status(400).json({ error: "runId invalido" });
    }
    const result = await db.query(
      `SELECT
        jr.id,
        jr.job_id AS "jobId",
        jr.started_at AS "startedAt",
        jr.finished_at AS "finishedAt",
        jr.status::text AS status,
        jr.summary,
        jr.details,
        j.job_name AS "jobName"
       FROM job_runs jr
       INNER JOIN jobs j ON j.id = jr.job_id
       WHERE jr.company_id = $1 AND jr.id = $2::uuid
       LIMIT 1`,
      [req.user.companyId, runId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Ejecucion no encontrada" });
    }
    return res.json({ item: formatJobRunRow(result.rows[0]) });
  }
);

router.get("/runs", requireRole(["superadmin", "company_admin", "operator", "scheduler", "viewer"]), async (req, res) => {
  const pageSize = 4;
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM job_runs jr
     WHERE jr.company_id = $1`,
    [req.user.companyId]
  );
  const total = countResult.rows[0]?.n ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const rawPage = parseInt(String(req.query.page || "1"), 10);
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, rawPage), totalPages) : 1;
  const offset = (page - 1) * pageSize;

  const result = await db.query(
    `SELECT
      jr.id,
      jr.job_id AS "jobId",
      jr.started_at AS "startedAt",
      jr.finished_at AS "finishedAt",
      jr.status::text AS status,
      jr.summary,
      jr.details,
      j.job_name AS "jobName"
     FROM job_runs jr
     INNER JOIN jobs j ON j.id = jr.job_id
     WHERE jr.company_id = $1
     ORDER BY jr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.companyId, pageSize, offset]
  );
  const items = result.rows.map((row) => formatJobRunRow(row));
  return res.json({ items, page, limit: pageSize, total, totalPages });
});

module.exports = router;
