/**
 * Input sanitization middleware.
 * Strips NUL bytes and trims strings throughout req.body to prevent
 * injection of control characters into DB queries and AI prompts.
 * This is a lightweight defense-in-depth measure — validation is still
 * the primary control and lives in the service layer.
 */

/**
 * Recursively sanitize a value:
 * - Strings: trim + remove NUL / non-printable control chars (except tab/newline)
 * - Objects/Arrays: recurse
 * - Everything else: pass through
 */
function sanitize(value) {
  if (typeof value === "string") {
    // Remove NUL bytes and C0/C1 control chars (keep \t \n \r)
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = sanitize(value[key]);
    }
    return result;
  }
  return value;
}

/**
 * Express middleware — sanitizes req.body in place.
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitize(req.body);
  }
  next();
}

module.exports = sanitizeBody;
