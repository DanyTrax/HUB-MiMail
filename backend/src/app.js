const express = require("express");
const cors = require("cors");
const { corsOrigin } = require("./config");
const { baseHelmet, authRateLimiter } = require("./middleware/security");
const authRoutes = require("./routes/auth");
const protectedRoutes = require("./routes/protected");
const mailAccountRoutes = require("./routes/mailAccounts");

const app = express();

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

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

module.exports = app;
