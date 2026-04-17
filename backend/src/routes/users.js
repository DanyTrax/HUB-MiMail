const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { normalizeEmailOrNull, safeTextOrNull } = require("../utils/input");

const router = express.Router();
const ALLOWED_ROLES = ["superadmin", "company_admin", "operator", "scheduler", "viewer"];

router.use(requireAuth);
router.use(requireRole(["superadmin", "company_admin"]));

async function resolveTargetCompanyId(req) {
  const requestedCompanyId = safeTextOrNull(req.body?.companyId || req.query?.companyId, 36);
  if (!requestedCompanyId) return req.user.companyId;
  if (req.user.role !== "superadmin") {
    return null;
  }
  const exists = await db.query("SELECT id FROM companies WHERE id = $1 LIMIT 1", [requestedCompanyId]);
  return exists.rows.length ? requestedCompanyId : null;
}

router.get("/", async (req, res) => {
  const companyId = await resolveTargetCompanyId(req);
  if (!companyId) {
    return res.status(400).json({ error: "companyId invalido o no autorizado" });
  }
  const query = `
    SELECT
      u.id,
      u.email,
      u.full_name AS "fullName",
      u.is_active AS "isActive",
      m.role::text AS role,
      m.company_id AS "companyId",
      u.created_at AS "createdAt"
    FROM memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.company_id = $1
    ORDER BY u.created_at DESC
  `;
  const { rows } = await db.query(query, [companyId]);
  return res.json({ items: rows });
});

router.post("/", async (req, res) => {
  const companyId = await resolveTargetCompanyId(req);
  if (!companyId) {
    return res.status(400).json({ error: "companyId invalido o no autorizado" });
  }
  const email = normalizeEmailOrNull(req.body?.email);
  const fullName = safeTextOrNull(req.body?.fullName, 160);
  const password = safeTextOrNull(req.body?.password, 256);
  const role = safeTextOrNull(req.body?.role, 30);

  if (!email || !fullName || !role) {
    return res.status(400).json({ error: "email, fullName y role son requeridos" });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: "role invalido" });
  }

  const existing = await db.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
  let userId;

  if (existing.rows.length) {
    userId = existing.rows[0].id;
    await db.query(
      "UPDATE users SET full_name = $2, is_active = TRUE, updated_at = NOW() WHERE id = $1",
      [userId, fullName]
    );
  } else {
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "password debe tener al menos 8 caracteres para usuario nuevo" });
    }
    const hash = await bcrypt.hash(password, 12);
    const inserted = await db.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, hash, fullName]
    );
    userId = inserted.rows[0].id;
  }

  await db.query(
    `INSERT INTO memberships (company_id, user_id, role)
     VALUES ($1, $2, $3::app_role)
     ON CONFLICT (company_id, user_id)
     DO UPDATE SET role = EXCLUDED.role`,
    [companyId, userId, role]
  );

  const result = await db.query(
    `SELECT
      u.id,
      u.email,
      u.full_name AS "fullName",
      u.is_active AS "isActive",
      m.role::text AS role,
      m.company_id AS "companyId",
      u.created_at AS "createdAt"
     FROM memberships m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND m.user_id = $2`,
    [companyId, userId]
  );
  return res.status(201).json(result.rows[0]);
});

router.patch("/:id/role", async (req, res) => {
  const companyId = await resolveTargetCompanyId(req);
  if (!companyId) {
    return res.status(400).json({ error: "companyId invalido o no autorizado" });
  }
  const userId = safeTextOrNull(req.params.id, 36);
  const role = safeTextOrNull(req.body?.role, 30);

  if (!userId || !role) return res.status(400).json({ error: "id y role son requeridos" });
  if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: "role invalido" });

  const updated = await db.query(
    `UPDATE memberships
     SET role = $3::app_role
     WHERE company_id = $1 AND user_id = $2
     RETURNING user_id`,
    [companyId, userId, role]
  );
  if (!updated.rows.length) return res.status(404).json({ error: "Usuario no encontrado en esta empresa" });

  return res.json({ ok: true, userId, role });
});

module.exports = router;
