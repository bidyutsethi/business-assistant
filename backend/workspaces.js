// Workspace lifecycle: creating one for a new signup, and the one-off move of
// pre-workspace data into a workspace of its own.

const crypto = require("crypto");
const pool = require("./db");
const { ensureReferenceData } = require("./seedData");
const { ownerEmails } = require("./middleware/auth");

const WORKSPACE_TABLES = ["users", "customers", "orders", "support_tickets", "tasks", "workflows", "integrations"];

function newInviteCode() {
  return crypto.randomBytes(12).toString("hex");
}

async function createWorkspace(name) {
  const result = await pool.query(
    `INSERT INTO workspaces (name, invite_code) VALUES ($1, $2) RETURNING id, name, invite_code`,
    [name, newInviteCode()]
  );
  const workspace = result.rows[0];
  await ensureReferenceData(workspace.id);
  return workspace;
}

// Before workspaces existed, every account shared one set of data. Rows left
// over from then have no workspace_id; this gathers them all into a single
// workspace so those accounts keep exactly what they had. Safe to run on
// every startup — it does nothing once no such rows remain.
async function migrateLegacyData() {
  const orphaned = [];
  for (const table of WORKSPACE_TABLES) {
    const result = await pool.query(`SELECT id FROM ${table} WHERE workspace_id IS NULL LIMIT 1`);
    if (result.rows.length) orphaned.push(table);
  }
  if (!orphaned.length) return;

  const existing = await pool.query(`SELECT id FROM workspaces ORDER BY id ASC LIMIT 1`);
  let workspaceId = existing.rows[0] && existing.rows[0].id;
  if (!workspaceId) {
    const owner = await pool.query(`SELECT company FROM users ORDER BY id ASC LIMIT 1`);
    const name = (owner.rows[0] && owner.rows[0].company) || "Main workspace";
    // Inserted directly rather than via createWorkspace: the legacy workflows
    // and integrations are about to be moved in, so it must not get new ones.
    const created = await pool.query(`INSERT INTO workspaces (name, invite_code) VALUES ($1, $2) RETURNING id`, [
      name,
      newInviteCode(),
    ]);
    workspaceId = created.rows[0].id;
  }

  for (const table of orphaned) {
    await pool.query(`UPDATE ${table} SET workspace_id = $1 WHERE workspace_id IS NULL`, [workspaceId]);
  }
  await ensureReferenceData(workspaceId);

  const admins = await pool.query(
    `SELECT id FROM users WHERE workspace_id = $1 AND access_level = 'admin' LIMIT 1`,
    [workspaceId]
  );
  if (!admins.rows.length) {
    const first = await pool.query(`SELECT id FROM users WHERE workspace_id = $1 ORDER BY id ASC LIMIT 1`, [workspaceId]);
    if (first.rows.length) {
      await pool.query(`UPDATE users SET access_level = 'admin' WHERE id = $1`, [first.rows[0].id]);
    }
  }
}

// The site owner (OWNER_EMAIL) should be able to manage their own workspace
// too, so make sure that account is an admin. Runs on every startup.
async function promoteOwner() {
  for (const email of ownerEmails()) {
    await pool.query(`UPDATE users SET access_level = 'admin' WHERE email = $1`, [email]);
  }
}

module.exports = { createWorkspace, migrateLegacyData, promoteOwner, newInviteCode };
