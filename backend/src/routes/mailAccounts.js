const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const {
  normalizeEmailOrNull,
  normalizeHostOrNull,
  safeTextOrNull
} = require("../utils/input");

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const query = `
    SELECT
      id,
      provider::text AS provider,
      source_email AS "sourceEmail",
      destination_email AS "destinationEmail",
      source_host AS "sourceHost",
      destination_host AS "destinationHost",
      is_active AS "isActive",
      metadata,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM mail_accounts
    WHERE company_id = $1
    ORDER BY created_at DESC
  `;

  const { rows } = await db.query(query, [req.user.companyId]);
  return res.json({ items: rows });
});

router.post(
  "/",
  requireRole(["superadmin", "company_admin", "operator"]),
  async (req, res) => {
    const provider = safeTextOrNull(req.body?.provider, 20);
    const sourceEmail = normalizeEmailOrNull(req.body?.sourceEmail);
    const destinationEmail = normalizeEmailOrNull(req.body?.destinationEmail);
    const sourceHost = normalizeHostOrNull(req.body?.sourceHost);
    const destinationHost = normalizeHostOrNull(req.body?.destinationHost);

    if (!provider || !["microsoft", "google", "imap"].includes(provider)) {
      return res.status(400).json({ error: "provider invalido" });
    }
    if (!sourceEmail) return res.status(400).json({ error: "sourceEmail invalido" });

    const metadata = typeof req.body?.metadata === "object" && req.body.metadata !== null
      ? req.body.metadata
      : {};

    const query = `
      INSERT INTO mail_accounts (
        company_id, provider, source_email, destination_email, source_host, destination_host, metadata
      )
      VALUES ($1, $2::provider_type, $3, $4, $5, $6, $7::jsonb)
      RETURNING
        id,
        provider::text AS provider,
        source_email AS "sourceEmail",
        destination_email AS "destinationEmail",
        source_host AS "sourceHost",
        destination_host AS "destinationHost",
        is_active AS "isActive",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    try {
      const { rows } = await db.query(query, [
        req.user.companyId,
        provider,
        sourceEmail,
        destinationEmail,
        sourceHost,
        destinationHost,
        JSON.stringify(metadata)
      ]);
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "La cuenta ya existe para esta empresa/proveedor" });
      }
      throw err;
    }
  }
);

router.patch(
  "/:id",
  requireRole(["superadmin", "company_admin", "operator"]),
  async (req, res) => {
    const accountId = safeTextOrNull(req.params.id, 36);
    if (!accountId) return res.status(400).json({ error: "id invalido" });

    const hasDestinationEmail = Object.prototype.hasOwnProperty.call(req.body || {}, "destinationEmail");
    const hasSourceHost = Object.prototype.hasOwnProperty.call(req.body || {}, "sourceHost");
    const hasDestinationHost = Object.prototype.hasOwnProperty.call(req.body || {}, "destinationHost");
    const hasIsActive = Object.prototype.hasOwnProperty.call(req.body || {}, "isActive");

    const destinationEmail = hasDestinationEmail ? normalizeEmailOrNull(req.body?.destinationEmail) : undefined;
    const sourceHost = hasSourceHost ? normalizeHostOrNull(req.body?.sourceHost) : undefined;
    const destinationHost = hasDestinationHost ? normalizeHostOrNull(req.body?.destinationHost) : undefined;
    const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : null;

    if (!hasDestinationEmail && !hasSourceHost && !hasDestinationHost && !hasIsActive) {
      return res.status(400).json({ error: "No hay campos validos para actualizar" });
    }
    if (hasDestinationEmail && destinationEmail === null) {
      return res.status(400).json({ error: "destinationEmail invalido" });
    }
    if (hasSourceHost && sourceHost === null) {
      return res.status(400).json({ error: "sourceHost invalido" });
    }
    if (hasDestinationHost && destinationHost === null) {
      return res.status(400).json({ error: "destinationHost invalido" });
    }
    if (hasIsActive && typeof req.body?.isActive !== "boolean") {
      return res.status(400).json({ error: "isActive debe ser boolean" });
    }

    const query = `
      UPDATE mail_accounts
      SET
        destination_email = COALESCE($3, destination_email),
        source_host = COALESCE($4, source_host),
        destination_host = COALESCE($5, destination_host),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
      RETURNING
        id,
        provider::text AS provider,
        source_email AS "sourceEmail",
        destination_email AS "destinationEmail",
        source_host AS "sourceHost",
        destination_host AS "destinationHost",
        is_active AS "isActive",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const { rows } = await db.query(query, [
      accountId,
      req.user.companyId,
      destinationEmail ?? null,
      sourceHost ?? null,
      destinationHost ?? null,
      hasIsActive ? isActive : null
    ]);

    if (!rows.length) return res.status(404).json({ error: "Cuenta no encontrada" });
    return res.json(rows[0]);
  }
);

router.delete(
  "/:id",
  requireRole(["superadmin", "company_admin", "operator"]),
  async (req, res) => {
    const accountId = safeTextOrNull(req.params.id, 36);
    if (!accountId) return res.status(400).json({ error: "id invalido" });

    const query = `
      UPDATE mail_accounts
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
      RETURNING id
    `;
    const { rows } = await db.query(query, [accountId, req.user.companyId]);
    if (!rows.length) return res.status(404).json({ error: "Cuenta no encontrada" });

    return res.status(204).send();
  }
);

router.delete(
  "/:id/permanent",
  requireRole(["superadmin", "company_admin", "operator"]),
  async (req, res) => {
    const accountId = safeTextOrNull(req.params.id, 36);
    if (!accountId) return res.status(400).json({ error: "id invalido" });

    const query = `
      DELETE FROM mail_accounts
      WHERE id = $1
        AND company_id = $2
      RETURNING id
    `;
    const { rows } = await db.query(query, [accountId, req.user.companyId]);
    if (!rows.length) return res.status(404).json({ error: "Cuenta no encontrada" });

    return res.status(204).send();
  }
);

module.exports = router;
