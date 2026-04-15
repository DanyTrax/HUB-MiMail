const express = require("express");
const path = require("path");

const app = express();
const port = Number(process.env.APP_PORT || 3000);

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "frontend", status: "up" });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Frontend escuchando en puerto ${port}`);
});
