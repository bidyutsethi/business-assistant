require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const pool = require("./db");
const { migrateLegacyData } = require("./workspaces");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const adminRoutes = require("./routes/admin");
const customersRoutes = require("./routes/customers");
const ordersRoutes = require("./routes/orders");
const tasksRoutes = require("./routes/tasks");
const supportRoutes = require("./routes/support");
const reportsRoutes = require("./routes/reports");
const teamRoutes = require("./routes/team");
const workflowsRoutes = require("./routes/workflows");
const integrationsRoutes = require("./routes/integrations");
const analyticsRoutes = require("./routes/analytics");
const assistantRoutes = require("./routes/assistant");
const demoRequestsRoutes = require("./routes/demoRequests");

const app = express();

// Render (and most hosts) put a proxy in front of the app; trusting it makes
// req.ip the visitor's address rather than the proxy's.
app.set("trust proxy", 1);

const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:8790,https://bidyutsethi.github.io"
)
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/workflows", workflowsRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/demo-requests", demoRequestsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Express 5 forwards rejected promises from async route handlers here.
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  res.status(500).json({ error: "Something went wrong." });
});

async function ensureSchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schemaSql);
  await migrateLegacyData();
}

const port = process.env.PORT || 4000;

ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`Business Assistant API listening on port ${port}`));
  })
  .catch((err) => {
    console.error("Failed to apply database schema on startup:", err);
    process.exit(1);
  });
