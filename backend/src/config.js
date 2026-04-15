const dotenv = require("dotenv");

dotenv.config({ path: "../.env" });
dotenv.config();

const required = ["JWT_SECRET", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"];
for (const key of required) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.warn(`Advertencia: falta variable de entorno ${key}`);
  }
}

module.exports = {
  port: Number(process.env.API_PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "change_me",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  microsoftOAuth: {
    clientId: process.env.MS_CLIENT_ID || "",
    clientSecret: process.env.MS_CLIENT_SECRET || "",
    tenantId: process.env.MS_TENANT_ID || "common",
    redirectUri: process.env.MS_REDIRECT_URI || "http://localhost:4000/auth/microsoft/callback"
  },
  db: {
    host: process.env.DB_HOST || "postgres",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.POSTGRES_USER || "hub_user",
    password: process.env.POSTGRES_PASSWORD || "change_me",
    database: process.env.POSTGRES_DB || "hub_migracion"
  }
};
