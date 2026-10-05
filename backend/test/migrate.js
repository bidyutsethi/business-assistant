// Integration test for the one-off move of pre-workspace data into a
// workspace. Fills the database the way it looked before workspaces existed
// (accounts and data with no workspace_id), runs the same migration the
// server runs on startup, and checks that those accounts kept everything
// and nobody else can see it.
//
// The server is booted first, on an empty database, because pg-mem can't
// re-run schema.sql over tables that already exist (real Postgres can).

process.env.JWT_SECRET = "test-secret";
process.env.PORT = "4504";
process.env.CORS_ORIGIN = "http://localhost:8790";
process.env.NODE_ENV = "test";
process.env.ADMIN_SEED_KEY = "test-seed-key";

const bcrypt = require("bcryptjs");
const { setupTestDb } = require("./setup");
const { pgAdapter } = setupTestDb();

const BASE = `http://localhost:${process.env.PORT}`;
const results = [];
const check = (name, cond) => results.push({ name, pass: !!cond });

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "supersecret123" }),
  });
  return res.json();
}

const get = async (token, p) =>
  (await fetch(`${BASE}/api${p}`, { headers: { Authorization: `Bearer ${token}` } })).json();

async function main() {
  require("../server");
  await new Promise((r) => setTimeout(r, 700));
  const pool = new pgAdapter.Pool();

  // --- A pre-workspace database: nothing has a workspace_id, nobody is admin.
  const hash = await bcrypt.hash("supersecret123", 4);
  for (const [name, email] of [["Old Owner", "old-owner@legacy.test"], ["Old Teammate", "old-mate@legacy.test"]]) {
    await pool.query(
      `INSERT INTO users (full_name, company, email, password_hash) VALUES ($1, $2, $3, $4)`,
      [name, "Legacy Ltd", email, hash]
    );
  }
  const cust = await pool.query(`INSERT INTO customers (name, region) VALUES ($1, $2) RETURNING id`, ["Legacy Customer", "Europe"]);
  await pool.query(
    `INSERT INTO orders (order_number, customer_id, amount, status, region) VALUES ($1, $2, $3, $4, $5)`,
    ["#5001", cust.rows[0].id, 900, "fulfilled", "Europe"]
  );
  await pool.query(
    `INSERT INTO support_tickets (subject, customer_id, region, status) VALUES ($1, $2, $3, $4)`,
    ["Legacy ticket", cust.rows[0].id, "Europe", "open"]
  );
  await pool.query(`INSERT INTO tasks (title, status) VALUES ($1, $2)`, ["Legacy task", "open"]);
  await pool.query(
    `INSERT INTO workflows (name, description, trigger_label, action_label, enabled) VALUES ($1, $2, $3, $4, false)`,
    ["Legacy workflow", "Kept from before", "Trigger", "Action"]
  );
  await pool.query(`INSERT INTO integrations (name, category, connected) VALUES ($1, $2, true)`, ["Legacy integration", "data"]);

  const { migrateLegacyData } = require("../workspaces");
  await migrateLegacyData();

  const workspaces = await pool.query(`SELECT id, name FROM workspaces`);
  check("the legacy data is moved into exactly one workspace", workspaces.rows.length === 1);
  check("that workspace is named after the first account's company", workspaces.rows[0].name === "Legacy Ltd");

  for (const table of ["users", "customers", "orders", "support_tickets", "tasks", "workflows", "integrations"]) {
    const left = await pool.query(`SELECT id FROM ${table} WHERE workspace_id IS NULL`);
    check(`no ${table} rows are left without a workspace`, left.rows.length === 0);
  }

  const owner = await login("old-owner@legacy.test");
  const mate = await login("old-mate@legacy.test");
  check("the earliest legacy account becomes the admin", owner.user.accessLevel === "admin");
  check("other legacy accounts stay members", mate.user.accessLevel === "member");
  check("legacy accounts share the workspace", owner.user.workspaceName === "Legacy Ltd" && mate.user.workspaceName === "Legacy Ltd");

  check("legacy customers are still there", (await get(owner.token, "/customers")).customers.some((c) => c.name === "Legacy Customer"));
  check("legacy orders are still there", (await get(mate.token, "/orders")).orders.some((o) => o.order_number === "#5001"));
  check("legacy tickets are still there", (await get(owner.token, "/support")).tickets.some((t) => t.subject === "Legacy ticket"));
  check("legacy tasks are still there", (await get(owner.token, "/tasks")).tasks.some((t) => t.title === "Legacy task"));

  const workflows = (await get(owner.token, "/workflows")).workflows;
  check("legacy workflows keep their state and aren't duplicated", workflows.length === 1 && workflows[0].enabled === false);
  const integrations = (await get(owner.token, "/integrations")).integrations;
  check("legacy integrations keep their state and aren't duplicated", integrations.length === 1 && integrations[0].connected === true);
  check("the legacy team is both accounts", (await get(owner.token, "/team")).members.length === 2);

  // --- Someone new signing up afterwards must not see any of it.
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "New Person", company: "Newco", email: "new@newco.test", password: "supersecret123" }),
  });
  const fresh = await res.json();
  check("a new signup gets a separate workspace", fresh.user.workspaceName === "Newco" && fresh.user.accessLevel === "admin");
  check("a new signup sees none of the legacy customers", (await get(fresh.token, "/customers")).customers.length === 0);
  check("a new signup sees none of the legacy orders", (await get(fresh.token, "/orders")).orders.length === 0);
  check("a new signup sees none of the legacy team", (await get(fresh.token, "/team")).members.length === 1);
  check("the legacy workspace doesn't gain the new account", (await get(owner.token, "/team")).members.length === 2);

  // --- Running the migration again changes nothing.
  await migrateLegacyData();
  check("re-running the migration creates no extra workspaces", (await pool.query(`SELECT id FROM workspaces`)).rows.length === 2);
  check("re-running the migration duplicates nothing", (await get(owner.token, "/workflows")).workflows.length === 1);

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
