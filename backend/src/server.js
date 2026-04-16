require("./config");
const { port } = require("./config");
const app = require("./app");

// Defensa: si por version antigua en volumen o carga de modulos trust proxy queda en false,
// express-rate-limit registra ERR_ERL_UNEXPECTED_X_FORWARDED_FOR en /auth.
if (app.get("trust proxy") === false) {
  app.set("trust proxy", 1);
  // eslint-disable-next-line no-console
  console.warn(
    "[hub-backend] trust proxy estaba en false; se aplico 1 (reverse proxy / NPM / Cloudflare)."
  );
}

const { pool } = require("./db");

async function start() {
  try {
    await pool.query("SELECT 1");
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend escuchando en puerto ${port}`);
      // eslint-disable-next-line no-console
      console.log(`[hub-backend] trust proxy = ${app.get("trust proxy")}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("No se pudo iniciar backend:", err.message);
    process.exit(1);
  }
}

start();
