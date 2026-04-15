const express = require("express");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { safeTextOrNull } = require("../utils/input");

const router = express.Router();

router.use(requireAuth);

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
      const tokenPath = path.join(tempDir, "source_token.txt");
      await fs.writeFile(tokenPath, `${sourceToken}\n`, { mode: 0o600 });
      cleanupPaths.push(tokenPath);
      args.push("--authmech1", "XOAUTH2", "--oauthaccesstoken1", tokenPath);
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
        const summary = code === 0 ? "imapsync completado" : `imapsync finalizo con error (${code})`;
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
  const sourceToken = safeTextOrNull(req.body?.sourceToken, 10000);
  const sourcePassword = safeTextOrNull(req.body?.sourcePassword, 256);
  const destinationPassword = safeTextOrNull(req.body?.destinationPassword, 256);
  const dryRun = Boolean(req.body?.dryRun);

  if (!mailAccountId || !destinationPassword) {
    return res.status(400).json({ error: "mailAccountId y destinationPassword son requeridos" });
  }
  if (!sourceToken && !sourcePassword) {
    return res.status(400).json({ error: "Debes enviar sourceToken o sourcePassword" });
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

router.get("/runs", requireRole(["superadmin", "company_admin", "operator", "scheduler", "viewer"]), async (req, res) => {
  const result = await db.query(
    `SELECT
      jr.id,
      jr.job_id AS "jobId",
      jr.started_at AS "startedAt",
      jr.finished_at AS "finishedAt",
      jr.status::text AS status,
      jr.summary,
      j.job_name AS "jobName"
     FROM job_runs jr
     INNER JOIN jobs j ON j.id = jr.job_id
     WHERE jr.company_id = $1
     ORDER BY jr.created_at DESC
     LIMIT 30`,
    [req.user.companyId]
  );
  return res.json({ items: result.rows });
});

module.exports = router;
