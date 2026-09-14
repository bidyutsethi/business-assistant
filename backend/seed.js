// CLI entry point: `npm run seed`. Populates the database with realistic
// sample data. Safe to re-run — it wipes and reseeds every time.

require("dotenv").config({ quiet: true });
const pool = require("./db");
const { seedDatabase } = require("./seedData");

seedDatabase()
  .then((summary) => {
    console.log("Seed complete:", summary);
    return pool.end();
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
