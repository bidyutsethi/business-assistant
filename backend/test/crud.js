// Integration test for the CRUD + reports + team + workflows + integrations
// endpoints, run against the real Express app and real SQL with an
// in-memory Postgres-compatible engine standing in for the database.

process.env.JWT_SECRET = "test-secret";
process.env.PORT = "4502";
process.env.CORS_ORIGIN = "http://localhost:8790";
process.env.NODE_ENV = "test";
process.env.ADMIN_SEED_KEY = "test-seed-key";

const { setupTestDb } = require("./setup");
setupTestDb();

const BASE = `http://localhost:${process.env.PORT}`;
const results = [];
const check = (name, cond) => results.push({ name, pass: !!cond });

async function main() {
  require("../server");
  await new Promise((r) => setTimeout(r, 500));

  // Seed a realistic dataset via the admin endpoint (same one used in prod).
  let res = await fetch(`${BASE}/api/admin/seed`, {
    method: "POST",
    headers: { "X-Seed-Key": "test-seed-key" },
  });
  check("seed for CRUD tests succeeds", res.status === 200);

  res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Casey Kim",
      company: "Test Co",
      email: "casey@example.test",
      password: "supersecret123",
    }),
  });
  const { token } = await res.json();
  const auth = { Authorization: `Bearer ${token}` };
  const authJson = { ...auth, "Content-Type": "application/json" };

  // ---------------- Customers ----------------
  res = await fetch(`${BASE}/api/customers`, { headers: auth });
  const customersBody = await res.json();
  check("GET customers returns 200", res.status === 200);
  check("GET customers returns seeded customers with order_count", customersBody.customers.length > 0 && "order_count" in customersBody.customers[0]);
  check(
    "GET customers returns real name/region (not null from a bad GROUP BY)",
    !!customersBody.customers[0].name && !!customersBody.customers[0].region
  );

  res = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ name: "New Test Customer", region: "Europe" }),
  });
  const newCustomer = (await res.json()).customer;
  check("POST customer creates it", res.status === 201 && newCustomer.name === "New Test Customer");

  res = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ name: "", region: "Europe" }),
  });
  check("POST customer rejects empty name", res.status === 400);

  res = await fetch(`${BASE}/api/customers/${newCustomer.id}`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify({ name: "Renamed Customer", region: "APAC" }),
  });
  const renamed = (await res.json()).customer;
  check("PUT customer renames it", res.status === 200 && renamed.name === "Renamed Customer" && renamed.region === "APAC");

  const firstSeededCustomerId = customersBody.customers[0].id;
  res = await fetch(`${BASE}/api/customers/${firstSeededCustomerId}`, { method: "DELETE", headers: auth });
  check("DELETE customer with existing orders is blocked (409)", res.status === 409);

  res = await fetch(`${BASE}/api/customers/${newCustomer.id}`, { method: "DELETE", headers: auth });
  check("DELETE customer with no orders succeeds", res.status === 200);

  // ---------------- Orders ----------------
  res = await fetch(`${BASE}/api/orders`, { headers: auth });
  const ordersBody = await res.json();
  check("GET orders returns 200", res.status === 200);
  check("GET orders includes customer_name via join", ordersBody.orders.length > 0 && !!ordersBody.orders[0].customer_name);

  res = await fetch(`${BASE}/api/orders?status=fulfilled`, { headers: auth });
  const filteredOrders = await res.json();
  check("GET orders filters by status", filteredOrders.orders.every((o) => o.status === "fulfilled"));

  res = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ customerId: firstSeededCustomerId, amount: 1234.5, status: "new" }),
  });
  const newOrder = (await res.json()).order;
  check("POST order creates it with a generated order_number", res.status === 201 && newOrder.order_number.startsWith("#"));

  res = await fetch(`${BASE}/api/orders/${newOrder.id}`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify({ status: "fulfilled" }),
  });
  const updatedOrder = (await res.json()).order;
  check("PUT order updates status", res.status === 200 && updatedOrder.status === "fulfilled");

  res = await fetch(`${BASE}/api/orders/${newOrder.id}`, { method: "DELETE", headers: auth });
  check("DELETE order succeeds", res.status === 200);

  // ---------------- Tasks ----------------
  res = await fetch(`${BASE}/api/tasks`, { headers: auth });
  const tasksBody = await res.json();
  check("GET tasks returns 200", res.status === 200 && tasksBody.tasks.length > 0);

  res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ title: "New test task" }),
  });
  const newTask = (await res.json()).task;
  check("POST task defaults to open status", res.status === 201 && newTask.status === "open");

  res = await fetch(`${BASE}/api/tasks/${newTask.id}`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify({ status: "done" }),
  });
  check("PUT task marks it done", res.status === 200);

  res = await fetch(`${BASE}/api/tasks/${newTask.id}`, { method: "DELETE", headers: auth });
  check("DELETE task succeeds", res.status === 200);

  // ---------------- Support tickets ----------------
  res = await fetch(`${BASE}/api/support`, { headers: auth });
  const ticketsBody = await res.json();
  check("GET support tickets returns 200", res.status === 200 && ticketsBody.tickets.length > 0);

  res = await fetch(`${BASE}/api/support`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ subject: "Test ticket", customerId: firstSeededCustomerId }),
  });
  const newTicket = (await res.json()).ticket;
  check("POST ticket creates it as open", res.status === 201 && newTicket.status === "open");

  res = await fetch(`${BASE}/api/support/${newTicket.id}`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify({ status: "resolved" }),
  });
  check("PUT ticket resolves it", res.status === 200);

  res = await fetch(`${BASE}/api/support/${newTicket.id}`, { method: "DELETE", headers: auth });
  check("DELETE ticket succeeds", res.status === 200);

  // ---------------- Reports ----------------
  res = await fetch(`${BASE}/api/reports/generate?range=this_month`, { headers: auth });
  const reportBody = await res.json();
  check("GET report returns 200", res.status === 200);
  check("report has an executive summary mentioning revenue", typeof reportBody.executiveSummary === "string" && reportBody.executiveSummary.includes("$"));
  check("report has kpis with a numeric revenue", typeof reportBody.kpis.revenue === "number");
  check("report has a trend array", Array.isArray(reportBody.trend));
  check("report has risks and recommendations arrays", Array.isArray(reportBody.risks) && Array.isArray(reportBody.recommendations));

  res = await fetch(`${BASE}/api/reports/generate?range=this_month&region=Europe`, { headers: auth });
  const regionReport = await res.json();
  check("report scoped to a region reports that region", regionReport.region === "Europe");

  // ---------------- Analytics ----------------
  res = await fetch(`${BASE}/api/analytics`, { headers: auth });
  const analyticsBody = await res.json();
  check("GET analytics returns 200", res.status === 200);
  check("analytics has revenueTrend array", Array.isArray(analyticsBody.revenueTrend));
  check("analytics has ordersByStatus array", Array.isArray(analyticsBody.ordersByStatus) && analyticsBody.ordersByStatus.length > 0);
  check("analytics has revenueByRegion array", Array.isArray(analyticsBody.revenueByRegion));
  check("analytics has customerGrowth array", Array.isArray(analyticsBody.customerGrowth));
  check("analytics has ticketTrend array", Array.isArray(analyticsBody.ticketTrend));

  // ---------------- Team ----------------
  res = await fetch(`${BASE}/api/team`, { headers: auth });
  const teamBody = await res.json();
  check("GET team returns 200", res.status === 200);
  check("team includes the signed-up user", teamBody.members.some((m) => m.email === "casey@example.test"));

  // ---------------- Workflows ----------------
  res = await fetch(`${BASE}/api/workflows`, { headers: auth });
  const workflowsBody = await res.json();
  check("GET workflows returns 200", res.status === 200 && workflowsBody.workflows.length > 0);
  check("seeded workflows start enabled", workflowsBody.workflows[0].enabled === true);

  const workflowId = workflowsBody.workflows[0].id;
  res = await fetch(`${BASE}/api/workflows/${workflowId}/toggle`, { method: "PUT", headers: auth });
  const toggledWorkflow = (await res.json()).workflow;
  check("toggling a workflow flips enabled", toggledWorkflow.enabled === false);

  // ---------------- Integrations ----------------
  res = await fetch(`${BASE}/api/integrations`, { headers: auth });
  const integrationsBody = await res.json();
  check("GET integrations returns 200", res.status === 200 && integrationsBody.integrations.length > 0);
  check("seeded integrations start disconnected", integrationsBody.integrations[0].connected === false);

  const integrationId = integrationsBody.integrations[0].id;
  res = await fetch(`${BASE}/api/integrations/${integrationId}/toggle`, { method: "PUT", headers: auth });
  const toggledIntegration = (await res.json()).integration;
  check("toggling an integration flips connected", toggledIntegration.connected === true);

  // ---------------- Profile / password (Settings page) ----------------
  res = await fetch(`${BASE}/api/auth/me`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify({ fullName: "Casey Kim Updated", company: "New Co" }),
  });
  const updatedProfile = (await res.json()).user;
  check("PUT /auth/me updates profile", res.status === 200 && updatedProfile.fullName === "Casey Kim Updated");

  res = await fetch(`${BASE}/api/auth/password`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify({ currentPassword: "wrongpassword", newPassword: "newpassword123" }),
  });
  check("PUT /auth/password rejects wrong current password", res.status === 401);

  res = await fetch(`${BASE}/api/auth/password`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify({ currentPassword: "supersecret123", newPassword: "newpassword123" }),
  });
  check("PUT /auth/password succeeds with correct current password", res.status === 200);

  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "casey@example.test", password: "newpassword123" }),
  });
  check("login works with the new password", res.status === 200);

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
