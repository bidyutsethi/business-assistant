// Integration test for workspaces (isolation, invites, sample data), access
// levels (admin / member / viewer), admin team management, and the built-in
// assistant — run against the real Express app
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

async function signup(fullName, email, inviteCode) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, company: "Test Co", email, password: "supersecret123", inviteCode }),
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

  // ---------------- Signup, workspaces and invites ----------------
  const owner = await signup("Olive Owner", "owner@example.test");
  check("signing up without an invite makes you admin of a new workspace", owner.user.accessLevel === "admin" && owner.user.workspaceName === "Test Co");

  let res = await fetch(`${BASE}/api/admin/seed`, { method: "POST", headers: { "X-Seed-Key": "test-seed-key" } });
  check("seed succeeds", res.status === 200);

  res = await fetch(`${BASE}/api/team`, { headers: json(owner.token) });
  let team = await res.json();
  const inviteCode = team.workspace.inviteCode;
  check("an admin can see the invite code", typeof inviteCode === "string" && inviteCode.length >= 16);

  res = await fetch(`${BASE}/api/auth/invite/${inviteCode}`);
  check("an invite code resolves to its workspace name", res.status === 200 && (await res.json()).workspaceName === "Test Co");
  res = await fetch(`${BASE}/api/auth/invite/not-a-real-code`);
  check("an unknown invite code is a 404", res.status === 404);

  const badInvite = await signup("Nobody", "nobody@example.test", "not-a-real-code");
  check("signup with an unknown invite code is rejected", !badInvite.token && /invite/.test(badInvite.error));

  const member = await signup("Max Member", "member@example.test", inviteCode);
  check("signing up with an invite joins as a member", member.user.accessLevel === "member" && member.user.workspaceName === "Test Co");

  res = await fetch(`${BASE}/api/team`, { headers: json(member.token) });
  check("a non-admin doesn't get the invite code", (await res.json()).workspace.inviteCode === undefined);

  res = await fetch(`${BASE}/api/team`, { headers: json(owner.token) });
  team = await res.json();
  check("the team lists both accounts", team.members.length === 2);
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

  const extra = await signup("Tom Temp", "temp@example.test", inviteCode);
  res = await fetch(`${BASE}/api/team/${extra.user.id}`, { method: "DELETE", headers: json(owner.token) });
  check("an admin can remove a member", res.status === 200);

  res = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: json(extra.token),
    body: JSON.stringify({ name: "Ghost Co", region: "Europe" }),
  });
  check("a removed account's token can no longer write", res.status === 401);

  // ---------------- Workspaces are isolated ----------------
  const get = async (token, p) => (await fetch(`${BASE}/api${p}`, { headers: json(token) })).json();
  const send = (token, method, p, body) =>
    fetch(`${BASE}/api${p}`, { method, headers: json(token), body: body ? JSON.stringify(body) : undefined });

  const mine = {
    customer: (await get(owner.token, "/customers")).customers[0],
    order: (await get(owner.token, "/orders")).orders[0],
    task: (await get(owner.token, "/tasks")).tasks[0],
    ticket: (await get(owner.token, "/support")).tickets[0],
    workflow: (await get(owner.token, "/workflows")).workflows[0],
    integration: (await get(owner.token, "/integrations")).integrations[0],
  };
  const ownerCustomerCount = (await get(owner.token, "/customers")).customers.length;

  const rival = await signup("Rita Rival", "rival@other.test");
  check("a second company gets its own workspace as admin", rival.user.accessLevel === "admin");

  check("a new workspace has no customers", (await get(rival.token, "/customers")).customers.length === 0);
  check("a new workspace has no orders", (await get(rival.token, "/orders")).orders.length === 0);
  check("a new workspace has no tasks", (await get(rival.token, "/tasks")).tasks.length === 0);
  check("a new workspace has no tickets", (await get(rival.token, "/support")).tickets.length === 0);
  check("a new workspace sees only itself on the team", (await get(rival.token, "/team")).members.length === 1);

  const rivalWorkflows = (await get(rival.token, "/workflows")).workflows;
  check("a new workspace gets its own workflows", rivalWorkflows.length > 0 && rivalWorkflows.every((w) => w.id !== mine.workflow.id));
  const rivalIntegrations = (await get(rival.token, "/integrations")).integrations;
  check("a new workspace gets its own integrations", rivalIntegrations.length > 0 && rivalIntegrations.every((i) => i.id !== mine.integration.id));

  const summary = await get(rival.token, "/dashboard/summary");
  check("another workspace's revenue doesn't show on the dashboard", summary.revenue === 0 && summary.customers === 0 && summary.pendingTasks === 0);
  check("another workspace's orders don't show as recent", (await get(rival.token, "/dashboard/recent-orders")).orders.length === 0);
  check("another workspace's tasks don't show on the dashboard", (await get(rival.token, "/dashboard/tasks")).tasks.length === 0);
  const rivalReport = await get(rival.token, "/reports/generate?range=last_quarter");
  check("another workspace's data isn't in the report", rivalReport.kpis.revenue === 0 && rivalReport.kpis.orders === 0 && rivalReport.kpis.tickets === 0);
  const rivalAnalytics = await get(rival.token, "/analytics");
  check("another workspace's data isn't in analytics", rivalAnalytics.ordersByStatus.length === 0 && rivalAnalytics.revenueTrend.length === 0 && rivalAnalytics.ticketTrend.length === 0);

  res = await send(rival.token, "PUT", `/customers/${mine.customer.id}`, { name: "Hijacked", region: "Europe" });
  check("can't rename another workspace's customer", res.status === 404);
  res = await send(rival.token, "DELETE", `/customers/${mine.customer.id}`);
  check("can't delete another workspace's customer", res.status === 404);
  res = await send(rival.token, "POST", "/orders", { customerId: mine.customer.id, amount: 10, status: "new" });
  check("can't create an order for another workspace's customer", res.status === 404);
  res = await send(rival.token, "POST", "/support", { subject: "x", customerId: mine.customer.id });
  check("can't create a ticket for another workspace's customer", res.status === 404);
  res = await send(rival.token, "PUT", `/orders/${mine.order.id}`, { status: "overdue" });
  check("can't update another workspace's order", res.status === 404);
  res = await send(rival.token, "DELETE", `/orders/${mine.order.id}`);
  check("can't delete another workspace's order", res.status === 404);
  res = await send(rival.token, "PUT", `/tasks/${mine.task.id}`, { status: "done" });
  check("can't update another workspace's task", res.status === 404);
  res = await send(rival.token, "DELETE", `/tasks/${mine.task.id}`);
  check("can't delete another workspace's task", res.status === 404);
  res = await send(rival.token, "PUT", `/support/${mine.ticket.id}`, { status: "resolved" });
  check("can't update another workspace's ticket", res.status === 404);
  res = await send(rival.token, "DELETE", `/support/${mine.ticket.id}`);
  check("can't delete another workspace's ticket", res.status === 404);
  res = await send(rival.token, "PUT", `/workflows/${mine.workflow.id}/toggle`);
  check("can't toggle another workspace's workflow", res.status === 404);
  res = await send(rival.token, "PUT", `/integrations/${mine.integration.id}/toggle`);
  check("can't toggle another workspace's integration", res.status === 404);

  res = await send(rival.token, "PUT", `/team/${owner.user.id}/access`, { accessLevel: "viewer" });
  check("an admin can't change access in another workspace", res.status === 404);
  res = await send(rival.token, "POST", `/team/${owner.user.id}/reset-password`);
  check("an admin can't reset a password in another workspace", res.status === 404);
  res = await send(rival.token, "DELETE", `/team/${member.user.id}`);
  check("an admin can't remove someone from another workspace", res.status === 404);

  const after = {
    customer: (await get(owner.token, "/customers")).customers.find((c) => c.id === mine.customer.id),
    order: (await get(owner.token, "/orders")).orders.find((o) => o.id === mine.order.id),
    task: (await get(owner.token, "/tasks")).tasks.find((t) => t.id === mine.task.id),
    workflow: (await get(owner.token, "/workflows")).workflows.find((w) => w.id === mine.workflow.id),
  };
  check(
    "the first workspace's data is untouched by all of that",
    after.customer.name === mine.customer.name && after.order.status === mine.order.status &&
      after.task.status === mine.task.status && after.workflow.enabled === mine.workflow.enabled
  );

  let r = await ask(rival.token, "How many customers do we have?");
  check("the assistant only counts its own workspace", /You have 0 customers/.test(r.body.reply));
  r = await ask(rival.token, `Show order ${mine.order.order_number}`);
  check("the assistant can't look up another workspace's order", /couldn't find/.test(r.body.reply));
  r = await ask(rival.token, `Mark order ${mine.order.order_number} as overdue`);
  check("the assistant won't offer to change another workspace's order", !r.body.confirm);

  // ---------------- Sample data for a new workspace ----------------
  const invited = await signup("Ian Invited", "ian@other.test", (await get(rival.token, "/team")).workspace.inviteCode);
  res = await send(invited.token, "POST", "/team/sample-data");
  check("only an admin can load sample data", res.status === 403);
  res = await send(rival.token, "POST", "/team/sample-data");
  check("an admin can load sample data into an empty workspace", res.status === 200);
  check("sample data appears in that workspace", (await get(rival.token, "/customers")).customers.length > 0);
  check("teammates see the same sample data", (await get(invited.token, "/orders")).orders.length > 0);
  res = await send(rival.token, "POST", "/team/sample-data");
  check("sample data can't be loaded over existing data", res.status === 409);
  check("loading sample data leaves other workspaces alone", (await get(owner.token, "/customers")).customers.length === ownerCustomerCount);
  check("the first workspace's order still exists", (await get(owner.token, "/orders")).orders.some((o) => o.id === mine.order.id));

  // ---------------- Regenerating the invite ----------------
  res = await send(invited.token, "POST", "/team/invite/regenerate");
  check("only an admin can regenerate the invite", res.status === 403);
  res = await send(owner.token, "POST", "/team/invite/regenerate");
  const fresh = (await res.json()).inviteCode;
  check("regenerating gives a new invite code", res.status === 200 && fresh !== inviteCode);
  const stale = await signup("Late Larry", "late@example.test", inviteCode);
  check("the old invite code stops working", !stale.token);

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
