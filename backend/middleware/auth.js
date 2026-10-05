const jwt = require("jsonwebtoken");
const pool = require("../db");

// Verifies the token, then loads the account from the database so every
// request knows its workspace and access level. Reading these fresh (rather
// than baking them into the JWT) means an admin changing someone's access —
// or removing them — takes effect on their very next request.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token." });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  const result = await pool.query("SELECT id, workspace_id, access_level FROM users WHERE id = $1", [payload.sub]);
  const user = result.rows[0];
  if (!user || !user.workspace_id) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  req.userId = user.id;
  req.workspaceId = user.workspace_id;
  req.accessLevel = user.access_level;
  next();
}

// Viewers are read-only: GETs pass straight through, anything that changes
// data needs member or admin access. Use after requireAuth.
function requireEditor(req, res, next) {
  if (req.method !== "GET" && req.accessLevel === "viewer") {
    return res.status(403).json({ error: "Your account is view-only. Ask an admin for edit access." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.accessLevel !== "admin") {
    return res.status(403).json({ error: "Only an admin can do this." });
  }
  next();
}

module.exports = { requireAuth, requireEditor, requireAdmin };
