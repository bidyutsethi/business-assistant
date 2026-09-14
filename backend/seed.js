// Populates the database with realistic sample data so the dashboard has
// something real to show. Safe to re-run — it wipes and reseeds every time.

require("dotenv").config();
const pool = require("./db");

// Small deterministic PRNG so seed data is reproducible across runs.
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
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

const REGIONS = ["North America", "Europe", "APAC"];

const CUSTOMER_NAMES = [
  "Nimbus Retail Group", "Harborline Logistics", "Meridian Health Co.",
  "Blue Anchor Traders", "Cascade Financial", "Solstice Education",
  "Ironclad Manufacturing", "Verdant Foods", "Lumen Technologies",
  "Northgate Professional Services", "Aurelia Consulting", "Pacific Rim Apparel",
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

async function seed() {
  console.log("Seeding database...");

  await pool.query(`
    TRUNCATE TABLE support_tickets, orders, tasks, customers RESTART IDENTITY CASCADE
  `);

  // --- Customers -----------------------------------------------------
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

  // --- Orders (spread across the last 6 months) -----------------------
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

  // Make sure the most recent handful of orders read cleanly on the dashboard.
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

  // --- Support tickets (last 14 days, weighted toward APAC + recent) --
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

  // --- Tasks -----------------------------------------------------------
  for (const t of TASK_TITLES) {
    await pool.query(`INSERT INTO tasks (title, status) VALUES ($1, $2)`, [t.title, t.status]);
  }

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
