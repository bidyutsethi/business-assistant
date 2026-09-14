// Integration test: runs the real Express app + real schema.sql against an
// in-memory Postgres-compatible engine (pg-mem), so we can verify the actual
// SQL and route logic work before touching a real database.

process.env.JWT_SECRET = "test-secret";
process.env.PORT = "4501";
process.env.CORS_ORIGIN = "http://localhost:8790";
process.env.NODE_ENV = "test";

const fs = require("fs");
const path = require("path");
const { newDb } = require("pg-mem");

const memDb = newDb({ autoCreateForeignKeyIndices: true });

// pg-mem only implements a small native function set. Real Postgres (and
// Render's managed Postgres) has date_trunc/to_char natively — these are
// test-only polyfills so we can verify the app's date logic here too.
function truncMonth(d) {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
for (const argType of ["timestamp", "timestamptz"]) {
  memDb.public.registerFunction({
    name: "date_trunc",
    args: ["text", argType],
    returns: argType,
    implementation: (unit, val) => (unit === "month" ? truncMonth(val) : new Date(val)),
  });
  memDb.public.registerFunction({
    name: "to_char",
    args: [argType, "text"],
    returns: "text",
    implementation: (val, fmt) =>
      fmt === "Mon" ? new Date(val).toLocaleString("en-US", { month: "short", timeZone: "UTC" }) : new Date(val).toISOString(),
  });
}

const pgAdapter = memDb.adapters.createPg();

// Redirect every `require('pg')` in the app to the in-memory adapter.
const pgPath = require.resolve("pg");
require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: pgAdapter };

const schemaSql = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
memDb.public.none(schemaSql);

const BASE = `http://localhost:${process.env.PORT}`;
const results = [];
const check = (name, cond) => results.push({ name, pass: !!cond });

async function main() {
  require("../server");
  await new Promise((r) => setTimeout(r, 300));

  let res = await fetch(`${BASE}/api/health`);
  check("health endpoint returns ok", res.status === 200 && (await res.json()).status === "ok");

  res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Alex Morgan",
      company: "Acme Intl",
      email: "alex@acme.test",
      password: "supersecret123",
    }),
  });
  const signupBody = await res.json();
  check("signup returns 201", res.status === 201);
  check("signup returns a token", typeof signupBody.token === "string");
  const token = signupBody.token;

  res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Alex Morgan",
      company: "Acme Intl",
      email: "alex@acme.test",
      password: "supersecret123",
    }),
  });
  check("duplicate signup returns 409", res.status === 409);

  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alex@acme.test", password: "wrongpassword" }),
  });
  check("wrong password returns 401", res.status === 401);

  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alex@acme.test", password: "supersecret123" }),
  });
  const loginBody = await res.json();
  check("login returns 200", res.status === 200);
  check("login returns matching user email", loginBody.user.email === "alex@acme.test");

  res = await fetch(`${BASE}/api/auth/me`);
  check("me without token returns 401", res.status === 401);

  res = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const meBody = await res.json();
  check("me with token returns 200", res.status === 200);
  check("me returns correct fullName", meBody.user.fullName === "Alex Morgan");

  res = await fetch(`${BASE}/api/dashboard/summary`);
  check("dashboard summary without token returns 401", res.status === 401);

  const { Pool } = pgAdapter;
  const pool = new Pool();
  const custRes = await pool.query(
    `INSERT INTO customers (name, region) VALUES ($1,$2) RETURNING id`,
    ["Test Co", "North America"]
  );
  const custId = custRes.rows[0].id;
  await pool.query(
    `INSERT INTO orders (order_number, customer_id, amount, status, region) VALUES ($1,$2,$3,$4,$5)`,
    ["#1001", custId, 500, "fulfilled", "North America"]
  );
  await pool.query(
    `INSERT INTO orders (order_number, customer_id, amount, status, region) VALUES ($1,$2,$3,$4,$5)`,
    ["#1002", custId, 700, "processing", "North America"]
  );
  await pool.query(
    `INSERT INTO support_tickets (subject, customer_id, region, status) VALUES ($1,$2,$3,$4)`,
    ["Order status", custId, "North America", "open"]
  );
  await pool.query(`INSERT INTO tasks (title, status) VALUES ($1,$2)`, ["Review test task", "open"]);

  res = await fetch(`${BASE}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
  const summaryBody = await res.json();
  check("dashboard summary returns 200", res.status === 200);
  check(
    "dashboard summary revenue reflects seeded orders",
    typeof summaryBody.revenue === "number" && summaryBody.revenue >= 1200
  );

  res = await fetch(`${BASE}/api/dashboard/revenue-trend`, { headers: { Authorization: `Bearer ${token}` } });
  const trendBody = await res.json();
  check("revenue-trend returns 200", res.status === 200);
  check("revenue-trend returns an array", Array.isArray(trendBody.trend));

  res = await fetch(`${BASE}/api/dashboard/recent-orders`, { headers: { Authorization: `Bearer ${token}` } });
  const ordersBody = await res.json();
  check("recent-orders returns 200", res.status === 200);
  check(
    "recent-orders includes seeded order",
    ordersBody.orders.some((o) => o.order_number === "#1002")
  );

  res = await fetch(`${BASE}/api/dashboard/tasks`, { headers: { Authorization: `Bearer ${token}` } });
  const tasksBody = await res.json();
  check("tasks returns 200", res.status === 200);
  check(
    "tasks includes seeded task",
    tasksBody.tasks.some((t) => t.title === "Review test task")
  );

  res = await fetch(`${BASE}/api/dashboard/insights`, { headers: { Authorization: `Bearer ${token}` } });
  const insightsBody = await res.json();
  check("insights returns 200", res.status === 200);
  check("insights has insight text", typeof insightsBody.insight === "string");

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
