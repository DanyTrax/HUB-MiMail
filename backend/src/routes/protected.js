const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();

router.get("/health-auth", requireAuth, (req, res) => {
  return res.json({
    ok: true,
    message: "Token valido",
    user: req.user
  });
});

router.get(
  "/scheduler",
  requireAuth,
  requireRole(["superadmin", "company_admin", "scheduler"]),
  (req, res) => {
    return res.json({
      ok: true,
      message: "Acceso permitido al modulo de programacion",
      role: req.user.role
    });
  }
);

router.get(
  "/operator",
  requireAuth,
  requireRole(["superadmin", "company_admin", "operator"]),
  (req, res) => {
    return res.json({
      ok: true,
      message: "Acceso permitido al modulo operativo",
      role: req.user.role
    });
  }
);

module.exports = router;
