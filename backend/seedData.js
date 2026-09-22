// Core seed logic, shared by the CLI script (npm run seed) and the
// protected /api/admin/seed route (used when Shell access isn't available,
// e.g. on Render's free plan).

const pool = require("./db");

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ["North America", "Europe", "APAC"];

const CUSTOMER_NAMES = [
  "Nimbus Retail Group", "Harborline Logistics", "Meridian Health Co.",
  "Blue Anchor Traders", "Cascade Financial", "Solstice Education",
  "Ironclad Manufacturing", "Verdant Foods", "Lumen Technologies",
  "Northgate Professional Services", "Aurelia Consulting", "Pacific Rim Apparel",
];

const WORKFLOWS = [
  {
    name: "Customer complaint handling",
    description:
      "Customer submits a complaint, AI understands the issue, creates a support ticket, checks order data, responds to the customer, and escalates if necessary.",
    trigger: "Complaint submitted",
    action: "Create ticket + respond",
  },
  {
    name: "Sales performance reporting",
    description:
      "When sales data updates, analyse performance, generate an MIS report, identify unusual trends, and notify management.",
    trigger: "Sales data updated",
    action: "Generate MIS report",
  },
  {
    name: "Appointment booking",
    description:
      "Customer requests an appointment, availability is checked, the appointment is booked, the database is updated, and a confirmation is sent.",
    trigger: "Appointment requested",
    action: "Book + confirm",
  },
  {
    name: "Overdue payment follow-up",
    description: "When an order's payment becomes overdue, send a reminder and flag the account for review.",
    trigger: "Order marked overdue",
    action: "Send reminder",
  },
];

const INTEGRATIONS = [
  { name: "WhatsApp", category: "communication" },
  { name: "Email", category: "communication" },
  { name: "Slack", category: "communication" },
  { name: "Microsoft Teams", category: "communication" },
  { name: "MySQL", category: "data" },
  { name: "PostgreSQL", category: "data" },
  { name: "Excel", category: "data" },
  { name: "CSV", category: "data" },
  { name: "CRM", category: "business" },
  { name: "ERP", category: "business" },
  { name: "Helpdesk", category: "business" },
  { name: "Calendar", category: "business" },
  { name: "REST APIs", category: "infrastructure" },
  { name: "Webhooks", category: "infrastructure" },
];

const TASK_TITLES = [
  { title: "Approve refund — Order #10482", status: "approval" },
  { title: "Review APAC support spike", status: "open" },
  { title: "Send weekly MIS report", status: "scheduled" },
  { title: "Follow up with Europe renewals", status: "open" },
  { title: "Reconcile last month's invoices", status: "open" },
  { title: "Onboard new support agent", status: "scheduled" },
  { title: "Audit pending customer refunds", status: "approval" },
  { title: "Prepare board summary deck", status: "open" },
];

async function seedDatabase() {
  const rand = mulberry32(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

  await pool.query(`
    TRUNCATE TABLE support_tickets RESTART IDENTITY CASCADE;
    TRUNCATE TABLE orders RESTART IDENTITY CASCADE;
    TRUNCATE TABLE tasks RESTART IDENTITY CASCADE;
    TRUNCATE TABLE customers RESTART IDENTITY CASCADE;
  `);

  const customerIds = [];
  for (const name of CUSTOMER_NAMES) {
    const region = pick(REGIONS);
    const monthsAgo = randInt(1, 10);
    const { rows } = await pool.query(
      `INSERT INTO customers (name, region, created_at)
       VALUES ($1, $2, now() - ($3 || ' months')::interval)
       RETURNING id`,
      [name, region, monthsAgo]
    );
    customerIds.push({ id: rows[0].id, region });
  }

  const statuses = ["fulfilled", "fulfilled", "fulfilled", "processing", "new", "overdue"];
  let orderNum = 10420;
  for (let monthsBack = 5; monthsBack >= 0; monthsBack--) {
    const ordersThisMonth = randInt(14, 24);
    for (let i = 0; i < ordersThisMonth; i++) {
      const customer = pick(customerIds);
      const amount = randInt(180, 9800);
      const dayOffset = randInt(0, 27);
      orderNum += 1;
      await pool.query(
        `INSERT INTO orders (order_number, customer_id, amount, status, region, created_at)
         VALUES ($1, $2, $3, $4, $5,
           date_trunc('month', now()) - ($6 || ' months')::interval + ($7 || ' days')::interval)`,
        [`#${orderNum}`, customer.id, amount, pick(statuses), customer.region, monthsBack, dayOffset]
      );
    }
  }

  const recentStatuses = ["fulfilled", "processing", "new", "overdue"];
  for (let i = 0; i < 4; i++) {
    const customer = pick(customerIds);
    orderNum += 1;
    await pool.query(
      `INSERT INTO orders (order_number, customer_id, amount, status, region, created_at)
       VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' hours')::interval)`,
      [`#${orderNum}`, customer.id, randInt(200, 4200), recentStatuses[i], customer.region, i * 6]
    );
  }

  const subjects = [
    "Order status inquiry", "Damaged item complaint", "Appointment request",
    "Billing question", "Login issue", "Refund request", "Delivery delay",
    "Account access", "Product availability", "Invoice correction",
  ];
  for (let i = 0; i < 40; i++) {
    const customer = pick(customerIds);
    const recentBias = rand() < 0.55 ? randInt(0, 6) : randInt(7, 13);
    const region = rand() < 0.4 ? "APAC" : pick(REGIONS);
    await pool.query(
      `INSERT INTO support_tickets (subject, customer_id, region, status, created_at)
       VALUES ($1, $2, $3, $4, now() - ($5 || ' days')::interval)`,
      [pick(subjects), customer.id, region, pick(["open", "pending", "resolved"]), recentBias]
    );
  }

  for (const t of TASK_TITLES) {
    await pool.query(`INSERT INTO tasks (title, status) VALUES ($1, $2)`, [t.title, t.status]);
  }

  // Workflows/integrations are reference data users can toggle — seed once,
  // don't wipe their state on every re-seed of the transactional tables.
  const workflowCount = await pool.query(`SELECT COUNT(*)::int AS count FROM workflows`);
  if (workflowCount.rows[0].count === 0) {
    for (const w of WORKFLOWS) {
      await pool.query(
        `INSERT INTO workflows (name, description, trigger_label, action_label, enabled) VALUES ($1, $2, $3, $4, true)`,
        [w.name, w.description, w.trigger, w.action]
      );
    }
  }

  const integrationCount = await pool.query(`SELECT COUNT(*)::int AS count FROM integrations`);
  if (integrationCount.rows[0].count === 0) {
    for (const i of INTEGRATIONS) {
      await pool.query(`INSERT INTO integrations (name, category, connected) VALUES ($1, $2, false)`, [
        i.name,
        i.category,
      ]);
    }
  }

  return {
    customers: customerIds.length,
    orders: orderNum - 10420,
    supportTickets: 40,
    tasks: TASK_TITLES.length,
  };
}

module.exports = { seedDatabase };
