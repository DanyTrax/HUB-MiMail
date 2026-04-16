const express = require("express");
const cors = require("cors");
const { corsOrigin } = require("./config");
const { baseHelmet, authRateLimiter } = require("./middleware/security");
const authRoutes = require("./routes/auth");
const protectedRoutes = require("./routes/protected");
const mailAccountRoutes = require("./routes/mailAccounts");
const userRoutes = require("./routes/users");
const jobRoutes = require("./routes/jobs");
const oauthConfigRoutes = require("./routes/oauthConfigs");
const companyRoutes = require("./routes/companies");

const app = express();

// Detras de Nginx Proxy Manager / Cloudflare llega X-Forwarded-*.
// express-rate-limit requiere trust proxy para no lanzar ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
function resolveTrustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || String(raw).trim() === "") {
    return 1;
  }
  const trimmed = String(raw).trim();
  const lower = trimmed.toLowerCase();
  if (["1", "true", "yes", "on"].includes(lower)) {
    return 1;
  }
  // "0" debe ir antes del chequeo numerico: /^\d+$/ incluye "0" y Number("0") rompe detras de proxy.
  if (["0", "false", "no", "off"].includes(lower)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[hub-backend] TRUST_PROXY desactiva trust proxy; con reverse proxy debe ser al menos 1. Usando 1. Quita TRUST_PROXY o pon TRUST_PROXY=1 en .env."
    );
    return 1;
  }
  // Solo enteros >= 1 (saltos de proxy). "00" u otros quedan fuera y se tratan como string para Express.
  if (/^[1-9]\d*$/.test(trimmed)) {
    return Number(trimmed);
  }
  // Valores tipo "loopback, linklocal, uniquelocal" (documentacion Express)
  return trimmed;
}

app.set("trust proxy", resolveTrustProxy());

app.disable("x-powered-by");
app.use(baseHelmet);
app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  })
);
app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "backend", status: "up" });
});

app.use("/auth", authRateLimiter, authRoutes);
app.use("/protected", protectedRoutes);
app.use("/mail-accounts", mailAccountRoutes);
app.use("/users", userRoutes);
app.use("/jobs", jobRoutes);
app.use("/oauth-configs", oauthConfigRoutes);
app.use("/companies", companyRoutes);

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

module.exports = app;
