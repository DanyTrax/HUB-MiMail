const { Pool } = require("pg");
const { db } = require("./config");

const pool = new Pool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  max: 10
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
