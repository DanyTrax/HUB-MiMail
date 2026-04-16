const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const {
  normalizeEmailOrNull,
  normalizeSlugOrNull,
  safeTextOrNull
} = require("../utils/input");

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["superadmin"]));

router.get("/", async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, slug, is_active AS "isActive", created_at AS "createdAt"
     FROM companies
     ORDER BY created_at DESC`
  );
  return res.json({ items: rows });
});

/**
 * Crea empresa + primer usuario administrador de esa empresa (membership company_admin).
 */
router.post("/", async (req, res) => {
  const name = safeTextOrNull(req.body?.name, 160);
  const slug = normalizeSlugOrNull(req.body?.slug);
  const adminEmail = normalizeEmailOrNull(req.body?.adminEmail);
  const adminFullName = safeTextOrNull(req.body?.adminFullName, 160);
  const adminPassword = safeTextOrNull(req.body?.adminPassword, 256);

  if (!name || !slug) {
    return res.status(400).json({ error: "name y slug son requeridos (slug: minusculas y guiones)" });
  }
  if (!adminEmail || !adminFullName) {
    return res.status(400).json({
      error: "adminEmail y adminFullName son requeridos para el administrador de la empresa"
    });
  }

  const existingCheck = await db.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [adminEmail]);
  const isNewAdmin = !existingCheck.rows.length;
  if (isNewAdmin) {
    if (!adminPassword || adminPassword.length < 8) {
      return res.status(400).json({ error: "adminPassword es requerido (minimo 8 caracteres) para un usuario nuevo" });
    }
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const companyInsert = await client.query(
      `INSERT INTO companies (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug, is_active AS "isActive", created_at AS "createdAt"`,
      [name, slug]
    );
    const company = companyInsert.rows[0];

    const existing = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [adminEmail]);
    let userId;
    if (existing.rows.length) {
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE users SET full_name = $2, is_active = TRUE, updated_at = NOW() WHERE id = $1`,
        [userId, adminFullName]
      );
    } else {
      const hash = await bcrypt.hash(adminPassword, 12);
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [adminEmail, hash, adminFullName]
      );
      userId = inserted.rows[0].id;
    }

    await client.query(
      `INSERT INTO memberships (company_id, user_id, role)
       VALUES ($1, $2, 'company_admin'::app_role)
       ON CONFLICT (company_id, user_id)
       DO UPDATE SET role = 'company_admin'::app_role`,
      [company.id, userId]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      company,
      adminUserId: userId
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_rb) {
      // ignore
    }
    if (err.code === "23505") {
      return res.status(409).json({ error: "Empresa duplicada: name o slug ya existen" });
    }
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
