function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: "Sin rol asignado" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "No autorizado para esta accion" });
    }

    return next();
  };
}

module.exports = { requireRole };
