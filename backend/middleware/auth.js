const jwt = require("jsonwebtoken");
const pool = require("../db");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Access levels are read from the database on each check (not baked into the
// JWT), so an admin changing someone's access takes effect immediately.
async function getAccessLevel(userId) {
  const result = await pool.query("SELECT access_level FROM users WHERE id = $1", [userId]);
  return result.rows[0] ? result.rows[0].access_level : null;
}

// Viewers are read-only: GETs pass straight through, anything that changes
// data needs member or admin access. Use after requireAuth.
async function requireEditor(req, res, next) {
  if (req.method === "GET") return next();
  const level = await getAccessLevel(req.userId);
  if (!level) return res.status(401).json({ error: "Invalid or expired token." });
  if (level === "viewer") {
    return res.status(403).json({ error: "Your account is view-only. Ask an admin for edit access." });
  }
  next();
}

async function requireAdmin(req, res, next) {
  const level = await getAccessLevel(req.userId);
  if (!level) return res.status(401).json({ error: "Invalid or expired token." });
  if (level !== "admin") {
    return res.status(403).json({ error: "Only an admin can do this." });
  }
  next();
}

module.exports = { requireAuth, requireEditor, requireAdmin, getAccessLevel };
