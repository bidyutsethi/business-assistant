// Integration test for access levels (admin / member / viewer), admin team
// management, and the built-in assistant — run against the real Express app
// and real SQL, with an in-memory Postgres-compatible engine as the database.

process.env.JWT_SECRET = "test-secret";
process.env.PORT = "4503";
process.env.CORS_ORIGIN = "http://localhost:8790";
process.env.NODE_ENV = "test";
process.env.ADMIN_SEED_KEY = "test-seed-key";

const { setupTestDb } = require("./setup");
setupTestDb();

const BASE = `http://localhost:${process.env.PORT}`;
const results = [];
const check = (name, cond) => results.push({ name, pass: !!cond });

const json = (token) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

async function signup(fullName, email) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, company: "Test Co", email, password: "supersecret123" }),
  });
  return res.json();
}

async function ask(token, message) {
  const res = await fetch(`${BASE}/api/assistant/ask`, {
    method: "POST",
    headers: json(token),
    body: JSON.stringify({ message }),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  require("../server");
  await new Promise((r) => setTimeout(r, 500));

  let res = await fetch(`${BASE}/api/admin/seed`, { method: "POST", headers: { "X-Seed-Key": "test-seed-key" } });
  check("seed succeeds", res.status === 200);

  // ---------------- Access levels at signup ----------------
  const owner = await signup("Olive Owner", "owner@example.test");
  const member = await signup("Max Member", "member@example.test");
  check("first account is an admin", owner.user.accessLevel === "admin");
  check("later accounts are members", member.user.accessLevel === "member");

  res = await fetch(`${BASE}/api/team`, { headers: json(owner.token) });
  const team = await res.json();
  check("team lists access levels", team.members.every((m) => !!m.access_level));
  check("team reports the caller's own access", team.me.accessLevel === "admin" && team.me.id === owner.user.id);

  // ---------------- Admin-only team management ----------------
  res = await fetch(`${BASE}/api/team/${owner.user.id}/access`, {
    method: "PUT",
    headers: json(member.token),
    body: JSON.stringify({ accessLevel: "viewer" }),
  });
  check("a member can't change access levels", res.status === 403);

  res = await fetch(`${BASE}/api/team/${owner.user.id}/access`, {
    method: "PUT",
    headers: json(owner.token),
    body: JSON.stringify({ accessLevel: "member" }),
  });
  check("the last admin can't be demoted", res.status === 409);

  res = await fetch(`${BASE}/api/team/${member.user.id}/access`, {
    method: "PUT",
    headers: json(owner.token),
    body: JSON.stringify({ accessLevel: "superuser" }),
  });
  check("unknown access level is rejected", res.status === 400);

  res = await fetch(`${BASE}/api/team/${member.user.id}/access`, {
    method: "PUT",
    headers: json(owner.token),
    body: JSON.stringify({ accessLevel: "viewer" }),
  });
  check("an admin can make a member a viewer", res.status === 200 && (await res.json()).member.access_level === "viewer");

  // ---------------- Viewers are read-only ----------------
  res = await fetch(`${BASE}/api/customers`, { headers: json(member.token) });
  check("a viewer can still read customers", res.status === 200);

  res = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: json(member.token),
    body: JSON.stringify({ name: "Should Not Exist", region: "Europe" }),
  });
  check("a viewer can't create customers", res.status === 403);

  res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: json(member.token),
    body: JSON.stringify({ title: "Should not exist" }),
  });
  check("a viewer can't create tasks", res.status === 403);

  res = await fetch(`${BASE}/api/workflows/1/toggle`, { method: "PUT", headers: json(member.token) });
  check("a viewer can't toggle workflows", res.status === 403);

  res = await fetch(`${BASE}/api/auth/me`, {
    method: "PUT",
    headers: json(member.token),
    body: JSON.stringify({ fullName: "Max Viewer", company: "Test Co" }),
  });
  check("a viewer can still edit their own profile", res.status === 200);

  res = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: json(owner.token),
    body: JSON.stringify({ name: "Admin Made Co", region: "Europe" }),
  });
  check("an admin can create customers", res.status === 201);

  // ---------------- Admin password reset ----------------
  res = await fetch(`${BASE}/api/team/${member.user.id}/reset-password`, { method: "POST", headers: json(member.token) });
  check("a non-admin can't reset passwords", res.status === 403);

  res = await fetch(`${BASE}/api/team/${member.user.id}/reset-password`, { method: "POST", headers: json(owner.token) });
  const reset = await res.json();
  check("an admin gets a temporary password", res.status === 200 && reset.temporaryPassword.length >= 10);

  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.test", password: "supersecret123" }),
  });
  check("the old password stops working after a reset", res.status === 401);

  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.test", password: reset.temporaryPassword }),
  });
  check("the temporary password works", res.status === 200);

  // ---------------- make-admin recovery endpoint ----------------
  res = await fetch(`${BASE}/api/admin/make-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Seed-Key": "wrong" },
    body: JSON.stringify({ email: "member@example.test" }),
  });
  check("make-admin rejects a wrong key", res.status === 401);

  res = await fetch(`${BASE}/api/admin/make-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Seed-Key": "test-seed-key" },
    body: JSON.stringify({ email: "member@example.test" }),
  });
  check("make-admin promotes the account", res.status === 200 && (await res.json()).user.access_level === "admin");

  // ---------------- Removing a member ----------------
  res = await fetch(`${BASE}/api/team/${owner.user.id}`, { method: "DELETE", headers: json(owner.token) });
  check("an admin can't remove their own account", res.status === 409);

  const extra = await signup("Tom Temp", "temp@example.test");
  res = await fetch(`${BASE}/api/team/${extra.user.id}`, { method: "DELETE", headers: json(owner.token) });
  check("an admin can remove a member", res.status === 200);

  res = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: json(extra.token),
    body: JSON.stringify({ name: "Ghost Co", region: "Europe" }),
  });
  check("a removed account's token can no longer write", res.status === 401);

  // ---------------- Assistant ----------------
  res = await fetch(`${BASE}/api/assistant/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("assistant requires auth", res.status === 401);

  let a = await ask(owner.token, "");
  check("assistant rejects an empty question", a.status === 400);

  a = await ask(owner.token, "What is our revenue this month?");
  check("assistant answers revenue with stats", a.status === 200 && /Revenue this month is \$/.test(a.body.reply) && a.body.stats.length === 4);

  a = await ask(owner.token, "Generate the monthly MIS report.");
  check("assistant links to the MIS report", a.status === 200 && a.body.link.href === "mis-report.html");

  a = await ask(owner.token, "Why are support tickets increasing?");
  check("assistant answers tickets", a.status === 200 && /support tickets were opened/.test(a.body.reply));

  a = await ask(owner.token, "Show customers with pending payments.");
  check("assistant answers overdue payments", a.status === 200 && /overdue/.test(a.body.reply));

  a = await ask(owner.token, "Identify unusual sales activity.");
  check("assistant answers unusual activity", a.status === 200 && /30 days|30-day/.test(a.body.reply));

  a = await ask(owner.token, "Which region needs attention?");
  check("assistant answers regions", a.status === 200 && a.body.stats && a.body.stats.length > 0);

  a = await ask(owner.token, "Who are our top customers?");
  check("assistant answers top customers", a.status === 200 && a.body.stats.length > 0 && a.body.stats.length <= 5);

  a = await ask(owner.token, "How many customers do we have?");
  check("assistant counts customers", a.status === 200 && /You have \d+ customers/.test(a.body.reply));

  a = await ask(owner.token, "What tasks need approval?");
  check("assistant answers tasks", a.status === 200 && /tasks are pending|no pending tasks/.test(a.body.reply));

  a = await ask(owner.token, "How are orders doing?");
  check("assistant answers orders by status", a.status === 200 && a.body.stats.length === 4);

  a = await ask(owner.token, "What is the weather like?");
  check("assistant falls back to help for unknown questions", a.status === 200 && /I'm not sure/.test(a.body.reply));

  res = await fetch(`${BASE}/api/orders`, { headers: json(owner.token) });
  const order = (await res.json()).orders.find((o) => o.status !== "fulfilled");
  const number = order.order_number.replace("#", "");

  a = await ask(owner.token, `Tell me about order ${order.order_number}`);
  check("assistant looks up an order", a.status === 200 && a.body.reply.includes(order.customer_name));

  a = await ask(owner.token, `Mark order #${number} as fulfilled`);
  check(
    "assistant asks for confirmation before changing an order",
    a.status === 200 && a.body.confirm && a.body.confirm.orderId === order.id && a.body.confirm.status === "fulfilled"
  );

  res = await fetch(`${BASE}/api/orders`, { headers: json(owner.token) });
  const unchanged = (await res.json()).orders.find((o) => o.id === order.id);
  check("assistant doesn't change the order by itself", unchanged.status === order.status);

  a = await ask(owner.token, "Show order #99999999");
  check("assistant reports an unknown order", a.status === 200 && /couldn't find/.test(a.body.reply));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
