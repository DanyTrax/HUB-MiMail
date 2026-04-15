const validator = require("validator");

const DANGEROUS_PATTERN = /<\s*script|javascript:|data:text\/html|on\w+\s*=|<|>/i;

function normalizeText(value, maxLen = 255) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLen);
}

function rejectDangerous(value) {
  return DANGEROUS_PATTERN.test(value);
}

function safeTextOrNull(value, maxLen = 255) {
  if (value === undefined || value === null) return null;
  const normalized = normalizeText(value, maxLen);
  if (!normalized) return null;
  if (rejectDangerous(normalized)) return null;
  return normalized;
}

function normalizeEmailOrNull(value) {
  const normalized = normalizeText(value, 190).toLowerCase();
  if (!normalized || !validator.isEmail(normalized)) return null;
  return normalized;
}

function normalizeSlugOrNull(value) {
  const normalized = normalizeText(value, 120).toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) return null;
  return normalized;
}

function normalizeHostOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = normalizeText(value, 190).toLowerCase();
  if (!normalized) return null;
  if (normalized === "localhost") return normalized;
  const isFqdn = validator.isFQDN(normalized, { require_tld: false });
  const isIp = validator.isIP(normalized);
  return isFqdn || isIp ? normalized : null;
}

function normalizeUrlOrNull(value, maxLen = 300) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = normalizeText(value, maxLen);
  if (!normalized) return null;
  const isValid = validator.isURL(normalized, {
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false
  });
  return isValid ? normalized : null;
}

module.exports = {
  safeTextOrNull,
  normalizeEmailOrNull,
  normalizeSlugOrNull,
  normalizeHostOrNull,
  normalizeUrlOrNull
};
