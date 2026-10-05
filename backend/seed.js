// CLI entry point: `npm run seed`. Fills the oldest workspace with realistic
// sample data. Safe to re-run — it replaces that workspace's customers,
// orders, tickets and tasks every time, and leaves other workspaces alone.

require("dotenv").config({ quiet: true });
const pool = require("./db");
const { seedDatabase } = require("./seedData");

pool
  .query(`SELECT id FROM workspaces ORDER BY id ASC LIMIT 1`)
  .then((result) => {
    if (!result.rows.length) throw new Error("No workspace exists yet — sign up in the app first.");
    return seedDatabase(result.rows[0].id);
  })
  .then((summary) => {
    console.log("Seed complete:", summary);
    return pool.end();
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
