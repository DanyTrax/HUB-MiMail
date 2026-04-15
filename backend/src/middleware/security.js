const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const baseHelmet = helmet({
  contentSecurityPolicy: false
});

const authRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Intenta de nuevo en unos minutos." }
});

module.exports = {
  baseHelmet,
  authRateLimiter
};
