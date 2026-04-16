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

const app = express();

// Detras de Nginx Proxy Manager / Cloudflare llega X-Forwarded-*.
// express-rate-limit requiere trust proxy para no lanzar ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
const trustProxy = String(process.env.TRUST_PROXY || "1").toLowerCase();
if (["1", "true", "yes", "on"].includes(trustProxy)) {
  app.set("trust proxy", 1);
} else if (trustProxy && trustProxy !== "0" && trustProxy !== "false") {
  // Permite valores como "loopback, linklocal, uniquelocal" segun documentacion de Express
  app.set("trust proxy", process.env.TRUST_PROXY);
}

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

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

module.exports = app;
