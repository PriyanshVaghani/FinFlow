/**
 * Redacts sensitive fields before logging so passwords/tokens never appear in logs.
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "authorization",
  "auth",
]);

const redactSensitive = (value, depth = 0) => {
  if (value == null || depth > 4) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }

  if (typeof value === "object") {
    const sanitized = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = redactSensitive(nested, depth + 1);
      }
    }
    return sanitized;
  }

  return value;
};

module.exports = { redactSensitive };
