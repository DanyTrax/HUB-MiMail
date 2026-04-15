const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { jwtSecret } = require("../config");
const { requireAuth } = require("../middleware/auth");
const { normalizeEmailOrNull, normalizeSlugOrNull, safeTextOrNull } = require("../utils/input");

const router = express.Router();

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

module.exports = router;
