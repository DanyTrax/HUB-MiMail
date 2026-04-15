const app = require("./app");
const { port } = require("./config");
const { pool } = require("./db");

async function start() {
  try {
    await pool.query("SELECT 1");
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend escuchando en puerto ${port}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("No se pudo iniciar backend:", err.message);
    process.exit(1);
  }
}

start();
