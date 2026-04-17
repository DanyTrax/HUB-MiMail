const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { normalizeSlugOrNull, safeTextOrNull } = require("../utils/input");

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
 * Crea empresa y vincula al superadmin actual a la nueva empresa.
 */
router.post("/", async (req, res) => {
  const name = safeTextOrNull(req.body?.name, 160);
  const slug = normalizeSlugOrNull(req.body?.slug);

  if (!name || !slug) {
    return res.status(400).json({ error: "name y slug son requeridos (slug: minusculas y guiones)" });
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

    await client.query(
      `INSERT INTO memberships (company_id, user_id, role)
       VALUES ($1, $2, 'superadmin'::app_role)
       ON CONFLICT (company_id, user_id)
       DO UPDATE SET role = 'superadmin'::app_role`,
      [company.id, req.user.sub]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      company
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
