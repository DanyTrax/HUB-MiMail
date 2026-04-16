const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = Number(process.env.APP_PORT || 3000);
const apiTarget = process.env.API_BASE_URL || process.env.API_PROXY_TARGET || "http://127.0.0.1:4000";

app.use(
  "/api",
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    pathRewrite: { "^/api": "" }
  })
);

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "frontend", status: "up" });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Frontend escuchando en puerto ${port}, proxy /api -> ${apiTarget}`);
});
